import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { resolverSupervisorPorToken, solicitudEnAlcance } from '@/lib/auth/supervisor'

/**
 * Partes/repuestos requeridos de las solicitudes DENTRO DEL ALCANCE del
 * supervisor (solo lectura). Cada fila trae el repuesto (SKU, descripción,
 * estado del ciclo pendiente/recibido/cancelado) + el caso al que pertenece
 * con su estado actual, para que la supervisora gestione los repuestos ante
 * la marca sin abrir caso por caso.
 *
 * Auth: portal_token en query (?token=), igual que /api/supervisor/solicitudes.
 * El alcance (ambito + marca) se aplica AQUÍ, server-side, sobre la solicitud
 * dueña de cada repuesto — nunca client-side (el anon key ve toda la tabla).
 * No se devuelve ninguna columna *_token.
 */

interface SolicitudJoin {
  id: string
  cliente_nombre: string | null
  tipo_equipo: string | null
  marca_equipo: string | null
  ciudad_pueblo: string | null
  estado: string | null
  es_garantia: boolean | null
}

interface RepuestoRow {
  id: string
  sku: string
  descripcion: string
  costo: number | null
  tiempo_estimado: string | null
  estado: string
  solicitado_at: string
  solicitud_id: string
  solicitudes_servicio: SolicitudJoin | null
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const sup = await resolverSupervisorPorToken(token)
  if (!sup) {
    return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('repuestos_pendientes')
    .select(`
      id, sku, descripcion, costo, tiempo_estimado, estado, solicitado_at, solicitud_id,
      solicitudes_servicio:solicitud_id (
        id, cliente_nombre, tipo_equipo, marca_equipo, ciudad_pueblo, estado, es_garantia
      )
    `)
    .order('solicitado_at', { ascending: false })

  if (error) {
    console.error('[supervisor/repuestos] query falló:', error)
    return NextResponse.json({ error: 'Error cargando repuestos' }, { status: 500 })
  }

  const filas = (data ?? []) as unknown as RepuestoRow[]

  const repuestos = filas
    .filter(r => r.solicitudes_servicio && solicitudEnAlcance(sup, r.solicitudes_servicio))
    .map(r => ({
      id: r.id,
      sku: r.sku,
      descripcion: r.descripcion,
      costo: r.costo ?? 0,
      tiempo_estimado: r.tiempo_estimado,
      estado: r.estado,
      solicitado_at: r.solicitado_at,
      solicitud: {
        id: r.solicitudes_servicio!.id,
        cliente_nombre: r.solicitudes_servicio!.cliente_nombre,
        tipo_equipo: r.solicitudes_servicio!.tipo_equipo,
        marca_equipo: r.solicitudes_servicio!.marca_equipo,
        ciudad_pueblo: r.solicitudes_servicio!.ciudad_pueblo,
        estado: r.solicitudes_servicio!.estado ?? 'pendiente',
        es_garantia: r.solicitudes_servicio!.es_garantia === true,
      },
    }))

  return NextResponse.json({ repuestos })
}
