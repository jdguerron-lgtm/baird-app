import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerRolRequest } from '@/lib/auth/admin'
import {
  facturacionEstadoBodySchema,
  prepararCambioFacturacion,
} from '@/lib/services/facturacion-estado.service'

/**
 * POST /api/admin/facturacion-estado — 2026-10-22
 *
 * Marca el seguimiento de facturación de un servicio COMPLETADO:
 *   { solicitud_id, facturacion_estado: 'pendiente'|'facturada'|'no_aplica',
 *     factura_numero?, facturacion_nota? }
 *
 * Reglas (src/lib/services/facturacion-estado.service.ts):
 *   - `facturada` exige `factura_numero`; `pendiente` limpia número/fecha;
 *     solo aplica a solicitudes `completada` (otros estados → 409).
 *   - Deja evento `nota_admin` en `solicitud_eventos` con
 *     payload.origen='facturacion_estado' y el antes/después.
 *
 * AUTH — ÚNICA EXCEPCIÓN DEL ROL LECTURA (decisión 2026-10-22, ver
 * docs/SEGURIDAD.md § "Rol lectura"): este endpoint acepta admin **o rol
 * lectura (logística)** vía `obtenerRolRequest`, porque es logística quien
 * captura la FV en Siigo y debe poder marcarla. `facturada_por` guarda el
 * email del rol que lo hizo. Ningún otro endpoint de escritura abre esta
 * puerta; el guard de `window.fetch` del layout admin también lo lista de
 * forma explícita (`API_LECTURA_ESCRITURA_PERMITIDA` en soloLectura.ts).
 */
export async function POST(req: NextRequest) {
  try {
    const rol = await obtenerRolRequest(req)
    if (!rol) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const parsed = facturacionEstadoBodySchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      const primero = parsed.error.issues[0]
      return NextResponse.json(
        { error: primero ? `${primero.path.join('.') || 'body'}: ${primero.message}` : 'Body inválido' },
        { status: 400 },
      )
    }
    const body = parsed.data

    const { data: sol, error: selErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, facturacion_estado, factura_numero, facturacion_nota')
      .eq('id', body.solicitud_id)
      .maybeSingle()
    if (selErr) {
      console.error('[admin/facturacion-estado] select falló:', selErr)
      return NextResponse.json({ error: selErr.message }, { status: 500 })
    }
    if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

    const cambio = prepararCambioFacturacion(sol, body, rol.email)
    if (!cambio.ok) return NextResponse.json({ error: cambio.error }, { status: cambio.status })

    // Guard atómico: si el estado cambió entre el select y el update (p. ej. la
    // reabrieron), no se escribe nada.
    const { data: actualizada, error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update(cambio.update)
      .eq('id', sol.id)
      .eq('estado', 'completada')
      .select('id, estado, facturacion_estado, factura_numero, facturada_at, facturada_por, facturacion_nota')
      .maybeSingle()
    if (updErr) {
      console.error('[admin/facturacion-estado] update falló:', updErr)
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }
    if (!actualizada) {
      return NextResponse.json({ error: 'La solicitud ya no está completada; no se cambió la facturación' }, { status: 409 })
    }

    // Audit append-only (no bloquea la respuesta si falla, pero se loguea).
    const { error: evErr } = await supabase.from('solicitud_eventos').insert({
      solicitud_id: sol.id,
      tipo: 'nota_admin',
      estado_previo: 'completada',
      estado_nuevo: 'completada',
      actor: rol.email,
      motivo: cambio.motivo,
      payload: { ...cambio.payload, rol: rol.rol },
    })
    if (evErr) console.error('[admin/facturacion-estado] evento no registrado:', evErr)

    return NextResponse.json({ success: true, solicitud: actualizada, rol: rol.rol })
  } catch (err) {
    console.error('Error en /api/admin/facturacion-estado:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
