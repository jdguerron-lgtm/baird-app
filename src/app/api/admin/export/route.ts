import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { verificarAdmin } from '@/lib/auth/admin'
import { CODIGOS_FALLA, type CodigoFalla } from '@/lib/constants/codigos-falla'
import { precioClienteServicio } from '@/types/solicitud'

export const maxDuration = 60

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://lineablanca.bairdservice.com'

// Lookup canónico de complejidad por número de falla.
// La complejidad oficial vive en CODIGOS_FALLA (catálogo MABE),
// no en la percepción que el técnico declara en triaje_resultado.
const FALLA_POR_CODIGO: Map<number, CodigoFalla> = new Map(
  CODIGOS_FALLA.map((f) => [f.codigo, f]),
)

function lookupFalla(codigo: unknown): CodigoFalla | null {
  if (codigo === null || codigo === undefined || codigo === '') return null
  const n = typeof codigo === 'number' ? codigo : Number(codigo)
  if (!Number.isFinite(n)) return null
  return FALLA_POR_CODIGO.get(n) ?? null
}

type Row = Record<string, unknown>

function fmt(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function fmtDate(value: unknown): string {
  if (!value) return ''
  try {
    return new Date(String(value)).toLocaleString('es-CO', { timeZone: 'America/Bogota' })
  } catch {
    return String(value)
  }
}

/**
 * Aplica un hipervínculo a la celda correspondiente en una hoja XLSX.
 * Recorre cada fila y, si el valor de la columna `colKey` parece una URL,
 * convierte la celda en hyperlink. xlsx.utils.json_to_sheet ya escribió
 * el texto; aquí solo le sumamos el campo .l.
 */
function applyHyperlinks(ws: XLSX.WorkSheet, rows: Row[], colKey: string): void {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const colIdx = headers.indexOf(colKey)
  if (colIdx < 0) return

  rows.forEach((row, i) => {
    const url = row[colKey]
    if (typeof url !== 'string' || !url.startsWith('http')) return
    const cellRef = XLSX.utils.encode_cell({ c: colIdx, r: i + 1 }) // +1 por la cabecera
    const cell = ws[cellRef]
    if (cell) {
      cell.l = { Target: url, Tooltip: 'Abrir' }
    }
  })
}

/**
 * POST /api/admin/export
 *
 * Genera un Excel (xlsx) con un resumen completo de las solicitudes
 * solicitadas. Si no se pasan IDs, exporta TODAS las solicitudes.
 *
 * Cada solicitud se acompaña de su técnico asignado, evidencias, fotos,
 * notificaciones a técnicos, eventos de auditoría, GPS pings, repuestos
 * pendientes y la cotización (cuando aplica). Cada bloque queda en su
 * propia hoja para que admin pueda filtrar/ordenar fácilmente.
 *
 * Body: { ids?: string[] } — array opcional de UUID de solicitud.
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const ids: string[] | undefined = Array.isArray(body?.ids) && body.ids.length > 0
      ? body.ids
      : undefined

    // 1. Solicitudes (todas las columnas)
    // Sin `ids` se exporta todo, pero con tope defensivo: cada solicitud
    // arrastra 6 tablas relacionadas y el Excel se arma en memoria, así que
    // una tabla grande sin límite agota la función (OOM/timeout).
    const EXPORT_MAX = 5000
    let solQuery = supabase
      .from('solicitudes_servicio')
      .select('*')
      .order('created_at', { ascending: false })

    if (ids) {
      solQuery = solQuery.in('id', ids)
    } else {
      solQuery = solQuery.limit(EXPORT_MAX)
    }

    const { data: solicitudes, error: solErr } = await solQuery

    if (solErr) {
      return NextResponse.json({ error: `Error cargando solicitudes: ${solErr.message}` }, { status: 500 })
    }

    if (!solicitudes || solicitudes.length === 0) {
      return NextResponse.json({ error: 'No hay solicitudes para exportar' }, { status: 404 })
    }

    const solIds = solicitudes.map((s: { id: string }) => s.id)

    // 2. Tecnicos asignados (para nombre/whatsapp del asignado en cada fila)
    const tecnicoIds = [...new Set(
      solicitudes
        .filter((s: { tecnico_asignado_id: string | null }) => s.tecnico_asignado_id)
        .map((s: { tecnico_asignado_id: string }) => s.tecnico_asignado_id)
    )]

    const tecnicoMap = new Map<string, { nombre_completo: string; whatsapp: string; ciudad_pueblo: string; numero_documento: string | null }>()

    if (tecnicoIds.length > 0) {
      const { data: tecs } = await supabase
        .from('tecnicos')
        .select('id, nombre_completo, whatsapp, ciudad_pueblo, numero_documento')
        .in('id', tecnicoIds)

      tecs?.forEach((t: { id: string; nombre_completo: string; whatsapp: string; ciudad_pueblo: string; numero_documento: string | null }) => {
        tecnicoMap.set(t.id, t)
      })
    }

    // 3. Notificaciones WhatsApp
    const { data: notifs } = await supabase
      .from('notificaciones_whatsapp')
      .select('*')
      .in('solicitud_id', solIds)
      .order('enviado_at', { ascending: false })

    const notifTecIds = [...new Set(
      (notifs ?? [])
        .map((n: { tecnico_id: string }) => n.tecnico_id)
        .filter(Boolean)
    )]

    const tecnicoNotifMap = new Map<string, { nombre_completo: string; whatsapp: string }>()
    if (notifTecIds.length > 0) {
      const { data: tecs } = await supabase
        .from('tecnicos')
        .select('id, nombre_completo, whatsapp')
        .in('id', notifTecIds)
      tecs?.forEach((t: { id: string; nombre_completo: string; whatsapp: string }) => {
        tecnicoNotifMap.set(t.id, t)
      })
    }

    // 4. Evidencias
    const { data: evidencias } = await supabase
      .from('evidencias_servicio')
      .select('*')
      .in('solicitud_id', solIds)
      .order('created_at', { ascending: false })

    // 5. Eventos (audit log)
    const { data: eventos } = await supabase
      .from('solicitud_eventos')
      .select('*')
      .in('solicitud_id', solIds)
      .order('ocurrido_at', { ascending: false })

    // 6. GPS pings
    const { data: gpsPings } = await supabase
      .from('gps_pings')
      .select('*')
      .in('solicitud_id', solIds)
      .order('capturado_at', { ascending: false })

    // 7. Repuestos pendientes
    const { data: repuestos } = await supabase
      .from('repuestos_pendientes')
      .select('*')
      .in('solicitud_id', solIds)
      .order('solicitado_at', { ascending: false })

    // ─────────────────────────────────────────────────────────────────
    // Construcción de hojas
    // ─────────────────────────────────────────────────────────────────

    const wb = XLSX.utils.book_new()

    // HOJA 1: Solicitudes (flat)
    const solRows: Row[] = solicitudes.map((s: Record<string, unknown>) => {
      const tec = s.tecnico_asignado_id ? tecnicoMap.get(s.tecnico_asignado_id as string) : null
      const triaje = (s.triaje_resultado ?? null) as Record<string, unknown> | null
      const cotizacion = (s.cotizacion ?? null) as Record<string, unknown> | null
      const fallaInfo = lookupFalla(triaje?.codigo_falla)
      return {
        ID: s.id,
        Creada: fmtDate(s.created_at),
        Estado: s.estado,
        'Es garantía': s.es_garantia ? 'Sí' : 'No',
        Cliente: s.cliente_nombre,
        Teléfono: s.cliente_telefono,
        Dirección: s.direccion,
        Ciudad: s.ciudad_pueblo,
        Zona: s.zona_servicio,
        'Tipo equipo': s.tipo_equipo,
        Marca: s.marca_equipo,
        'Tipo solicitud': s.tipo_solicitud,
        'Problema reportado': s.novedades_equipo,
        'Serie/Factura': s.numero_serie_factura,
        // pago_tecnico = NETO al técnico. El valor al cliente (catálogo o total
        // cotizado, IVA incl.) se deriva aparte para conciliación / DIAN.
        'Pago técnico neto (COP)': s.pago_tecnico,
        'Valor al cliente (COP)': s.es_garantia
          ? 0
          : precioClienteServicio(
              String(s.tipo_equipo ?? ''),
              String(s.tipo_solicitud ?? ''),
              Boolean(s.es_garantia),
              cotizacion,
            ),
        'Horario sugerido 1': s.horario_visita_1,
        'Horario sugerido 2': s.horario_visita_2,
        'Horario confirmado': s.horario_confirmado,
        'Confirmado en': fmtDate(s.horario_confirmado_at),
        'Notificados a técnicos en': fmtDate(s.notificados_at),
        'T&C aceptados en': fmtDate(s.tyc_aceptados_at),
        'T&C versión': s.tyc_version,
        'Técnico asignado': tec?.nombre_completo ?? '',
        'WhatsApp técnico': tec?.whatsapp ?? '',
        'Doc. técnico': tec?.numero_documento ?? '',
        'Siguiente paso': s.siguiente_paso,
        'Detalle siguiente paso': s.siguiente_paso_detalle,
        'Siguiente paso en': fmtDate(s.siguiente_paso_at),
        'Verificación paso decisión': s.verificacion_paso_decision,
        'Verificación paso en': fmtDate(s.verificacion_paso_at),
        'Verificación paso comentario': s.verificacion_paso_comentario,
        'Cancelado en': fmtDate(s.cancelado_at),
        'Cancelado por': s.cancelado_por,
        'Motivo cancelación': s.motivo_cancelacion,
        'Cancelado tarde': s.cancelado_tarde ? 'Sí' : 'No',
        'Reagendamientos': s.reagendamientos_count ?? 0,
        'Último reagendado': fmtDate(s.ultimo_reagendado_at),
        'Diagnóstico técnico': triaje?.diagnostico_tecnico ?? '',
        'Código falla': triaje?.codigo_falla ?? '',
        'Descripción falla': fallaInfo?.descripcion ?? '',
        'Familia falla': fallaInfo?.familia ?? '',
        'Sistema falla': fallaInfo?.sistema ?? '',
        'Componente falla': fallaInfo?.componente ?? '',
        'Complejidad': fallaInfo?.complejidad ?? '',
        'Código complejidad': triaje?.codigo_complejidad ?? '',
        'Cotización total (COP)': cotizacion?.total ?? '',
        'Cotización mano de obra (COP)': cotizacion?.mano_obra ?? '',
        'Cotización repuestos (COP)': cotizacion?.repuestos ?? '',
        'Cotización pendiente precio': cotizacion?.pendiente_precio ? 'Sí' : '',
        'Cotización tiempo entrega': cotizacion?.tiempo_entrega ?? '',
        'Cotización aprobada en': fmtDate(cotizacion?.aprobado_at),
        'Cotización rechazada en': fmtDate(cotizacion?.rechazado_at),
        'Comentario rechazo cotización': cotizacion?.comentario_rechazo ?? '',
        'URL portal cliente': s.cliente_token ? `${APP_URL}/servicio/${s.cliente_token}` : '',
        'URL selección horario': s.horario_token ? `${APP_URL}/horario/${s.horario_token}` : '',
        'URL verificar paso': s.verificacion_paso_token ? `${APP_URL}/verificar-paso/${s.verificacion_paso_token}` : '',
        'URL detalle admin': `${APP_URL}/admin/solicitudes/${s.id}`,
      }
    })

    const wsSol = XLSX.utils.json_to_sheet(solRows)
    applyHyperlinks(wsSol, solRows, 'URL portal cliente')
    applyHyperlinks(wsSol, solRows, 'URL selección horario')
    applyHyperlinks(wsSol, solRows, 'URL verificar paso')
    applyHyperlinks(wsSol, solRows, 'URL detalle admin')
    XLSX.utils.book_append_sheet(wb, wsSol, 'Solicitudes')

    // HOJA 2: Notificaciones a técnicos
    if (notifs && notifs.length > 0) {
      const notifRows: Row[] = notifs.map((n: Record<string, unknown>) => {
        const tec = tecnicoNotifMap.get(n.tecnico_id as string)
        return {
          'Solicitud ID': n.solicitud_id,
          'Técnico': tec?.nombre_completo ?? n.tecnico_id,
          'WhatsApp técnico': tec?.whatsapp ?? '',
          Estado: n.estado,
          Enviado: fmtDate(n.enviado_at),
          Respondido: fmtDate(n.respondido_at),
          Token: n.token,
          'URL aceptar': n.token ? `${APP_URL}/aceptar/${n.token}` : '',
        }
      })
      const wsNotif = XLSX.utils.json_to_sheet(notifRows)
      applyHyperlinks(wsNotif, notifRows, 'URL aceptar')
      XLSX.utils.book_append_sheet(wb, wsNotif, 'Notificaciones WA')
    }

    // HOJA 3: Eventos (audit log)
    if (eventos && eventos.length > 0) {
      const eventRows: Row[] = eventos.map((e: Record<string, unknown>) => ({
        'Solicitud ID': e.solicitud_id,
        Tipo: e.tipo,
        'Estado previo': e.estado_previo,
        'Estado nuevo': e.estado_nuevo,
        Actor: e.actor,
        Motivo: e.motivo,
        Ocurrido: fmtDate(e.ocurrido_at),
        Payload: fmt(e.payload),
      }))
      const wsEv = XLSX.utils.json_to_sheet(eventRows)
      XLSX.utils.book_append_sheet(wb, wsEv, 'Eventos')
    }

    // HOJA 4: Evidencias (con fotos expandidas como columnas separadas)
    if (evidencias && evidencias.length > 0) {
      const maxFotos = evidencias.reduce(
        (max: number, ev: { fotos?: string[] | null }) => Math.max(max, ev.fotos?.length ?? 0),
        0,
      )

      const evRows: Row[] = evidencias.map((ev: Record<string, unknown>) => {
        const checklist = (ev.checklist ?? {}) as Record<string, unknown>
        const fotos = (ev.fotos ?? []) as string[]
        const row: Row = {
          'Solicitud ID': ev.solicitud_id,
          Completado: fmtDate(ev.completado_at),
          'Confirmado por cliente': ev.confirmado === true ? 'Sí' : ev.confirmado === false ? 'No' : 'Pendiente',
          'Confirmado en': fmtDate(ev.confirmado_at),
          'Comentario cliente': ev.cliente_comentario,
          'Diagnóstico realizado': checklist.diagnostico_realizado ? 'Sí' : 'No',
          'Pieza reemplazada': checklist.pieza_reemplazada ? 'Sí' : 'No',
          'Detalle pieza': checklist.pieza_detalle,
          'Prueba encendido': checklist.prueba_encendido ? 'Sí' : 'No',
          'Prueba ciclo completo': checklist.prueba_ciclo_completo ? 'Sí' : 'No',
          'Limpieza área': checklist.limpieza_area ? 'Sí' : 'No',
          'Explicación cliente': checklist.explicacion_cliente ? 'Sí' : 'No',
          'Notas técnico': checklist.notas_tecnico,
          'Firma cliente (URL)': ev.firma_url,
          'Oath técnico (firma)': ev.oath_firma,
          'Oath firmado en': fmtDate(ev.oath_firmado_at),
          'GPS final lat': ev.gps_lat,
          'GPS final lng': ev.gps_lng,
          'GPS diagnóstico lat': ev.gps_diagnostico_lat,
          'GPS diagnóstico lng': ev.gps_diagnostico_lng,
          'GPS completado lat': ev.gps_completado_lat,
          'GPS completado lng': ev.gps_completado_lng,
          'GPS post-visita lat': ev.gps_post_visita_lat,
          'GPS post-visita lng': ev.gps_post_visita_lng,
          'GPS post-visita en': fmtDate(ev.gps_post_visita_at),
          'GPS flagged': ev.gps_flagged ? 'Sí' : 'No',
        }
        for (let i = 0; i < maxFotos; i++) {
          row[`Foto ${i + 1}`] = fotos[i] ?? ''
        }
        return row
      })

      const wsEv = XLSX.utils.json_to_sheet(evRows)
      applyHyperlinks(wsEv, evRows, 'Firma cliente (URL)')
      for (let i = 0; i < maxFotos; i++) {
        applyHyperlinks(wsEv, evRows, `Foto ${i + 1}`)
      }
      XLSX.utils.book_append_sheet(wb, wsEv, 'Evidencias')
    }

    // HOJA 5: GPS Pings
    if (gpsPings && gpsPings.length > 0) {
      const pingRows: Row[] = gpsPings.map((g: Record<string, unknown>) => ({
        'Solicitud ID': g.solicitud_id,
        'Técnico ID': g.tecnico_id,
        Fase: g.fase,
        Lat: g.lat,
        Lng: g.lng,
        'Capturado en': fmtDate(g.capturado_at),
        'Mapa': g.lat && g.lng ? `https://www.google.com/maps?q=${g.lat},${g.lng}` : '',
      }))
      const wsGps = XLSX.utils.json_to_sheet(pingRows)
      applyHyperlinks(wsGps, pingRows, 'Mapa')
      XLSX.utils.book_append_sheet(wb, wsGps, 'GPS pings')
    }

    // HOJA 6: Repuestos pendientes
    if (repuestos && repuestos.length > 0) {
      const repRows: Row[] = repuestos.map((r: Record<string, unknown>) => ({
        'Solicitud ID': r.solicitud_id,
        SKU: r.sku,
        Descripción: r.descripcion,
        'Costo (COP)': r.costo,
        'Tiempo estimado': r.tiempo_estimado,
        Estado: r.estado,
        Solicitado: fmtDate(r.solicitado_at),
        Recibido: fmtDate(r.recibido_at),
      }))
      const wsRep = XLSX.utils.json_to_sheet(repRows)
      XLSX.utils.book_append_sheet(wb, wsRep, 'Repuestos')
    }

    // HOJA 7: Cotizaciones (productos necesarios + recomendados, expandidos)
    const cotizRows: Row[] = []
    solicitudes.forEach((s: Record<string, unknown>) => {
      const cot = s.cotizacion as Record<string, unknown> | null
      if (!cot) return
      const necesarios = (cot.productos_necesarios ?? []) as Array<Record<string, unknown>>
      const recomendados = (cot.productos_recomendados ?? []) as Array<Record<string, unknown>>

      necesarios.forEach((p) => {
        cotizRows.push({
          'Solicitud ID': s.id,
          Cliente: s.cliente_nombre,
          Tipo: 'Necesario',
          SKU: p.sku ?? '',
          Descripción: p.descripcion ?? '',
          Cantidad: p.cantidad ?? '',
          'Precio unitario (COP)': p.precio_unitario ?? '',
          'Subtotal (COP)': p.subtotal ?? '',
        })
      })
      recomendados.forEach((p) => {
        cotizRows.push({
          'Solicitud ID': s.id,
          Cliente: s.cliente_nombre,
          Tipo: 'Recomendado',
          SKU: '',
          Descripción: `${p.nombre ?? ''}${p.descripcion ? ' — ' + p.descripcion : ''}`,
          Cantidad: '',
          'Precio unitario (COP)': '',
          'Subtotal (COP)': '',
        })
      })
    })
    if (cotizRows.length > 0) {
      const wsCot = XLSX.utils.json_to_sheet(cotizRows)
      XLSX.utils.book_append_sheet(wb, wsCot, 'Cotizaciones')
    }

    // ─────────────────────────────────────────────────────────────────
    // Generar binario y devolver
    // ─────────────────────────────────────────────────────────────────

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
    const filename = ids
      ? `baird-resumen-${ids.length}-solicitudes-${ts}.xlsx`
      : `baird-resumen-todas-${ts}.xlsx`

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('[/api/admin/export] Error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
