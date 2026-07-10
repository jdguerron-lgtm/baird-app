'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { formatCOP } from '@/lib/utils/format'
import type { ChecklistServicio } from '@/types/solicitud'
import { estimarPagoTecnicoGarantia } from '@/lib/utils/pago-tecnico'
import PagoTecnicoBreakdown from '@/components/ui/PagoTecnicoBreakdown'
import { compressImageIfNeeded, inferExtension, videoSizeAdvice } from '@/lib/utils/media'
import { querySupabase } from '@/lib/utils/retry'
import { trackError } from '@/lib/utils/track-error'
import type { ComplejidadServicio } from '@/lib/constants/tarifas/mabe'

/** Límite de tamaño del archivo recibido (post-compresión para imágenes, original para videos). */
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
/** Máximo de archivos adjuntables (igual al tope previo de "fotos", ahora también videos). */
const MAX_ARCHIVOS = 6

interface Servicio {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
  novedades_equipo: string
  direccion: string
  zona_servicio: string
  ciudad_pueblo: string
  pago_tecnico: number
  es_garantia: boolean
  created_at: string
  horario_confirmado: string | null
  triaje_resultado: { complejidad?: ComplejidadServicio | null } | null
}

interface TecnicoInfo {
  id: string
  nombre_completo: string
}

