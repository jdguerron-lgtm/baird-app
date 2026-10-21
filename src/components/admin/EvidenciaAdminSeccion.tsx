'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import SelectorFoto from '@/components/ui/SelectorFoto'
import MediaEvidencia from '@/components/ui/MediaEvidencia'
import {
  compressImageIfNeeded,
  inferExtension,
  videoSizeAdvice,
  MAX_VIDEO_SIZE_BYTES,
  MAX_VIDEO_SIZE_MB,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
  MAX_ARCHIVOS_EVIDENCIA_ADMIN,
} from '@/lib/utils/media'
import {
  archivosDeEvento,
  PREFIJO_ARCHIVO_ADMIN,
  type EventoEvidenciaAdmin,
} from '@/lib/utils/evidencia-admin'

/**
 * Sección "Evidencia adicional del equipo" de la ficha admin (2026-10-20).
 *
 * El admin adjunta fotos, videos (≤ 50 MB c/u) o PDF que le llegan por
 * WhatsApp/correo (cliente, técnico, supervisor, transportadora) y que el
 * flujo normal no captura. Subida directa navegador → Storage (sesión
 * authenticated; la policy de INSERT del bucket es `public`) y registro vía
 * POST /api/admin/evidencias como evento nota_admin/origen evidencia_admin.
 *
 * Oculta el formulario para el rol lectura (solo ve la lista).
 */
interface Props {
  solicitudId: string
  eventos: EventoEvidenciaAdmin[]
  soloLectura: boolean
  /** Se llama tras registrar la carga para refrescar eventos/galería. */
  onSubido: () => Promise<void> | void
}

interface Pendiente {
  file: File
  preview: string | null // object URL para imágenes; null para video/PDF
}

const ACCEPT_GALERIA = 'image/*,video/*,application/pdf'

