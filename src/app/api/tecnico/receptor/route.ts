import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { enviarBienvenidaReceptor } from '@/lib/services/whatsapp.service'
import { validarReceptor, labelRelacionReceptor } from '@/lib/utils/receptor'

/**
 * POST /api/tecnico/receptor  (2026-10-13)
 *
 * El técnico registra (o quita) a la persona que lo recibe en el domicilio
 * cuando NO es el titular. Se llama al COMENZAR el diagnóstico — o al
 * completar un servicio de tarifa fija que no pasa por diagnóstico — y
 * guarda de inmediato (no espera al submit del formulario).
 *
 * Al registrar:
 *   1. Valida (nombre, móvil CO, relación, distinto del titular).
 *   2. Persiste receptor_* + receptor_token nuevo + receptor_registrado_at.
 *      Si cambia el número, se resetea receptor_acepto_at (debe aceptar de nuevo).
 *   3. Envía `receptor_bienvenida_v1` con el link /receptor/{token} para que
 *      acepte T&C + privacidad. Hasta que acepte, NO se le espeja nada.
 *   4. Deja rastro en solicitud_eventos (tipo nota_admin, actor tecnico).
 *
 * Body: { solicitudId, portalToken, receptor: { nombre, telefono, relacion } }
 *   o   { solicitudId, portalToken, quitar: true }  → vuelve a "recibe el titular"
 *       (solo permitido mientras el receptor no haya aceptado; después lo
 *       gestiona el equipo Baird).
 *
 * Auth: portal_token del técnico + tecnico_asignado_id (mismo patrón que
 * /api/diagnostico). Aditivo: no toca estado ni ningún otro campo.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    const portalToken = typeof body?.portalToken === 'string' ? body.portalToken.trim() : ''
    if (!solicitudId || !portalToken) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
    }

    const { data: tecnico } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .eq('portal_token', portalToken)
      .single()
    if (!tecnico) return NextResponse.json({ error: 'Token inválido' }, { status: 401 })

    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, cliente_nombre, cliente_telefono, receptor_nombre, receptor_telefono, receptor_relacion, receptor_token, receptor_acepto_at')
      .eq('id', solicitudId)
      .eq('tecnico_asignado_id', tecnico.id)
      .single()
    if (!sol) return NextResponse.json({ error: 'Servicio no encontrado' }, { status: 404 })

    // ── Quitar receptor (volver a "recibe el titular") ──
    if (body?.quitar === true) {
      if (!sol.receptor_telefono) return NextResponse.json({ success: true, receptor: null })
      if (sol.receptor_acepto_at) {
        return NextResponse.json(
          { error: 'Esta persona ya aceptó seguir el servicio. Para cambiarla, avisa al equipo Baird.' },
          { status: 409 },
        )
      }
      const { error: updErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          receptor_nombre: null,
          receptor_telefono: null,
          receptor_relacion: null,
          receptor_token: null,
          receptor_registrado_at: null,
          receptor_acepto_at: null,
          receptor_tyc_version: null,
        })
        .eq('id', sol.id)
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

      await registrarEvento(sol.id, sol.estado, tecnico.nombre_completo,
        `${tecnico.nombre_completo} quitó al receptor ${sol.receptor_nombre} (+${sol.receptor_telefono}): el servicio lo recibe el titular`,
        {
          receptor_nombre: { previo: sol.receptor_nombre, nuevo: '(titular recibe)' },
          receptor_telefono: { previo: sol.receptor_telefono, nuevo: '—' },
        })
      return NextResponse.json({ success: true, receptor: null })
    }

    // ── Registrar / actualizar receptor ──
    const v = validarReceptor(body?.receptor, sol.cliente_telefono)
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })
    const { receptor } = v

    const mismoNumero = !!sol.receptor_telefono && sol.receptor_telefono === receptor.telefono
    const sinCambios = mismoNumero
      && sol.receptor_nombre === receptor.nombre
      && sol.receptor_relacion === receptor.relacion
    if (sinCambios && sol.receptor_token) {
      return NextResponse.json({
        success: true,
        receptor: { ...receptor, acepto: !!sol.receptor_acepto_at },
        whatsapp_sent: null,
        sin_cambios: true,
      })
    }

    // Mismo número → conserva token y aceptación (solo corrige nombre/relación).
    // Número nuevo → token nuevo y debe aceptar otra vez.
    const token = mismoNumero && sol.receptor_token ? sol.receptor_token : crypto.randomUUID()
    const { error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update({
        receptor_nombre: receptor.nombre,
        receptor_telefono: receptor.telefono,
        receptor_relacion: receptor.relacion,
        receptor_token: token,
        receptor_registrado_at: new Date().toISOString(),
        ...(mismoNumero ? {} : { receptor_acepto_at: null, receptor_tyc_version: null }),
      })
      .eq('id', sol.id)
    if (updErr) {
      console.error('[tecnico/receptor] UPDATE falló:', updErr)
      const hint = updErr.message?.includes('receptor_') && updErr.message?.includes('column')
        ? ' (sugerencia: aplicar migración 20261013_receptor_servicio.sql en Supabase)'
        : ''
      return NextResponse.json({ error: updErr.message + hint }, { status: 500 })
    }

    await registrarEvento(sol.id, sol.estado, tecnico.nombre_completo,
      `${tecnico.nombre_completo} registró como receptor a ${receptor.nombre} (+${receptor.telefono}, ${labelRelacionReceptor(receptor.relacion)}) — titular: ${sol.cliente_nombre}`,
      {
        receptor_nombre: { previo: sol.receptor_nombre ?? null, nuevo: receptor.nombre },
        receptor_telefono: { previo: sol.receptor_telefono ?? null, nuevo: receptor.telefono },
        receptor_relacion: { previo: sol.receptor_relacion ? labelRelacionReceptor(sol.receptor_relacion) : null, nuevo: labelRelacionReceptor(receptor.relacion) },
      })

    // Bienvenida + link de aceptación: solo cuando hay número nuevo (o nunca
    // aceptó). Si ya aceptó y solo cambió el nombre, no se reenvía.
    let waOk: boolean | null = null
    let waError: string | null = null
    if (!mismoNumero || !sol.receptor_acepto_at) {
      const r = await enviarBienvenidaReceptor(sol.id)
      waOk = r.ok
      if (!r.ok) {
        waError = r.error ?? 'Error desconocido'
        console.error('[tecnico/receptor] enviarBienvenidaReceptor falló:', waError)
      }
    }

    return NextResponse.json({
      success: true,
      receptor: { ...receptor, acepto: mismoNumero ? !!sol.receptor_acepto_at : false },
      whatsapp_sent: waOk,
      whatsapp_error: waError,
    })
  } catch (error) {
    console.error('Error en /api/tecnico/receptor:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error interno' }, { status: 500 })
  }
}

/**
 * Rastro en el audit log. Se usa tipo 'nota_admin' (ya existe en el CHECK de
 * solicitud_eventos) con payload.origen='receptor' para NO tocar el
 * constraint; el admin lo ve en el panel de notas y, por campos_modificados
 * (forma {campo: {previo, nuevo}} que ya renderiza el historial), también en
 * el historial consolidado. Best-effort.
 */
async function registrarEvento(
  solicitudId: string,
  estado: string | null,
  tecnicoNombre: string,
  motivo: string,
  detalle: Record<string, { previo: string | null; nuevo: string }>,
): Promise<void> {
  try {
    const { error } = await supabase.from('solicitud_eventos').insert({
      solicitud_id: solicitudId,
      tipo: 'nota_admin',
      estado_previo: estado,
      estado_nuevo: estado,
      actor: 'tecnico',
      motivo,
      payload: { origen: 'receptor', tecnico_nombre: tecnicoNombre, campos_modificados: detalle },
    })
    if (error) console.error('[tecnico/receptor] evento no registrado:', error.message)
  } catch (err) {
    console.error('[tecnico/receptor] evento threw:', err)
  }
}
