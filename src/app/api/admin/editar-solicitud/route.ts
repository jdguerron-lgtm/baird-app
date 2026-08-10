import { after, NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarAdmin } from '@/lib/auth/admin'
import { geocodificarYGuardar } from '@/lib/services/geocoding.service'
import { TIPOS_EQUIPO } from '@/types/solicitud'
import { phoneToDigits, isMobileColombiano } from '@/lib/utils/phone'

export const maxDuration = 30

/**
 * POST /api/admin/editar-solicitud
 *
 * Permite al admin corregir manualmente campos básicos de una solicitud
 * (horario, dirección, ciudad, zona, tipo de equipo) cuando hay un error de
 * captura o el cliente solicita el cambio fuera del flujo self-service.
 *
 * Body: {
 *   id: string,
 *   cambios: {
 *     horario_confirmado?: string,
 *     direccion?: string,
 *     ciudad_pueblo?: string,
 *     zona_servicio?: string,
 *     tipo_equipo?: string,        // debe estar en TIPOS_EQUIPO
 *     marca_equipo?: string,       // texto libre — afecta alcance de supervisores por marca
 *     cliente_telefono?: string,   // celular CO válido (573XXXXXXXXX tras normalizar)
 *   },
 *   motivo?: string,   // razón opcional de la edición (queda en audit)
 * }
 *
 * Toda edición queda registrada en `solicitud_eventos` con:
 *   tipo = 'nota_admin'
 *   actor = 'admin'
 *   payload = { cambios: { campo: { previo, nuevo } } }
 *
 * NO envía WhatsApp automáticamente — si el admin quiere notificar al
 * cliente/técnico, lo hace por separado con el botón "↻ Reenviar".
 */
export async function POST(req: NextRequest) {
  try {
    const isAdmin = await verificarAdmin(req)
    if (!isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
    }

    const id = typeof body.id === 'string' ? body.id.trim() : ''
    const motivo = typeof body.motivo === 'string' ? body.motivo.trim().slice(0, 500) : null
    const cambiosRaw = body.cambios && typeof body.cambios === 'object' ? body.cambios : {}

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // Sanitizar campos permitidos. Solo aceptamos los que un admin razonable
    // debería corregir. Otros campos críticos (estado, es_garantia, tokens,
    // tecnico_asignado_id, etc.) NO se exponen — requieren su propio flujo.
    // marca_equipo (2026-08-10): texto libre, pero OJO — define qué supervisores
    // ven el caso (alcance por marca, normalizeForMatch) y el flujo de garantía.
    const camposPermitidos = ['horario_confirmado', 'direccion', 'ciudad_pueblo', 'zona_servicio', 'tipo_equipo', 'marca_equipo', 'cliente_telefono'] as const
    const cambiosLimpios: Record<string, string> = {}
    for (const campo of camposPermitidos) {
      const valor = cambiosRaw[campo]
      if (typeof valor === 'string') {
        let trimmed = valor.trim()
        if (trimmed.length === 0) continue
        if (trimmed.length > 500) {
          return NextResponse.json({ error: `${campo} demasiado largo (max 500)` }, { status: 400 })
        }
        // tipo_equipo es un enum cerrado — afecta el matching de técnicos y
        // las familias de falla del diagnóstico, así que validamos el valor.
        if (campo === 'tipo_equipo' && !(TIPOS_EQUIPO as readonly string[]).includes(trimmed)) {
          return NextResponse.json({ error: `tipo_equipo inválido: ${trimmed}` }, { status: 400 })
        }
        // cliente_telefono (2026-08-07): normalizamos a dígitos puros y
        // exigimos forma de celular colombiano (573XXXXXXXXX). Todo el flujo
        // depende de WhatsApp — un número inválido deja al cliente
        // incontactable y los envíos "exitosos" se pierden en el vacío.
        if (campo === 'cliente_telefono') {
          const digits = phoneToDigits(trimmed)
          if (!isMobileColombiano(digits)) {
            return NextResponse.json(
              { error: `Celular inválido: "${trimmed}". Debe ser un celular colombiano de 10 dígitos empezando por 3 (ej: 3001234567).` },
              { status: 400 },
            )
          }
          trimmed = digits
        }
        cambiosLimpios[campo] = trimmed
      }
    }

    if (Object.keys(cambiosLimpios).length === 0) {
      return NextResponse.json({ error: 'No hay cambios válidos' }, { status: 400 })
    }

    // 1. Leer estado actual para diff de audit
    const { data: actual, error: readErr } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, horario_confirmado, direccion, ciudad_pueblo, zona_servicio, tipo_equipo, marca_equipo, cliente_telefono')
      .eq('id', id)
      .single()
    if (readErr || !actual) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }

    // 2. Construir diff (solo campos que cambian)
    const diff: Record<string, { previo: string | null, nuevo: string }> = {}
    for (const [campo, nuevo] of Object.entries(cambiosLimpios)) {
      const previo = (actual as Record<string, unknown>)[campo]
      if (previo !== nuevo) {
        diff[campo] = { previo: (previo as string | null) ?? null, nuevo }
      }
    }
    if (Object.keys(diff).length === 0) {
      return NextResponse.json({ success: true, mensaje: 'Sin cambios reales' })
    }

    // 3. Si cambia horario_confirmado, también actualizar horario_confirmado_at
    //    y ultimo_reagendado_at para que el polling del admin detecte el cambio
    //    y el frontend del cliente/técnico muestre el horario nuevo.
    const updatePayload: Record<string, unknown> = { ...cambiosLimpios }
    if (diff.horario_confirmado) {
      const now = new Date().toISOString()
      updatePayload.horario_confirmado_at = now
      updatePayload.ultimo_reagendado_at = now
    }

    const { error: updErr } = await supabase
      .from('solicitudes_servicio')
      .update(updatePayload)
      .eq('id', id)
    if (updErr) {
      console.error('[editar-solicitud] update falló:', updErr)
      return NextResponse.json({ error: updErr.message }, { status: 500 })
    }

    // 4. Audit log (best-effort — si falla no tira la operación atrás)
    try {
      const { error: auditErr } = await supabase.from('solicitud_eventos').insert({
        solicitud_id: id,
        tipo: 'nota_admin',
        estado_previo: actual.estado,
        estado_nuevo: actual.estado, // no cambia el estado por una edición de campos
        actor: 'admin',
        motivo: motivo ?? 'Edición manual de campos por admin',
        payload: { campos_modificados: diff },
      })
      if (auditErr) console.error('[editar-solicitud] audit falló:', auditErr)
    } catch (err) {
      console.error('[editar-solicitud] audit threw:', err)
    }

    // Si cambió direccion o ciudad_pueblo → re-geocodificar fire-and-forget.
    // No bloquea la respuesta del admin; el mapa verá las nuevas coords en el
    // próximo refresh (segundos después).
    if (diff.direccion || diff.ciudad_pueblo) {
      after(async () => {
        try {
          await geocodificarYGuardar(id)
        } catch (err) {
          console.error(`[editar-solicitud] re-geocoding falló para ${id}:`, err)
        }
      })
    }

    return NextResponse.json({ success: true, cambios: diff })
  } catch (err) {
    console.error('Error en /api/admin/editar-solicitud:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
