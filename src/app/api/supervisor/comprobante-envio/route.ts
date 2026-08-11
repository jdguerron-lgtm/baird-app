import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { resolverSupervisorPorToken, solicitudEnAlcance } from '@/lib/auth/supervisor'
import crypto from 'crypto'

// Sube archivo a Storage — margen para redes lentas.
export const maxDuration = 60

const MAX_COMPROBANTE_BYTES = 10 * 1024 * 1024 // 10MB

const EXT_POR_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'application/pdf': 'pdf',
}

// El comprobante se puede adjuntar durante TODO el ciclo de repuesto, no solo
// antes de la guía: el recibo de la transportadora suele llegar después.
const ESTADOS_PERMITIDOS = ['esperando_repuesto', 'repuesto_en_camino', 'repuesto_recibido']

/**
 * POST /api/supervisor/comprobante-envio  (multipart/form-data)
 *
 * Segunda acción de escritura del portal del supervisor (la primera es la
 * guía de envío): adjuntar comprobantes del envío del repuesto — recibo de la
 * transportadora, pantallazo de tracking, remisión. A diferencia de la guía,
 * NO transiciona estado ni notifica a nadie: es evidencia adicional que queda
 * en el historial del caso (solicitud_eventos tipo 'comprobante_envio' —
 * migración 20260811) y visible en el detalle del supervisor y la ficha admin.
 *
 * Auth: portal_token del supervisor (form field `token`) + gate de alcance
 * (ambito + marca) server-side, igual que /api/supervisor/guia-envio.
 *
 * Form fields: token, id (solicitud), archivo (imagen o PDF, requerido),
 * nota (texto libre opcional, ej. "recibo Servientrega ida").
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const token = form.get('token')
    const id = form.get('id')
    const notaRaw = form.get('nota')
    const archivo = form.get('archivo')

    const sup = await resolverSupervisorPorToken(typeof token === 'string' ? token : null)
    if (!sup) return NextResponse.json({ error: 'Acceso no válido' }, { status: 401 })

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Falta id de la solicitud' }, { status: 400 })
    }
    if (!(archivo instanceof File) || archivo.size === 0) {
      return NextResponse.json({ error: 'Adjunta el comprobante (foto o PDF)' }, { status: 400 })
    }
    if (archivo.size > MAX_COMPROBANTE_BYTES) {
      return NextResponse.json({ error: 'El archivo supera 10MB' }, { status: 400 })
    }
    const mime = archivo.type
    if (!EXT_POR_MIME[mime] && !mime.startsWith('image/')) {
      return NextResponse.json({ error: 'Formato no soportado: sube una imagen o un PDF' }, { status: 400 })
    }
    const nota =
      typeof notaRaw === 'string' && notaRaw.trim()
        ? notaRaw.replace(/\s+/g, ' ').trim().substring(0, 300)
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
    if (!ESTADOS_PERMITIDOS.includes(sol.estado ?? '')) {
      return NextResponse.json(
        { error: 'La solicitud no está en el ciclo de repuesto — los comprobantes se adjuntan entre "esperando repuesto" y "repuesto recibido"' },
        { status: 400 },
      )
    }

    // 1. Subir el comprobante al bucket de evidencias (misma carpeta del caso,
    //    prefijo comprobante_envio_ para distinguirlo de guía y fotos).
    const ext = EXT_POR_MIME[mime] ?? 'jpg'
    const path = `${sol.id}/comprobante_envio_${Date.now()}_${crypto.randomUUID().slice(0, 8)}.${ext}`
    const buffer = Buffer.from(await archivo.arrayBuffer())
    const { error: uploadErr } = await supabase.storage
      .from('evidencias-servicio')
      .upload(path, buffer, { cacheControl: '3600', upsert: false, contentType: mime })
    if (uploadErr) {
      console.error('[supervisor/comprobante-envio] upload falló:', uploadErr)
      return NextResponse.json({ error: 'No se pudo subir el archivo. Intenta de nuevo.' }, { status: 500 })
    }
    const { data: urlData } = supabase.storage.from('evidencias-servicio').getPublicUrl(path)
    const url = urlData?.publicUrl
    if (!url) {
      return NextResponse.json({ error: 'No se pudo obtener la URL del comprobante' }, { status: 500 })
    }

    // 2. El evento ES el registro del comprobante — si el insert falla (p.ej.
    //    migración 20260811 sin aplicar), el comprobante quedaría huérfano en
    //    storage: lo borramos y devolvemos error visible.
    const ocurridoAt = new Date().toISOString()
    const { error: evErr } = await supabase.from('solicitud_eventos').insert({
      solicitud_id: sol.id,
      tipo: 'comprobante_envio',
      estado_previo: sol.estado,
      estado_nuevo: sol.estado, // no cambia el estado: es un adjunto
      actor: 'supervisor',
      motivo: nota,
      payload: {
        url,
        nombre_original: archivo.name?.substring(0, 200) ?? null,
        mime,
        subido_por: sup.nombre,
      },
      ocurrido_at: ocurridoAt,
    })
    if (evErr) {
      console.error('[supervisor/comprobante-envio] insert evento falló:', evErr)
      await supabase.storage.from('evidencias-servicio').remove([path]).catch(() => {})
      return NextResponse.json(
        { error: 'No se pudo registrar el comprobante. Avisa al administrador.' },
        { status: 500 },
      )
    }

    return NextResponse.json({
      success: true,
      comprobante: {
        url,
        nota,
        subido_por: sup.nombre,
        ocurrido_at: ocurridoAt,
      },
    })
  } catch (error) {
    console.error('Error en /api/supervisor/comprobante-envio:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 },
    )
  }
}
