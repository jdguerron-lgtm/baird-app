import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  resolverSupervisorPorToken,
  solicitudEnAlcance,
  filtroEsGarantia,
} from '@/lib/auth/supervisor'
import { precioClienteServicio } from '@/types/solicitud'
import { campoFalla } from '@/lib/utils/falla'
import { cotizacionTieneRepuestos } from '@/lib/constants/pagos'

/**
 * Lista de solicitudes DENTRO DEL ALCANCE del supervisor (solo lectura).
 *
 * Auth: portal_token en query (?token=). El alcance (ambito + marca) se aplica
 * en el servidor — ver src/lib/auth/supervisor.ts. Nunca confiar en un filtro
 * client-side: el anon key ve toda la tabla.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const sup = await resolverSupervisorPorToken(token)
  if (!sup) {
    return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })
  }

  // Acotar por es_garantia en la BD cuando el ámbito lo permite; la marca se
  // filtra en JS (comparación normalizada, no expresable limpio en SQL).
  let query = supabase
    .from('solicitudes_servicio')
    .select(
      'id, cliente_nombre, cliente_telefono, ciudad_pueblo, zona_servicio, tipo_equipo, marca_equipo, tipo_solicitud, estado, pago_tecnico, cotizacion, es_garantia, created_at, tecnico_asignado_id, recargo_weekend_aplicado, triaje_resultado, anticipo_pagado_at, abono_pagado_at, saldo_pagado_at, monto_pagado_online',
    )
    .order('created_at', { ascending: false })

  const fg = filtroEsGarantia(sup)
  if (fg !== null) query = query.eq('es_garantia', fg)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Error cargando solicitudes' }, { status: 500 })
  }

  const enAlcance = (data ?? []).filter(s => solicitudEnAlcance(sup, s))

  // Resolver nombres de técnicos asignados (una sola query).
  const tecnicoIds = [...new Set(enAlcance.filter(s => s.tecnico_asignado_id).map(s => s.tecnico_asignado_id!))]
  const tecnicoMap = new Map<string, string>()
  if (tecnicoIds.length > 0) {
    const { data: tecnicos } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .in('id', tecnicoIds)
    tecnicos?.forEach((t: { id: string; nombre_completo: string }) => tecnicoMap.set(t.id, t.nombre_completo))
  }

  // Código de falla del diagnóstico (JSONB triaje_resultado). Se aplana acá para
  // que el listado y su PDF lo muestren sin abrir cada solicitud — es el dato
  // con el que la marca clasifica el servicio. La coerción de tipos vive en
  // campoFalla (el código viene como number desde la BD).
  const solicitudes = enAlcance.map(s => ({
    id: s.id,
    cliente_nombre: s.cliente_nombre,
    cliente_telefono: s.cliente_telefono,
    ciudad_pueblo: s.ciudad_pueblo,
    zona_servicio: s.zona_servicio,
    tipo_equipo: s.tipo_equipo,
    marca_equipo: s.marca_equipo,
    estado: s.estado ?? 'pendiente',
    pago_tecnico: s.pago_tecnico ?? 0,
    precio_cliente: precioClienteServicio(s.tipo_equipo, s.tipo_solicitud, s.es_garantia, s.cotizacion, s.recargo_weekend_aplicado),
    es_garantia: s.es_garantia,
    created_at: s.created_at,
    tecnico_nombre: s.tecnico_asignado_id ? tecnicoMap.get(s.tecnico_asignado_id) ?? null : null,
    codigo_falla: campoFalla(s.triaje_resultado,'codigo_falla'),
    descripcion_falla: campoFalla(s.triaje_resultado,'descripcion_falla'),
    complejidad_falla: campoFalla(s.triaje_resultado,'complejidad_falla'),
    // Capa paralela de pago del cliente (solo particular) — pago-cliente.ts.
    // Etapa de pago (2026-10-11): se manda una versión REDUCIDA de la
    // cotización (total, aprobada, ¿lleva repuestos?) — nunca el JSONB
    // completo, que trae el token de aprobación del cliente.
    tipo_solicitud: s.tipo_solicitud,
    tecnico_asignado_id: s.tecnico_asignado_id ?? null,
    recargo_weekend_aplicado: s.recargo_weekend_aplicado ?? null,
    cotizacion: s.cotizacion
      ? {
          total: (s.cotizacion as { total?: number }).total ?? 0,
          aprobado_at: (s.cotizacion as { aprobado_at?: string }).aprobado_at ?? null,
          repuestos: cotizacionTieneRepuestos(s.cotizacion) ? 1 : 0,
        }
      : null,
    anticipo_pagado_at: s.anticipo_pagado_at ?? null,
    abono_pagado_at: s.abono_pagado_at ?? null,
    saldo_pagado_at: s.saldo_pagado_at ?? null,
    monto_pagado_online: s.monto_pagado_online ?? 0,
  }))

  return NextResponse.json({
    supervisor: { nombre: sup.nombre, ambito: sup.ambito, marca: sup.marca },
    solicitudes,
  })
}
