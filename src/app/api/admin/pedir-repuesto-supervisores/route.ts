import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import { notificarRepuestoSupervisores } from '@/lib/services/whatsapp.service'

/**
 * POST /api/admin/pedir-repuesto-supervisores
 *
 * Botón admin "Pedir repuestos en garantía": envía a los supervisores con
 * VISIBILIDAD DE LA MARCA del servicio el pedido de repuesto con todo lo
 * necesario para gestionarlo ante la marca (SKU, modelo, No. de garantía,
 * dirección del cliente y diagnóstico del técnico) vía la plantilla
 * supervisor_repuesto_garantia_v1. Solo GARANTÍA. NO cambia el estado.
 *
 * El envío real (filtro por marca + plantilla + fallback a la genérica mientras
 * Meta no apruebe) lo hace notificarRepuestoSupervisores() en whatsapp.service.
 * El pedido queda auditado en solicitud_eventos (tipo nota_admin, origen
 * 'pedido_repuesto_supervisores') — best-effort, no bloquea la respuesta.
 *
 * Body: { solicitudId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    if (!solicitudId) return NextResponse.json({ error: 'solicitudId requerido' }, { status: 400 })

    const resultado = await notificarRepuestoSupervisores(solicitudId)

    // Auditoría append-only (no cambia estado). Best-effort: un fallo de log no
    // debe reportar error al admin si los avisos sí salieron.
    if (resultado.enviados > 0) {
      try {
        const { data: sol } = await supabase
          .from('solicitudes_servicio')
          .select('estado')
          .eq('id', solicitudId)
          .single()
        await supabase.from('solicitud_eventos').insert({
          solicitud_id: solicitudId,
          tipo: 'nota_admin',
          estado_previo: sol?.estado ?? null,
          estado_nuevo: sol?.estado ?? null,
          actor: adminEmail,
          motivo: `Pedido de repuesto enviado a ${resultado.enviados} supervisor(es) con visibilidad de la marca`,
          payload: { origen: 'pedido_repuesto_supervisores', enviados: resultado.enviados, total: resultado.total },
        })
      } catch (logErr) {
        console.error('[pedir-repuesto-supervisores] auditoría falló (no crítico):', logErr)
      }
    }

    if (resultado.enviados === 0) {
      return NextResponse.json({
        ok: false,
        mensaje: resultado.error ?? 'No se envió a ningún supervisor',
        ...resultado,
      })
    }

    return NextResponse.json({
      ok: true,
      mensaje: `Pedido de repuesto enviado a ${resultado.enviados} de ${resultado.total} supervisor(es) con visibilidad de la marca.`,
      ...resultado,
    })
  } catch (err) {
    console.error('Error en /api/admin/pedir-repuesto-supervisores:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
