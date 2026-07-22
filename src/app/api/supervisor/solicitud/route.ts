import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { resolverSupervisorPorToken, solicitudEnAlcance } from '@/lib/auth/supervisor'
import { precioClienteServicio } from '@/types/solicitud'

/**
 * Detalle de UNA solicitud para el portal del supervisor (solo lectura).
 *
 * Auth: portal_token en query (?token=). Verifica que la solicitud pedida (?id=)
 * esté DENTRO DEL ALCANCE del supervisor antes de devolver nada — si no, 403.
 * Esto evita que un supervisor enumere IDs y vea servicios fuera de su marca/ámbito.
 *
 * Nunca se devuelven columnas de token (cliente_token, horario_token, etc.): un
 * supervisor no debe poder accionar sobre la solicitud, solo verla.
 */

// Lista explícita de columnas seguras — NO incluye ningún *_token.
const COLUMNAS_SEGURAS = [
  'id',
  'cliente_nombre',
  'cliente_telefono',
  'direccion',
  'ciudad_pueblo',
  'zona_servicio',
  'marca_equipo',
  'tipo_equipo',
  'tipo_solicitud',
  'novedades_equipo',
  'es_garantia',
  'ai_pre_diagnostico',
  'ai_repuesto_sugerido',
  'estado',
  'tecnico_asignado_id',
  'created_at',
  'numero_serie_factura',
  'pago_tecnico',
  'horario_visita_1',
  'horario_visita_2',
  'horario_confirmado',
  'horario_confirmado_at',
  'siguiente_paso',
  'siguiente_paso_detalle',
  'siguiente_paso_at',
  'cotizacion',
  'triaje_resultado',
  'diagnosticado_at',
  'fecha_visita_at',
  'repuesto_recibido_at',
  'cancelado_at',
  'motivo_cancelacion',
  'reagendamientos_count',
  'recargo_weekend_aplicado',
].join(', ')

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const id = req.nextUrl.searchParams.get('id')

  const sup = await resolverSupervisorPorToken(token)
  if (!sup) {
    return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })
  }
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  const { data: sol, error } = await supabase
    .from('solicitudes_servicio')
    .select(COLUMNAS_SEGURAS)
    .eq('id', id)
    .maybeSingle<Record<string, unknown>>()

  if (error) {
    return NextResponse.json({ error: 'Error cargando la solicitud' }, { status: 500 })
  }
  if (!sol) {
    return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
  }

  // Gate de alcance: fuera de scope → 403 (no revelar que existe).
  if (!solicitudEnAlcance(sup, { es_garantia: sol.es_garantia as boolean | null, marca_equipo: sol.marca_equipo as string | null })) {
    return NextResponse.json({ error: 'Fuera de tu alcance' }, { status: 403 })
  }

  // Técnico asignado (datos de contacto, solo lectura).
  let tecnico: { nombre_completo: string; whatsapp: string | null; ciudad_pueblo: string | null } | null = null
  if (sol.tecnico_asignado_id) {
    const { data: t } = await supabase
      .from('tecnicos')
      .select('nombre_completo, whatsapp, ciudad_pueblo')
      .eq('id', sol.tecnico_asignado_id as string)
      .maybeSingle()
    tecnico = t ?? null
  }

  // Línea de tiempo de eventos (append-only). Se devuelve tal cual para mostrar
  // el historial; el supervisor no puede escribir en ella.
  const { data: eventos } = await supabase
    .from('solicitud_eventos')
    .select('tipo, estado_previo, estado_nuevo, actor, motivo, payload, ocurrido_at')
    .eq('solicitud_id', id)
    .order('ocurrido_at', { ascending: false })

  // Evidencia del servicio completado (fotos, checklist, firmas). Lista
  // explícita de columnas: NUNCA incluir confirmacion_token.
  const { data: evidencia } = await supabase
    .from('evidencias_servicio')
    .select('id, fotos, checklist, firma_url, gps_lat, gps_lng, completado_at, confirmado, confirmado_at, cliente_comentario, oath_firma, oath_firmado_at')
    .eq('solicitud_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const precio_cliente = precioClienteServicio(
    sol.tipo_equipo as string,
    sol.tipo_solicitud as string,
    sol.es_garantia as boolean,
    sol.cotizacion as Record<string, unknown> | null,
    sol.recargo_weekend_aplicado as number | null,
  )

  return NextResponse.json({
    solicitud: { ...sol, precio_cliente },
    tecnico,
    eventos: eventos ?? [],
    evidencia: evidencia ?? null,
  })
}
