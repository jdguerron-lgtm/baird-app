import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import crypto from 'crypto'
import { supabase } from '@/lib/supabase'
import { verificarAdmin } from '@/lib/auth/admin'
import { parseExcelData, type MappedSolicitud } from '@/lib/utils/excel-mapping'
import { enviarSeleccionHorarioCliente } from '@/lib/services/whatsapp.service'

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

    if (!file) {
      return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'El archivo excede el tamaño máximo de 10MB' }, { status: 400 })
    }

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ]
    if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      return NextResponse.json({ error: 'Formato de archivo no soportado. Usa .xlsx o .xls' }, { status: 400 })
    }

    // Validate defaultPago
    if (isNaN(defaultPago) || defaultPago < 0 || defaultPago > 10000000) {
      return NextResponse.json({ error: 'Valor de pago inválido' }, { status: 400 })
    }

    // Read Excel file
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 })

    // Parse and map rows
    const { parsed, totalRawRows } = parseExcelData(rows, {
      defaultPago,
      defaultHorario1,
      defaultHorario2,
    })

    if (totalRawRows === 0) {
      return NextResponse.json({
        error: 'No se encontraron datos válidos en el archivo. Verifica que el formato sea BITÁCORA SERVICIOS PROGRAMADOS.',
      }, { status: 400 })
    }

    // Separate valid and invalid rows
    const valid = parsed.filter(r => r.mapped !== null)
    const invalid = parsed.filter(r => r.mapped === null)

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
