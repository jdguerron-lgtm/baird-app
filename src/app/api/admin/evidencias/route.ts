import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerEmailAdmin } from '@/lib/auth/admin'
import {
  ORIGEN_EVIDENCIA_ADMIN,
  esUrlEvidenciaAdminValida,
  type ArchivoEvidenciaAdmin,
} from '@/lib/utils/evidencia-admin'
import { MAX_ARCHIVOS_EVIDENCIA_ADMIN } from '@/lib/utils/media'

/**
 * POST /api/admin/evidencias  (2026-10-20)
 *
 * Registra evidencia ADICIONAL que el equipo Baird sube desde la ficha admin
 * (`/admin/solicitudes/[id]` § "Evidencia adicional del equipo"): fotos,
 * videos o PDF que llegan por WhatsApp/correo y antes no tenían dónde quedar.
 *
 * Los archivos NO pasan por acá: el navegador del admin los sube directo al
 * bucket público `evidencias-servicio` bajo `{solicitud_id}/admin_*` (evita el
 * tope de 4.5 MB por request de Vercel y permite videos de hasta 50 MB). Este
 * endpoint solo valida las URLs (bucket + carpeta de la solicitud + prefijo
 * admin_) y escribe UN evento append-only en `solicitud_eventos`:
 *   tipo='nota_admin', actor=email del admin, motivo=nota opcional,
 *   payload={ origen:'evidencia_admin', archivos:[{url,mime,nombre,bytes}], subido_por }
 * (mismo CHECK de tipos: no requiere migración — ver docs/GOTCHAS.md).
 *
 * Body: { solicitudId: string, nota?: string, archivos: Array<{ url, mime?, nombre?, bytes? }> }
 * Devuelve el evento insertado para que el frontend lo muestre sin refetch.
 * Solo admins (el rol lectura es rechazado por obtenerEmailAdmin).
 */
export async function POST(req: NextRequest) {
  try {
    const adminEmail = await obtenerEmailAdmin(req)
    if (!adminEmail) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json().catch(() => null)
    const solicitudId = typeof body?.solicitudId === 'string' ? body.solicitudId.trim() : ''
    const notaRaw = typeof body?.nota === 'string' ? body.nota.replace(/\s+/g, ' ').trim() : ''
    const archivosRaw: unknown = body?.archivos

    if (!solicitudId) return NextResponse.json({ error: 'solicitudId requerido' }, { status: 400 })
    if (!Array.isArray(archivosRaw) || archivosRaw.length === 0) {
      return NextResponse.json({ error: 'Adjunta al menos un archivo' }, { status: 400 })
    }
    if (archivosRaw.length > MAX_ARCHIVOS_EVIDENCIA_ADMIN) {
      return NextResponse.json(
        { error: `Máximo ${MAX_ARCHIVOS_EVIDENCIA_ADMIN} archivos por carga` },
        { status: 400 },
      )
    }
    if (notaRaw.length > 1000) {
      return NextResponse.json({ error: 'Nota demasiado larga (máx 1000 caracteres)' }, { status: 400 })
    }

    const archivos: ArchivoEvidenciaAdmin[] = []
    for (const a of archivosRaw) {
      const o = (a && typeof a === 'object' ? a : {}) as Record<string, unknown>
      if (!esUrlEvidenciaAdminValida(o.url, solicitudId)) {
        return NextResponse.json(
          { error: 'Una de las URLs no pertenece a la carpeta de evidencias de esta solicitud' },
          { status: 400 },
        )
      }
      archivos.push({
        url: o.url,
        mime: typeof o.mime === 'string' ? o.mime.slice(0, 100) : null,
        nombre: typeof o.nombre === 'string' ? o.nombre.slice(0, 200) : null,
        bytes: typeof o.bytes === 'number' && Number.isFinite(o.bytes) ? Math.round(o.bytes) : null,
      })
    }

    const { data: sol } = await supabase
      .from('solicitudes_servicio')
      .select('id, estado')
      .eq('id', solicitudId)
      .maybeSingle()
    if (!sol) return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })

    const motivo = notaRaw || `Evidencia adicional del equipo (${archivos.length} archivo${archivos.length === 1 ? '' : 's'})`

    const { data: evento, error: insErr } = await supabase
      .from('solicitud_eventos')
      .insert({
        solicitud_id: solicitudId,
        tipo: 'nota_admin',
        estado_previo: sol.estado,
        estado_nuevo: sol.estado, // no cambia el estado: es un adjunto
        actor: adminEmail,
        motivo,
        payload: {
          origen: ORIGEN_EVIDENCIA_ADMIN,
          archivos,
          subido_por: adminEmail,
        },
      })
      .select('id, tipo, estado_previo, estado_nuevo, actor, motivo, payload, ocurrido_at')
      .single()

    if (insErr || !evento) {
      console.error('[admin/evidencias] insert falló:', insErr)
      return NextResponse.json(
        { error: insErr?.message ?? 'No se pudo registrar la evidencia' },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, evento })
  } catch (err) {
    console.error('Error en /api/admin/evidencias:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno' },
      { status: 500 },
    )
  }
}
