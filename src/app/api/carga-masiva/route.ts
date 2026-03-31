import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { parseExcelData, type MappedSolicitud } from '@/lib/utils/excel-mapping'

export async function POST(req: NextRequest) {
  try {
    // Verify auth
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const token = authHeader.split(' ')[1]
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 })
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

    for (const row of valid) {
      // Strip modelo_equipo before inserting (not a DB column, embedded in novedades_equipo)
      const { modelo_equipo: _modelo, ...solicitud } = row.mapped as MappedSolicitud & { modelo_equipo?: string }

      const { data, error } = await supabase
        .from('solicitudes_servicio')
        .insert([solicitud])
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

    // Optionally notify technicians for each inserted solicitud
    let notificados = 0
    if (notificar && insertedIds.length > 0) {
      for (const id of insertedIds) {
        try {
          const notifyRes = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/notify`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ solicitudId: id }),
          })
          if (notifyRes.ok) notificados++
        } catch {
          // Notification failure is non-blocking
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
      notificados,
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
