import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerRolRequest } from '@/lib/auth/admin'
import { precioClienteServicio } from '@/types/solicitud'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'
import { descuentoDeSolicitud, montoDescuento } from '@/lib/constants/descuentos'
import { codigoServicio, identificacionCliente } from '@/lib/utils/facturacion'
import { armarClienteSiigo, armarCotizacionSiigo, emailValido } from '@/lib/utils/siigo-cotizacion'
import {
  SiigoError,
  siigoConfigurado,
  documentoCotizacionId,
  existeCliente,
  crearCliente,
  crearCotizacion,
} from '@/lib/services/siigo.service'

/**
 * POST /api/admin/siigo-cotizacion — 2026-10-22
 *
 * Precarga en Siigo una COTIZACIÓN del servicio particular con los datos del
 * cliente: busca el tercero por cédula/NIT (lo crea si no existe; sin
 * documento usa "consumidor final" y deja los datos en observaciones) y crea
 * la cotización con los ítems (diagnóstico + servicio, IVA 19 %).
 *
 *   { solicitud_id, forzar?: boolean }
 *
 * - Solo servicios particulares; la garantía va en la FV consolidada a MABE.
 * - Evita duplicados: si ya hay un evento `nota_admin` con
 *   payload.origen='siigo_cotizacion', responde 409 salvo `forzar`.
 * - Auth: admin o rol lectura (logística, la que captura en Siigo); está en
 *   `API_LECTURA_ESCRITURA_PERMITIDA`. Sin SIIGO_USERNAME/SIIGO_ACCESS_KEY → 503.
 */
const bodySchema = z.object({ solicitud_id: z.string().uuid(), forzar: z.boolean().optional() })

export async function POST(req: NextRequest) {
  try {
    const rol = await obtenerRolRequest(req)
    if (!rol) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    if (!siigoConfigurado()) {
      return NextResponse.json({ error: 'Siigo no está configurado (faltan SIIGO_USERNAME / SIIGO_ACCESS_KEY)' }, { status: 503 })
    }
    const parsed = bodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    const { solicitud_id, forzar } = parsed.data

    const { data: sol, error } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, cliente_nombre, cliente_telefono, cliente_cedula, ciudad_pueblo, direccion, tipo_equipo, marca_equipo, tipo_solicitud, cotizacion, recargo_weekend_aplicado, descuento_codigo, descuento_tipo, descuento_valor, tecnico_asignado_id')
      .eq('id', solicitud_id)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    if (sol.es_garantia) {
      return NextResponse.json({ error: 'Las garantías se facturan en la FV consolidada a la marca; no llevan cotización por servicio' }, { status: 400 })
    }

    const totalBruto = precioClienteServicio(
      sol.tipo_equipo, sol.tipo_solicitud, sol.es_garantia,
      sol.cotizacion as { total?: number | null } | null, sol.recargo_weekend_aplicado,
    )
    if (totalBruto <= 0) return NextResponse.json({ error: 'El servicio no tiene un valor cotizado todavía' }, { status: 409 })

    if (!forzar) {
      const { data: previos } = await supabase
        .from('solicitud_eventos')
        .select('payload')
        .eq('solicitud_id', sol.id)
        .eq('tipo', 'nota_admin')
        .contains('payload', { origen: 'siigo_cotizacion' })
        .limit(1)
      const previo = previos?.[0]?.payload as { cotizacion?: string } | undefined
      if (previo) {
        return NextResponse.json({ error: `Ya se creó la cotización ${previo.cotizacion ?? ''} en Siigo. Usa "forzar" para crear otra.`, existente: previo.cotizacion ?? null }, { status: 409 })
      }
    }

    // Email: el del pagador en Wompi (única fuente; el formulario no lo captura).
    const { data: pagos } = await supabase.from('pagos').select('raw').eq('solicitud_id', sol.id).eq('estado', 'APPROVED').limit(5)
    const email = (pagos ?? [])
      .map((p) => (p.raw as { customer_email?: unknown } | null)?.customer_email)
      .find((e): e is string => typeof e === 'string' && emailValido(e) !== null) ?? null

    let tecnico: string | null = null
    if (sol.tecnico_asignado_id) {
      const { data: t } = await supabase.from('tecnicos').select('nombre_completo').eq('id', sol.tecnico_asignado_id).maybeSingle()
      tecnico = t?.nombre_completo ?? null
    }

    const cliente = { ...sol, email }
    const ident = identificacionCliente(sol.cliente_cedula)
    let clienteCreado = false
    if (ident.tipoNombre !== 'Consumidor final' && !(await existeCliente(ident.identificacion))) {
      await crearCliente(armarClienteSiigo(cliente))
      clienteCreado = true
    }

    const descuento = montoDescuento(totalBruto, descuentoDeSolicitud(sol))
    const { payload } = armarCotizacionSiigo(cliente, {
      documentId: await documentoCotizacionId(),
      fechaYMD: fechaColombiaYMD(),
      totalBruto,
      descuento,
      codigoServicio: codigoServicio(sol.id),
      tecnico,
    })
    const cot = await crearCotizacion(payload)

    const { error: evErr } = await supabase.from('solicitud_eventos').insert({
      solicitud_id: sol.id,
      tipo: 'nota_admin',
      estado_previo: sol.estado,
      estado_nuevo: sol.estado,
      actor: rol.email,
      motivo: `Cotización ${cot.name} creada en Siigo`,
      payload: { origen: 'siigo_cotizacion', cotizacion: cot.name, siigo_id: cot.id, cliente_creado: clienteCreado, rol: rol.rol },
    })
    if (evErr) console.error('[admin/siigo-cotizacion] evento no registrado:', evErr)

    return NextResponse.json({ success: true, cotizacion: cot.name, siigo_id: cot.id, cliente_creado: clienteCreado })
  } catch (err) {
    if (err instanceof SiigoError) {
      console.error('[admin/siigo-cotizacion] Siigo:', err.message, JSON.stringify(err.detalle))
      return NextResponse.json({ error: err.message }, { status: 502 })
    }
    console.error('Error en /api/admin/siigo-cotizacion:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error interno' }, { status: 500 })
  }
}
