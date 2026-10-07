import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import crypto from 'crypto'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarAdmin } from '@/lib/auth/admin'
import { parseExcelData, type MappedSolicitud, type ParsedRow } from '@/lib/utils/excel-mapping'
import { parsePdfTallerData, reconstruirLineas, type PdfTextItem } from '@/lib/utils/pdf-orden-mapping'
import { enviarSeleccionHorarioCliente } from '@/lib/services/whatsapp.service'

/**
 * Extrae las líneas de texto de un PDF (formato TALLER MABE) preservando el
 * layout visual: pdf.js entrega items posicionados y reconstruirLineas los
 * agrupa por renglón. unpdf se importa dinámico para no cargarlo en cold
 * start de las cargas Excel.
 */
async function extraerLineasPdf(buffer: ArrayBuffer): Promise<string[]> {
  const { getDocumentProxy } = await import('unpdf')
  const pdf = await getDocumentProxy(new Uint8Array(buffer))
  const lineas: string[] = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    const items: PdfTextItem[] = []
    for (const item of content.items) {
      if ('str' in item && Array.isArray(item.transform)) {
        items.push({ str: item.str, x: item.transform[4], y: item.transform[5] })
      }
    }
    lineas.push(...reconstruirLineas(items))
  }
  return lineas
}

/**
 * Marca como inválidas las filas cuyo N° de orden MABE (numero_serie_factura)
 * ya existe en solicitudes_servicio — evita duplicados al re-subir el mismo
 * archivo (gap conocido de la carga Excel, cerrado 2026-08-31). Fail-open:
 * si la consulta falla, no bloquea la carga.
 */
