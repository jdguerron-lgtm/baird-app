import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { resolverSupervisorPorToken, solicitudEnAlcance } from '@/lib/auth/supervisor'
import {
  enviarRepuestoEnCaminoCliente,
  enviarRepuestoEnCaminoTecnico,
  notificarCambioEstado,
} from '@/lib/services/whatsapp.service'
import crypto from 'crypto'

// Sube archivo a Storage + 2 envíos WhatsApp — margen para redes lentas.
export const maxDuration = 60

const MAX_GUIA_BYTES = 10 * 1024 * 1024 // 10MB

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}

/**
 * POST /api/supervisor/guia-envio  (multipart/form-data)
 *
 * ÚNICA acción de escritura del portal del supervisor (que es de solo lectura
 * para todo lo demás): subir la guía de envío del repuesto. Dispara la
 * transición esperando_repuesto → repuesto_en_camino y las notificaciones:
 *   - Cliente: repuesto_en_camino_cliente_v1 (botón → /reprogramar-repuesto/{token}
 *     para agendar la visita de finalización; queda en fecha_visita_at).
 *   - Técnico: repuesto_en_camino_tecnico_v1 (el servicio sigue en su portal).
 *   - Supervisores: notificarCambioEstado (plantilla repuesto garantía).
 *
 * Auth: portal_token del supervisor (form field `token`) + gate de alcance
 * (ambito + marca) server-side, igual que /api/supervisor/solicitud.
 *
 * Form fields: token, id (solicitud), archivo (imagen o PDF, requerido),
 * numeroGuia (texto libre opcional: número de guía / transportadora).
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const token = form.get('token')
    const id = form.get('id')
    const numeroGuiaRaw = form.get('numeroGuia')
    const archivo = form.get('archivo')

    const sup = await resolverSupervisorPorToken(typeof token === 'string' ? token : null)
    if (!sup) return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Falta id de la solicitud' }, { status: 400 })
    }
    if (!(archivo instanceof File) || archivo.size === 0) {
      return NextResponse.json({ error: 'Adjunta la guía de envío (foto o PDF)' }, { status: 400 })
    }
    if (archivo.size > MAX_GUIA_BYTES) {
      return NextResponse.json({ error: 'El archivo supera 10MB' }, { status: 400 })
    }
    const mime = archivo.type
    if (!EXT_POR_MIME[mime] && !mime.startsWith('image/')) {
      return NextResponse.json({ error: 'Formato no soportado: sube una imagen o un PDF' }, { status: 400 })
    }
    const numeroGuia =
      typeof numeroGuiaRaw === 'string' && numeroGuiaRaw.trim()
        ? numeroGuiaRaw.replace(/\s+/g, ' ').trim().substring(0, 120)
        : null

    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado, es_garantia, marca_equipo')
      .eq('id', id)
      .maybeSingle()
    if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

    if (!solicitudEnAlcance(sup, { es_garantia: sol.es_garantia, marca_equipo: sol.marca_equipo })) {
      return NextResponse.json({ error: 'Fuera de tu alcance' }, { status: 403 })
    }
    if (sol.estado !== 'esperando_repuesto') {
      return NextResponse.json(
        { error: 'La solicitud no está esperando repuesto (la guía ya fue subida o el flujo avanzó)' },
        { status: 400 },
      )
    }

    // 1. Subir la guía al bucket público de evidencias (mismo bucket que las
    //    fotos de diagnóstico — path con prefijo guia_envio_).
    const ext = EXT_POR_MIME[mime] ?? 'jpg'
    const path = `${sol.id}/guia_envio_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`
    const buffer = Buffer.from(await archivo.arrayBuffer())
    const { error: uploadErr } = await supabase.storage
      .from('evidencias-servicio')
      .upload(path, buffer, { cacheControl: '3600', upsert: false, contentType: mime })
    if (uploadErr) {
      console.error('[supervisor/guia-envio] upload falló:', uploadErr)
      return NextResponse.json({ error: 'No se pudo subir el archivo. Intenta de nuevo.' }, { status: 500 })
    }
    const { data: urlData } = supabase.storage.from('evidencias-servicio').getPublicUrl(path)
    const guiaUrl = urlData?.publicUrl
    if (!guiaUrl) {
      return NextResponse.json({ error: 'No se pudo obtener la URL de la guía' }, { status: 500 })
    }

    // 2. Transición atómica esperando_repuesto → repuesto_en_camino + token de
    //    agendamiento para el cliente (guard .eq evita doble subida concurrente).
    const reprogToken = crypto.randomUUID()
    const { data: updated } = await supabase
      .from('solicitudes_servicio')
      .update({
        estado: 'repuesto_en_camino',
        guia_envio_url: guiaUrl,
        guia_envio_numero: numeroGuia,
        guia_envio_at: new Date().toISOString(),
        guia_envio_por: sup.nombre,
        reprogramacion_token: reprogToken,
      })
      .eq('id', sol.id)
      .eq('estado', 'esperando_repuesto')
      .select('id')
      .single()

    if (!updated) {
      return NextResponse.json(
        { error: 'La solicitud cambió de estado mientras subías la guía. Recarga la página.' },
        { status: 409 },
      )
    }

    // 3. Notificaciones (best-effort, no revierten la transición).
    const cli = await enviarRepuestoEnCaminoCliente(sol.id)
    if (!cli.ok) console.error('[supervisor/guia-envio] aviso cliente falló:', cli.error)
    const tec = await enviarRepuestoEnCaminoTecnico(sol.id)
    if (!tec.ok) console.error('[supervisor/guia-envio] aviso técnico falló:', tec.error)
    await notificarCambioEstado(sol.id, 'esperando_repuesto', 'repuesto_en_camino')

    return NextResponse.json({
      success: true,
      guia_url: guiaUrl,
      cliente_notificado: cli.ok,
      tecnico_notificado: tec.ok,
    })
  } catch (error) {
    console.error('Error en /api/supervisor/guia-envio:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    )
  }
}