function fmtMB(bytes: number) {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function EvidenciaAdminSeccion({ solicitudId, eventos, soloLectura, onSubido }: Props) {
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [nota, setNota] = useState('')
  const [subiendo, setSubiendo] = useState(false)
  const [progreso, setProgreso] = useState('')
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const totalArchivos = eventos.reduce((n, e) => n + archivosDeEvento(e).length, 0)

  const agregar = (files: FileList) => {
    const slots = MAX_ARCHIVOS_EVIDENCIA_ADMIN - pendientes.length
    if (slots <= 0) {
      setMsg({ tipo: 'error', texto: `Máximo ${MAX_ARCHIVOS_EVIDENCIA_ADMIN} archivos por carga.` })
      return
    }
    const nuevos: Pendiente[] = []
    let aviso: string | null = null
    for (const file of Array.from(files).slice(0, slots)) {
      const esImagen = file.type.startsWith('image/')
      const esVideo = file.type.startsWith('video/')
      const esPdf = file.type === 'application/pdf'
      if (!esImagen && !esVideo && !esPdf) {
        aviso = `"${file.name}" no es foto, video ni PDF.`
        continue
      }
      if (esVideo && file.size > MAX_VIDEO_SIZE_BYTES) {
        aviso = videoSizeAdvice()
        continue
      }
      if (esPdf && file.size > MAX_IMAGE_SIZE_BYTES) {
        aviso = `"${file.name}" supera ${MAX_IMAGE_SIZE_MB} MB.`
        continue
      }
      nuevos.push({ file, preview: esImagen ? URL.createObjectURL(file) : null })
    }
    setPendientes(prev => [...prev, ...nuevos])
    setMsg(aviso ? { tipo: 'error', texto: aviso } : null)
  }

  const quitar = (idx: number) => {
    setPendientes(prev => {
      const p = prev[idx]
      if (p?.preview) URL.revokeObjectURL(p.preview)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const subir = async () => {
    if (pendientes.length === 0 || subiendo) return
    setSubiendo(true)
    setMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMsg({ tipo: 'error', texto: 'Sesión expirada — vuelve a iniciar sesión.' })
        return
      }

      setProgreso('Preparando archivos...')
      const stamp = Date.now()
      const rand = Math.random().toString(36).slice(2, 8)

      // Fotos: mismo pipeline que el técnico (4000 px / JPEG 0.92, HEIC → JPEG).
      // Videos y PDF van tal cual.
      const preparados = await Promise.all(
        pendientes.map(async (p) => (p.file.type.startsWith('image/') ? compressImageIfNeeded(p.file) : p.file)),
      )
      const grande = preparados.find(f => f.type.startsWith('image/') && f.size > MAX_IMAGE_SIZE_BYTES)
      if (grande) {
        setMsg({ tipo: 'error', texto: `"${grande.name}" sigue pesando más de ${MAX_IMAGE_SIZE_MB} MB tras comprimir.` })
        return
      }

      setProgreso(`Subiendo ${preparados.length} archivo${preparados.length === 1 ? '' : 's'}...`)
      const resultados = await Promise.all(
        preparados.map(async (file, i) => {
          const ext = file.type === 'application/pdf' ? 'pdf' : inferExtension(file)
          const path = `${solicitudId}/${PREFIJO_ARCHIVO_ADMIN}${stamp}_${rand}_${i}.${ext}`
          const { error } = await supabase.storage
            .from('evidencias-servicio')
            .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined })
          if (error) return { ok: false as const, nombre: file.name, error: error.message }
          const { data } = supabase.storage.from('evidencias-servicio').getPublicUrl(path)
          return {
            ok: true as const,
            archivo: { url: data.publicUrl, mime: file.type || null, nombre: pendientes[i].file.name, bytes: file.size },
          }
        }),
      )

      const fallidos = resultados.filter(r => !r.ok)
      const archivos = resultados.flatMap(r => (r.ok ? [r.archivo] : []))
      if (archivos.length === 0) {
        setMsg({ tipo: 'error', texto: `No se pudo subir ningún archivo: ${fallidos[0] && !fallidos[0].ok ? fallidos[0].error : 'error de Storage'}` })
        return
      }

      setProgreso('Registrando en el historial...')
      const res = await fetch('/api/admin/evidencias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ solicitudId, nota: nota.trim() || undefined, archivos }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMsg({ tipo: 'error', texto: data.error ?? 'Los archivos subieron pero no se pudo registrar la evidencia.' })
        return
      }

      pendientes.forEach(p => { if (p.preview) URL.revokeObjectURL(p.preview) })
      setPendientes([])
      setNota('')
      await onSubido()
      setMsg({
        tipo: fallidos.length ? 'error' : 'ok',
        texto: fallidos.length
          ? `${archivos.length} archivo(s) registrados; ${fallidos.length} fallaron (${fallidos.map(f => (!f.ok ? f.nombre : '')).join(', ')}).`
          : `${archivos.length} archivo${archivos.length === 1 ? '' : 's'} registrado${archivos.length === 1 ? '' : 's'} en el historial del caso.`,
      })
    } catch (e) {
      setMsg({ tipo: 'error', texto: e instanceof Error ? e.message : 'Error de conexión.' })
    } finally {
      setSubiendo(false)
      setProgreso('')
    }
  }

  if (soloLectura && eventos.length === 0) return null

  return (
    <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
        Evidencia adicional del equipo{totalArchivos > 0 ? ` (${totalArchivos})` : ''}
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        Fotos, videos o PDF que llegan por WhatsApp o correo (del cliente, del técnico, del supervisor,
        de la transportadora) y que el flujo normal no captura. Quedan en el historial del caso y no se
        pueden borrar; no se envía nada al cliente ni al técnico.
      </p>

      {!soloLectura && (
        <div className="border-2 border-dashed border-gray-300 bg-gray-50/50 rounded-xl p-4">
          <SelectorFoto
            onFiles={agregar}
            multiple
            disabled={subiendo}
            acceptCamara="image/*"
            acceptGaleria={ACCEPT_GALERIA}
            labelCamara="📷 Tomar foto"
            labelGaleria="📎 Elegir fotos, videos o PDF"
          />
          <p className="mt-2 text-[11px] text-gray-400">
            Hasta {MAX_ARCHIVOS_EVIDENCIA_ADMIN} archivos por carga · fotos se comprimen al subir ·
            video máx {MAX_VIDEO_SIZE_MB} MB cada uno (si es más largo, súbelo en varios clips) · PDF máx {MAX_IMAGE_SIZE_MB} MB.
          </p>

          {pendientes.length > 0 && (
            <>
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                {pendientes.map((p, i) => (
                  <div key={`${p.file.name}-${i}`} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                    {p.preview ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.preview} alt={p.file.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white px-1">
                        <span className="text-2xl">{p.file.type === 'application/pdf' ? '📄' : '🎬'}</span>
                        <span className="text-[10px] truncate max-w-full">{p.file.name}</span>
                        <span className="text-[9px] text-gray-300">{fmtMB(p.file.size)}</span>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => quitar(i)}
                      disabled={subiendo}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center hover:bg-black/80"
                      aria-label={`Quitar ${p.file.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-start gap-3 flex-wrap sm:flex-nowrap">
                <input
                  type="text"
                  value={nota}
                  onChange={(e) => setNota(e.target.value)}
                  maxLength={1000}
                  disabled={subiendo}
                  placeholder="Nota opcional: de dónde viene y qué muestra (ej. fotos que mandó el cliente por WhatsApp)"
                  className="w-full sm:flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={subir}
                  disabled={subiendo}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                >
                  {subiendo ? (progreso || 'Subiendo...') : `Subir ${pendientes.length} archivo${pendientes.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {msg && (
        <div className={`mt-3 rounded-lg p-3 text-sm ${
          msg.tipo === 'ok'
            ? 'bg-green-50 border border-green-200 text-green-900'
            : 'bg-amber-50 border border-amber-200 text-amber-900'
        }`}>
          {msg.tipo === 'ok' ? '✅ ' : '⚠️ '}{msg.texto}
        </div>
      )}

      {eventos.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">Sin evidencia adicional todavía.</p>
      ) : (
        <div className="mt-4 space-y-4">
          {eventos.map((e) => {
            const archivos = archivosDeEvento(e)
            const subidoPor = typeof e.payload?.subido_por === 'string' ? e.payload.subido_por : e.actor
            return (
              <div key={e.id} className="rounded-lg border border-gray-200 bg-slate-50 p-3">
                <p className="text-sm text-slate-900 whitespace-pre-wrap">{e.motivo ?? '—'}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {new Date(e.ocurrido_at).toLocaleString('es-CO')}
                  {subidoPor ? ` · ${subidoPor}` : ''}
                  {` · ${archivos.length} archivo${archivos.length === 1 ? '' : 's'}`}
                </p>
                {archivos.length > 0 && (
                  <div className="mt-2 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {archivos.map((a, i) => (
                      <div key={`${a.url}-${i}`}>
                        <MediaEvidencia url={a.url} alt={a.nombre ?? `Evidencia ${i + 1}`} ring="hover:ring-slate-500" />
                        {(a.nombre || a.bytes) && (
                          <p className="mt-0.5 text-[10px] text-gray-400 truncate" title={a.nombre ?? undefined}>
                            {a.nombre ?? ''}{a.bytes ? ` · ${fmtMB(a.bytes)}` : ''}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