async function marcarDuplicados(parsed: ParsedRow[]): Promise<void> {
  const ordenes = parsed
    .filter(r => r.mapped?.es_garantia && r.mapped.numero_serie_factura)
    .map(r => r.mapped!.numero_serie_factura)
  if (ordenes.length === 0) return

  const { data, error } = await supabase
    .from('solicitudes_servicio')
    .select('numero_serie_factura')
    .in('numero_serie_factura', ordenes)
    .eq('es_garantia', true)

  if (error) {
    console.error('[carga-masiva] Error consultando duplicados:', error.message)
    return
  }

  const existentes = new Set((data ?? []).map(d => d.numero_serie_factura))
  const vistasEnArchivo = new Set<string>()
  for (const row of parsed) {
    if (!row.mapped?.es_garantia || !row.mapped.numero_serie_factura) continue
    const orden = row.mapped.numero_serie_factura
    if (existentes.has(orden)) {
      row.errors.push(`Orden ${orden} ya existe en el sistema (duplicado)`)
      row.mapped = null
    } else if (vistasEnArchivo.has(orden)) {
      row.errors.push(`Orden ${orden} repetida dentro del mismo archivo`)
      row.mapped = null
    } else {
      vistasEnArchivo.add(orden)
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Parse multipart form data
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const defaultPago = Number(formData.get('defaultPago') ?? 80000)
    const defaultHorario1 = (formData.get('defaultHorario1') as string) || 'Lunes a Viernes 8:00 AM - 12:00 PM'
    const defaultHorario2 = (formData.get('defaultHorario2') as string) || 'Lunes a Viernes 2:00 PM - 5:00 PM'
    const notificar = formData.get('notificar') === 'true'
    const dryRun = formData.get('dryRun') === 'true'

    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo excede el tamaño máximo de 10MB' }, { status: 400 })
    }

    // Validate file type
    const esPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ]
    const esExcel = validTypes.includes(file.type) || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
    if (!esPdf && !esExcel) {
      return NextResponse.json({ error: 'Formato de archivo no soportado. Usa .xlsx, .xls o .pdf (orden TALLER MABE)' }, { status: 400 })
    }

    // Validate defaultPago
    if (isNaN(defaultPago) || defaultPago < 0 || defaultPago > 10000000) {
      return NextResponse.json({ error: 'Valor de pago inválido' }, { status: 400 })
    }

    // Parse file → ParsedRow[] (mismo contrato para Excel y PDF)
    const buffer = await file.arrayBuffer()
    let parsed: ParsedRow[]
    let totalRawRows: number
    let sheetName: string

    if (esPdf) {
      const lineas = await extraerLineasPdf(buffer)
      const resultado = parsePdfTallerData(lineas, { defaultHorario2 })
      parsed = resultado.parsed
      totalRawRows = resultado.totalRawRows
      sheetName = 'PDF TALLER MABE'

      if (totalRawRows === 0) {
        return NextResponse.json({
          error: 'No se encontraron órdenes en el PDF. Verifica que sea el formato TALLER de MABE (con "NO. ORDEN:").',
        }, { status: 400 })
      }
    } else {
      const workbook = XLSX.read(buffer, { type: 'array' })
      sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

      const resultado = parseExcelData(rows, {
        defaultPago,
        defaultHorario1,
        defaultHorario2,
      })
      parsed = resultado.parsed
      totalRawRows = resultado.totalRawRows

      if (totalRawRows === 0) {
        return NextResponse.json({
          error: 'No se encontraron datos válidos en el archivo. Verifica que el formato sea BITÁCORA SERVICIOS PROGRAMADOS.',
        }, { status: 400 })
      }
    }

    // Skip órdenes de garantía que ya existen (re-subida del mismo archivo)
    await marcarDuplicados(parsed)

    // Separate valid and invalid rows
    const valid = parsed.filter(r => r.mapped !== null)
    const invalid = parsed.filter(r => r.mapped === null)

    // Dry run: solo preview (la UI lo usa para PDF, que no puede parsear en el browser)
    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        sheetName,
        totalFilas: totalRawRows,
        validas: valid.length,
        invalidas: invalid.length,
        preview: parsed.map(r => ({
          fila: r.fila,
          raw: r.raw,
          mapped: r.mapped,
          errors: r.errors,
          warnings: r.warnings,
        })),
      })
    }

    // Insert valid rows into Supabase
    const results: { fila: number; success: boolean; id?: string; error?: string }[] = []
    const insertedIds: string[] = []

    // Insert con customer-first scheduling: estado=pendiente_horario y
    // horario_token. NO notificamos técnicos hasta que el cliente confirme
    // horario via /horario/{token} → /api/confirmar-horario. Esto unifica
    // el flujo de garantía con el flujo particular (ambos arrancan con el
    // cliente eligiendo fecha y aceptando T&C).
    for (const row of valid) {
      // Strip modelo_equipo before inserting (not a DB column, embedded in novedades_equipo)
      const { modelo_equipo: _modelo, ...solicitud } = row.mapped as MappedSolicitud & { modelo_equipo?: string }

      const horarioToken = crypto.randomUUID()
      const dataToInsert = {
        ...solicitud,
        estado: 'pendiente_horario' as const,
        horario_token: horarioToken,
        // cliente_token tiene DEFAULT gen_random_uuid() en la DB (migración
        // 20260506_cliente_self_service.sql), así que se autogenera.
      }

      const { data, error } = await supabase
        .from('solicitudes_servicio')
        .insert([dataToInsert])
        .select('id')
        .single()

      if (error) {
        results.push({
          fila: row.fila,
          success: false,
          error: error.code === '23505'
            ? 'Solicitud duplicada'
            : error.message,
        })
      } else {
        results.push({ fila: row.fila, success: true, id: data.id })
        insertedIds.push(data.id)
      }
    }

    // Send schedule selection template to each customer (customer-first).
    // Si admin desactivó el toggle `notificar`, las solicitudes quedan en
    // pendiente_horario silenciosamente — el cron horario-recordatorio las
    // empujará a las 24h o admin puede usar el botón "Reenviar selección
    // de horario al cliente" en /admin/solicitudes/[id].
    let templatesEnviadas = 0
    const sendErrors: string[] = []

    if (notificar) {
      for (const row of valid) {
        const matchingResult = results.find(r => r.fila === row.fila)
        if (!matchingResult?.success || !matchingResult.id) continue

        try {
          const result = await enviarSeleccionHorarioCliente(matchingResult.id)
          if (result.ok) {
            templatesEnviadas++
          } else if (result.error && !sendErrors.includes(result.error)) {
            sendErrors.push(result.error)
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          console.warn(`[carga-masiva] enviarSeleccionHorarioCliente falló para fila ${row.fila}:`, msg)
          if (!sendErrors.includes(msg)) sendErrors.push(msg)
        }
      }
    }

    return NextResponse.json({
      sheetName,
      totalFilas: totalRawRows,
      validas: valid.length,
      invalidas: invalid.length,
      insertadas: results.filter(r => r.success).length,
      erroresInsert: results.filter(r => !r.success).length,
      // Mantenemos `notificados` por back-compat con la UI; ahora cuenta
      // plantillas de selección de horario enviadas al cliente.
      notificados: templatesEnviadas,
      notifDiagnostico: sendErrors.length > 0 ? sendErrors : undefined,
      detalles: results,
      filasInvalidas: invalid.map(r => ({
        fila: r.fila,
        nombre: r.raw.cliente_nombre,
        errors: r.errors,
        warnings: r.warnings,
      })),
    })
  } catch (error) {
    console.error('Error en carga masiva:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/carga-masiva
 * Deletes a batch of solicitudes by their IDs.
 * Also removes associated notificaciones_whatsapp records.
 * Body: { ids: string[] }
 */
export async function DELETE(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json()
    const ids: string[] = body.ids

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'Se requiere un array de IDs' }, { status: 400 })
    }

    if (ids.length > 500) {
      return NextResponse.json({ error: 'Máximo 500 solicitudes por operación' }, { status: 400 })
    }

    // 1. Delete associated notifications
    const { error: notifErr } = await supabase
      .from('notificaciones_whatsapp')
      .delete()
      .in('solicitud_id', ids)

    if (notifErr) {
      console.error('[carga-masiva DELETE] Error deleting notifications:', notifErr)
    }

    // 2. Delete associated evidence
    const { error: evidErr } = await supabase
      .from('evidencias_servicio')
      .delete()
      .in('solicitud_id', ids)

    if (evidErr) {
      console.error('[carga-masiva DELETE] Error deleting evidence:', evidErr)
    }

    // 3. Delete solicitudes
    const { error: solErr, count } = await supabase
      .from('solicitudes_servicio')
      .delete({ count: 'exact' })
      .in('id', ids)

    if (solErr) {
      return NextResponse.json(
        { error: `Error eliminando solicitudes: ${solErr.message}` },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      eliminadas: count ?? ids.length,
      mensaje: `${count ?? ids.length} solicitud(es) eliminada(s) correctamente`,
    })
  } catch (error) {
    console.error('Error en eliminación masiva:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