export default function CompletarServicioPage() {
  const { token, id } = useParams<{ token: string; id: string }>()
  const [tecnico, setTecnico] = useState<TecnicoInfo | null>(null)
  const [servicio, setServicio] = useState<Servicio | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(false)
  const [waSent, setWaSent] = useState<boolean | null>(null)
  const [waFiltered, setWaFiltered] = useState<boolean>(false)
  const [waError, setWaError] = useState<string | null>(null)

  // Archivos del servicio completado (fotos + opcional video corto).
  // 3 inputs separados para cubrir todas las combinaciones SO/navegador:
  // - cameraFotoInputRef: cámara modo foto (accept=image/* + capture=environment).
  // - cameraVideoInputRef: cámara modo video (accept=video/* + capture=environment).
  //   Algunos Android sin este atributo abren un picker genérico; con `capture`
  //   van directo a grabar.
  // - galeriaInputRef: sin capture → iOS/Android muestran la biblioteca con fotos
  //   y videos existentes. Es indispensable porque en iOS Safari `capture="environment"`
  //   oculta la opción "Photo Library" del native picker.
  //
  // El state se sigue llamando `fotos` por compat con la lógica existente (el
  // payload a evidencias_servicio guarda el array en la columna `fotos: string[]`),
  // pero ahora puede contener videos (placeholder 🎬 en el preview).
  const [fotos, setFotos] = useState<File[]>([])
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([])
  const cameraFotoInputRef = useRef<HTMLInputElement>(null)
  const cameraVideoInputRef = useRef<HTMLInputElement>(null)
  const galeriaInputRef = useRef<HTMLInputElement>(null)

  // Checklist
  const [checklist, setChecklist] = useState<ChecklistServicio>({
    diagnostico_realizado: false,
    pieza_reemplazada: false,
    pieza_detalle: '',
    prueba_encendido: false,
    prueba_ciclo_completo: false,
    limpieza_area: false,
    explicacion_cliente: false,
    notas_tecnico: '',
  })

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [drawing, setDrawing] = useState(false)
  const [hasFirma, setHasFirma] = useState(false)

  // GPS
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null)

  // Pago al técnico (garantía): proyección con la complejidad ya elegida en
  // el diagnóstico. Se asume TA + encuesta optimista para mostrar el techo;
  // el pago final se recalcula al cerrar y al recibir encuesta. Ver
  // src/lib/utils/pago-tecnico.ts y docs/TARIFAS.md § "Garantía MABE".
  const pagoBreakdown = useMemo(() => {
    if (!servicio?.es_garantia) return null
    const complejidad = (servicio.triaje_resultado?.complejidad ?? null) as ComplejidadServicio | null
    const diasSolucion = Math.floor(
      (Date.now() - new Date(servicio.created_at).getTime()) / (1000 * 60 * 60 * 24)
    )
    return estimarPagoTecnicoGarantia({
      complejidad,
      diasSolucion,
      horarioConfirmado: servicio.horario_confirmado,
      asumirOptimista: true,
    })
  }, [servicio])

  useEffect(() => {
    const cargar = async () => {
      // Queries independientes — paralelizamos para ahorrar un round-trip.
      // La validación de pertenencia se hace client-side. Sin RLS la
      // seguridad es la misma y la ganancia ~200-500ms en 4G.
      // querySupabase reintenta con backoff en fetch errors transitorios
      // (4G/3G inestable es común para el técnico abriendo el link en la calle).
      const [tecResult, solResult] = await Promise.all([
        querySupabase(() =>
          supabase
            .from('tecnicos')
            .select('id, nombre_completo')
            .eq('portal_token', token)
            .single()
        ),
        querySupabase(() =>
          supabase
            .from('solicitudes_servicio')
            .select('id, cliente_nombre, tipo_equipo, marca_equipo, novedades_equipo, direccion, zona_servicio, ciudad_pueblo, pago_tecnico, es_garantia, created_at, horario_confirmado, triaje_resultado, tecnico_asignado_id')
            .eq('id', id)
            .single()
        ),
      ])

      const tec = tecResult.data
      if (!tec) {
        trackError({
          error_type: 'page_load_error',
          error_message: tecResult.error?.message ?? 'tecnico not found by portal_token',
          actor: 'tecnico',
        })
        setError('Enlace inválido')
        setCargando(false)
        return
      }
      setTecnico(tec)

      const sol = solResult.data
      if (!sol || sol.tecnico_asignado_id !== tec.id) {
        trackError({
          error_type: 'page_load_error',
          error_message: solResult.error?.message ?? (sol ? 'sol not assigned to tec' : 'sol not found'),
          actor: 'tecnico',
        })
        setError('Servicio no encontrado o no asignado a ti')
        setCargando(false)
        return
      }

      setServicio(sol)
      setCargando(false)

      // Get GPS
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => {} // GPS optional
        )
      }
    }
    cargar()
  }, [token, id])

  // Photo / video handling.
  // Acepta image/* y video/* desde los 3 inputs (cámara foto, cámara video, galería).
  // - Las imágenes se comprimen al hacer submit (no acá) — preserva la foto original
  //   en memoria para que el técnico pueda quitarla sin haber gastado decode.
  // - Los videos no se pueden comprimir client-side sin ffmpeg.wasm (~25 MB).
  //   Si el video supera MAX_FILE_SIZE lo rechazamos acá con un mensaje accionable.
  const handlePhotos = (files: FileList | null) => {
    if (!files) return
    const slots = MAX_ARCHIVOS - fotos.length
    if (slots <= 0) return

    const aceptados: File[] = []
    let advice: string | null = null
    for (const file of Array.from(files).slice(0, slots)) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      if (!isImage && !isVideo) continue
      if (isVideo && file.size > MAX_FILE_SIZE) {
        advice = videoSizeAdvice()
        continue
      }
      aceptados.push(file)
    }

    if (aceptados.length === 0) {
      if (advice) setError(advice)
      return
    }

    const allFiles = [...fotos, ...aceptados]
    setFotos(allFiles)

    // Previews: imagen usa object URL; video usa placeholder 'video' (se renderiza con icono 🎬).
    const previews = allFiles.map(f => (f.type.startsWith('video/') ? 'video' : URL.createObjectURL(f)))
    fotoPreviews.forEach(p => { if (p !== 'video') URL.revokeObjectURL(p) })
    setFotoPreviews(previews)
    setError(advice) // null si todos pasaron; guía si rechazamos un video grande
  }

  const removePhoto = (idx: number) => {
    const url = fotoPreviews[idx]
    if (url && url !== 'video') URL.revokeObjectURL(url)
    setFotos(fotos.filter((_, i) => i !== idx))
    setFotoPreviews(fotoPreviews.filter((_, i) => i !== idx))
  }

  // Signature canvas handlers
  const getCanvasPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault()
    setDrawing(true)
    setHasFirma(true)
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getCanvasPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }, [])

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!drawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getCanvasPos(e)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1e293b'
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }, [drawing])

  const stopDraw = useCallback(() => setDrawing(false), [])

  const clearSignature = () => {
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) {
      ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height)
    }
    setHasFirma(false)
  }

  // Submit
  const handleSubmit = async () => {
    if (!tecnico || !servicio) return

    // Validate
    if (fotos.length === 0) {
      setError('Sube al menos una foto o video del servicio completado')
      return
    }
    const checklistItems = [
      checklist.diagnostico_realizado,
      checklist.prueba_encendido,
      checklist.limpieza_area,
      checklist.explicacion_cliente,
    ]
    if (checklistItems.filter(Boolean).length < 3) {
      setError('Completa al menos 3 items del checklist')
      return
    }

    setEnviando(true)
    setError(null)

    try {
      // 1. Comprimir imágenes y subir todos los archivos en paralelo.
      //
      // Cambios respecto al loop secuencial anterior:
      //
      // - Imágenes comprimidas client-side (2560 px máx, JPEG 0.9). Una foto
      //   iPhone HEIC de 5 MB termina en ~700 KB JPEG, y de paso queda en formato
      //   que Chrome/Firefox del admin sí decodifican (HEIC no es universal).
      // - `Promise.all` en vez de `for await`: subir 6 archivos en serie a 4G
      //   eran 45-90 s; en paralelo el cuello es el ancho de banda, no la latencia.
      // - Extensión inferida desde `file.type` (vía inferExtension) en vez de
      //   `file.name.split('.').pop()` — más confiable cuando viene de `capture`.
      // - Timestamp + random suffix evita colisiones si el técnico hace submit
      //   dos veces seguidas tras un error de red.
      // - Para videos no hay compresión client-side (requeriría ffmpeg.wasm).
      const stamp = Date.now()
      const rand = Math.random().toString(36).slice(2, 8)

      const uploadResults = await Promise.all(
        fotos.map(async (rawFile, i) => {
          const file = await compressImageIfNeeded(rawFile, { maxDimension: 2560, quality: 0.9 })
          // Defensa post-compresión: si tras comprimir aún excede el límite (caso raro,
          // ej. un video grande adjuntado), no lo subimos.
          if (file.size > MAX_FILE_SIZE) {
            return { ok: false as const, idx: i, error: `Archivo ${i + 1}: excede 10 MB tras compresión` }
          }
          const ext = inferExtension(file)
          const path = `${servicio.id}/${stamp}_${rand}_${i}.${ext}`
          const { error: uploadErr } = await supabase.storage
            .from('evidencias-servicio')
            .upload(path, file, { contentType: file.type || undefined, cacheControl: '3600', upsert: false })
          if (uploadErr) return { ok: false as const, idx: i, error: `Archivo ${i + 1}: ${uploadErr.message}` }
          const { data: urlData } = supabase.storage.from('evidencias-servicio').getPublicUrl(path)
          return { ok: true as const, idx: i, url: urlData.publicUrl }
        })
      )

      const fotoUrls = uploadResults.flatMap(r => (r.ok ? [r.url] : []))
      const uploadErrors = uploadResults.flatMap(r => (r.ok ? [] : [r.error]))

      // Verify at least 1 file uploaded successfully
      if (fotoUrls.length === 0) {
        const errMsg = uploadErrors.length > 0
          ? `Error subiendo archivos: ${uploadErrors.join(', ')}`
          : 'No se pudo subir ningún archivo. Verifica tu conexión.'
        throw new Error(errMsg)
      }

      // 2. Upload signature if present
      let firmaUrl: string | null = null
      if (hasFirma && canvasRef.current) {
        const blob = await new Promise<Blob | null>((resolve) =>
          canvasRef.current!.toBlob(resolve, 'image/png')
        )
        if (blob) {
          const firmaPath = `${servicio.id}/firma_${Date.now()}.png`
          const { error: firmaErr } = await supabase.storage
            .from('evidencias-servicio')
            .upload(firmaPath, blob, { contentType: 'image/png' })

          if (!firmaErr) {
            const { data: firmaUrlData } = supabase.storage
              .from('evidencias-servicio')
              .getPublicUrl(firmaPath)
            firmaUrl = firmaUrlData.publicUrl
          }
        }
      }

      // 3. Upsert evidence record — fila puede existir si oath ya creó una desde diagnóstico
      const { data: existente } = await supabase
        .from('evidencias_servicio')
        .select('id')
        .eq('solicitud_id', servicio.id)
        .eq('tecnico_id', tecnico.id)
        .maybeSingle()

      const evidenciaPayload = {
        fotos: fotoUrls,
        checklist,
        firma_url: firmaUrl,
        gps_lat: gps?.lat ?? null,
        gps_lng: gps?.lng ?? null,
        gps_completado_lat: gps?.lat ?? null,
        gps_completado_lng: gps?.lng ?? null,
        completado_at: new Date().toISOString(),
      }

      if (existente) {
        const { error: updErr } = await supabase
          .from('evidencias_servicio')
          .update(evidenciaPayload)
          .eq('id', existente.id)
        if (updErr) throw new Error(updErr.message)
      } else {
        const { error: insertErr } = await supabase
          .from('evidencias_servicio')
          .insert({
            solicitud_id: servicio.id,
            tecnico_id: tecnico.id,
            ...evidenciaPayload,
          })
        if (insertErr) throw new Error(insertErr.message)
      }

      // Registrar ping GPS de fase 'completado' para auditoría posterior (cron post-visita)
      if (gps) {
        fetch('/api/gps-ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ solicitudId: servicio.id, portalToken: token, fase: 'completado', lat: gps.lat, lng: gps.lng }),
        }).catch(() => {})
      }

      // 4. Update solicitud estado
      await supabase
        .from('solicitudes_servicio')
        .update({ estado: 'confirmacion_pendiente' })
        .eq('id', servicio.id)

      // 5. Trigger WhatsApp confirmation to customer (via API)
      try {
        const waRes = await fetch('/api/completar-servicio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            solicitudId: servicio.id,
            portalToken: token,
          }),
        })
        const waBody = await waRes.json().catch(() => ({}))
        if (!waRes.ok) {
          console.error('Error enviando WhatsApp de confirmación:', waRes.status, waBody)
          setWaSent(false)
          setWaError(typeof waBody?.error === 'string' ? waBody.error : `HTTP ${waRes.status}`)
        } else {
          setWaSent(!!waBody.whatsapp_sent)
          setWaFiltered(!!waBody.whatsapp_filtered)
          if (!waBody.whatsapp_sent && typeof waBody.whatsapp_error === 'string') {
            setWaError(waBody.whatsapp_error)
          }
        }
      } catch (waErr) {
        console.error('Error de red al enviar WhatsApp de confirmación:', waErr)
        setWaSent(false)
        setWaError(waErr instanceof Error ? waErr.message : 'Error de red al enviar WhatsApp')
      }

      setExito(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar evidencia')
    }

    setEnviando(false)
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (exito) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-md w-full">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Servicio registrado</h1>
          <p className="text-sm text-gray-500 mb-4">
            La evidencia quedó guardada en el sistema.
          </p>

          {/* WhatsApp status — fuente de verdad. */}
          {waSent === true && (
            <div className="mb-6 rounded-xl bg-green-50 border border-green-200 p-3 text-xs text-green-900 text-left">
              📤 <strong>WhatsApp enviado al cliente.</strong> Recibirá la solicitud de confirmación y podrá calificar el servicio.
            </div>
          )}
          {waSent === false && (
            <div className="mb-6 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 text-left">
              ⚠️ <strong>El WhatsApp al cliente NO se envió.</strong> El servicio quedó completado pero el cliente no recibirá la notificación automática.
              {waFiltered && (
                <span className="block mt-1">
                  Motivo: filtrado por <code>BAIRD_TEST_PHONE_WHITELIST</code> (modo test). Avisa al equipo Baird para que revise env vars y reenvíe desde el admin.
                </span>
              )}
              {!waFiltered && waError && (
                <span className="block mt-1 font-mono">Detalle: {waError}</span>
              )}
              {!waFiltered && !waError && (
                <span className="block mt-1">El equipo Baird puede reenviar el mensaje desde el panel admin.</span>
              )}
            </div>
          )}
          {waSent === null && (
            <p className="text-xs text-gray-400 mb-6">El cliente recibirá la solicitud de confirmación por WhatsApp.</p>
          )}

          <Link
            href={`/tecnico/${token}`}
            className="inline-block bg-slate-900 text-white text-sm font-semibold px-6 py-3 rounded-xl hover:bg-slate-800 transition-colors"
          >
            Volver a mis servicios
          </Link>
        </div>
      </div>
    )
  }

  if (error && !servicio) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-slate-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800"
          >
            Reintentar
          </button>
          <p className="text-[10px] text-gray-400 mt-3">Verificá tu conexión y volvé a cargar.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href={`/tecnico/${token}`} className="text-gray-400 hover:text-gray-600">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-sm font-bold text-slate-900">Completar servicio</h1>
            <p className="text-xs text-gray-400">
              {servicio?.tipo_equipo} {servicio?.marca_equipo} — {servicio?.cliente_nombre}
            </p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Service summary */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-bold text-slate-900">{servicio?.tipo_equipo} {servicio?.marca_equipo}</p>
              <p className="text-xs text-gray-500 mt-1">{servicio?.novedades_equipo.substring(0, 100)}</p>
              <p className="text-xs text-gray-400 mt-1">{servicio?.direccion}, {servicio?.zona_servicio}</p>
            </div>
            {!servicio?.es_garantia && (
              <p className="text-sm font-bold text-green-700">${formatCOP(servicio?.pago_tecnico ?? 0)}</p>
            )}
          </div>
        </div>

        {/* Pago al técnico (garantía): proyección detallada del pago */}
        {pagoBreakdown && (
          <PagoTecnicoBreakdown breakdown={pagoBreakdown} />
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 1. Evidencia del servicio (fotos + video opcional) */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Evidencia del servicio</h3>
          <p className="text-xs text-gray-400 mb-3">
            Equipo funcionando, placa de serie, repuesto, antes/después (máx 6).
            Puedes tomar fotos, grabar un video corto o subir desde la galería.
          </p>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {fotoPreviews.map((src, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                {src === 'video' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white">
                    <span className="text-2xl mb-0.5">🎬</span>
                    <span className="text-[10px] font-medium">Video</span>
                    <span className="text-[9px] text-gray-300 mt-0.5">
                      {(fotos[i]?.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                ) : (
                  <Image src={src} alt={`Evidencia ${i + 1}`} fill className="object-cover" unoptimized />
                )}
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center"
                >
                  X
                </button>
              </div>
            ))}
            {fotos.length < MAX_ARCHIVOS && (
              <button
                type="button"
                onClick={() => cameraFotoInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors"
              >
                <span className="text-xl mb-0.5">📷</span>
                <span className="text-[10px]">Cámara</span>
              </button>
            )}
          </div>

          {/* Botones secundarios: galería (foto/video) y cámara modo video.
              Mantenerlos separados garantiza que el técnico pueda elegir lo que
              necesite en cualquier SO/navegador — algunos Android sin `capture`
              en el input de video abren un picker genérico en vez de la cámara. */}
          {fotos.length < MAX_ARCHIVOS && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
              <button
                type="button"
                onClick={() => galeriaInputRef.current?.click()}
                className="text-xs text-gray-600 underline hover:text-slate-900"
              >
                🖼️ Elegir foto o video de galería
              </button>
              <button
                type="button"
                onClick={() => cameraVideoInputRef.current?.click()}
                className="text-xs text-gray-600 underline hover:text-slate-900"
              >
                🎬 Grabar video con cámara
              </button>
            </div>
          )}

          <p className="text-[10px] text-gray-400">
            {fotos.length}/{MAX_ARCHIVOS} archivos · Fotos se comprimen al subir; video máx 10 MB.
          </p>

          {/* Input cámara foto — capture="environment" abre la cámara trasera en modo foto. */}
          <input
            ref={cameraFotoInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            onChange={(e) => handlePhotos(e.target.files)}
          />

          {/* Input cámara video — capture="environment" abre la cámara trasera en modo video. */}
          <input
            ref={cameraVideoInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handlePhotos(e.target.files)}
          />

          {/* Input galería — SIN capture para que iOS/Android muestren la
              biblioteca de fotos y videos existentes. */}
          <input
            ref={galeriaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => handlePhotos(e.target.files)}
          />
        </div>

        {/* 2. Checklist */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-3">Checklist del servicio</h3>
          <div className="space-y-3">
            {([
              { key: 'diagnostico_realizado', label: 'Diagnóstico realizado' },
              { key: 'pieza_reemplazada', label: 'Pieza/repuesto reemplazado' },
              { key: 'prueba_encendido', label: 'Prueba de encendido/funcionamiento' },
              { key: 'prueba_ciclo_completo', label: 'Prueba de ciclo completo' },
              { key: 'limpieza_area', label: 'Limpieza del área de trabajo' },
              { key: 'explicacion_cliente', label: 'Explicación al cliente del trabajo realizado' },
            ] as const).map(({ key, label }) => (
              <label key={key} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checklist[key] as boolean}
                  onChange={(e) => setChecklist({ ...checklist, [key]: e.target.checked })}
                  className="w-5 h-5 rounded border-gray-300 text-slate-900 focus:ring-slate-900"
                />
                <span className="text-sm text-gray-700">{label}</span>
              </label>
            ))}

            {checklist.pieza_reemplazada && (
              <input
                type="text"
                placeholder="Detalle de la pieza reemplazada..."
                value={checklist.pieza_detalle ?? ''}
                onChange={(e) => setChecklist({ ...checklist, pieza_detalle: e.target.value })}
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            )}

            <textarea
              placeholder="Notas adicionales del servicio (opcional)..."
              value={checklist.notas_tecnico ?? ''}
              onChange={(e) => setChecklist({ ...checklist, notas_tecnico: e.target.value })}
              rows={2}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
          </div>
        </div>

        {/* 3. Signature */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Firma del cliente</h3>
              <p className="text-xs text-gray-400">El cliente firma con el dedo confirmando el servicio</p>
            </div>
            {hasFirma && (
              <button onClick={clearSignature} className="text-xs text-red-600 font-semibold">
                Borrar
              </button>
            )}
          </div>
          <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white touch-none">
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              className="w-full h-[120px]"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
          </div>
          {!hasFirma && (
            <p className="text-[10px] text-gray-300 text-center mt-1">Dibuja aquí</p>
          )}
        </div>

        {/* GPS indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-400">
          {gps ? (
            <>
              <span className="w-2 h-2 rounded-full bg-green-400" />
              Ubicación registrada
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-gray-300" />
              Ubicación no disponible (opcional)
            </>
          )}
        </div>

        {/* Validation summary — lista TODO lo que falta de una vez */}
        {(() => {
          const itemsChecklist = [
            checklist.diagnostico_realizado,
            checklist.prueba_encendido,
            checklist.limpieza_area,
            checklist.explicacion_cliente,
          ].filter(Boolean).length
          const faltantes: string[] = []
          if (fotos.length === 0) faltantes.push('Sube al menos una foto o video del servicio completado')
          if (itemsChecklist < 3) faltantes.push(`Marca al menos 3 items del checklist (tienes ${itemsChecklist}/4 obligatorios)`)
          const faltaFirma = !hasFirma
          if (faltantes.length === 0 && !faltaFirma) return null
          return (
            <div className="rounded-xl border bg-amber-50 border-amber-200 p-4">
              <p className="text-sm font-bold text-amber-900 mb-2">⚠️ Antes de enviar al cliente:</p>
              <ul className="text-xs text-amber-900 list-disc list-inside space-y-1">
                {faltantes.map((f, i) => <li key={i}>{f}</li>)}
                {faltaFirma && (
                  <li>
                    Recomendado: pedir firma del cliente confirmando el servicio (opcional pero deja constancia).
                  </li>
                )}
              </ul>
            </div>
          )
        })()}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={enviando || fotos.length === 0}
          className="w-full bg-slate-900 text-white font-bold py-4 rounded-xl hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
        >
          {enviando ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
              Enviando evidencia...
            </span>
          ) : (
            'Completar y enviar al cliente'
          )}
        </button>
      </div>
    </div>
  )
}
