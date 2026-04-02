'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { formatCOP } from '@/lib/utils/format'
import type { ChecklistServicio } from '@/types/solicitud'

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

  // Photos
  const [fotos, setFotos] = useState<File[]>([])
  const [fotoPreviews, setFotoPreviews] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    const cargar = async () => {
      // Validate portal token
      const { data: tec } = await supabase
        .from('tecnicos')
        .select('id, nombre_completo')
        .eq('portal_token', token)
        .single()

      if (!tec) {
        setError('Enlace inválido')
        setCargando(false)
        return
      }
      setTecnico(tec)

      // Load service
      const { data: sol } = await supabase
        .from('solicitudes_servicio')
        .select('id, cliente_nombre, tipo_equipo, marca_equipo, novedades_equipo, direccion, zona_servicio, ciudad_pueblo, pago_tecnico')
        .eq('id', id)
        .eq('tecnico_asignado_id', tec.id)
        .single()

      if (!sol) {
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

  // Photo handling
  const handlePhotos = (files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files).slice(0, 6 - fotos.length) // max 6 photos
    const allFiles = [...fotos, ...newFiles]
    setFotos(allFiles)

    // Generate previews
    const previews = allFiles.map(f => URL.createObjectURL(f))
    fotoPreviews.forEach(p => URL.revokeObjectURL(p))
    setFotoPreviews(previews)
  }

  const removePhoto = (idx: number) => {
    URL.revokeObjectURL(fotoPreviews[idx])
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
      setError('Sube al menos una foto del servicio completado')
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
      // 1. Upload photos to Supabase Storage (max 5MB each)
      const fotoUrls: string[] = []
      const uploadErrors: string[] = []
      for (let i = 0; i < fotos.length; i++) {
        const file = fotos[i]

        // Validate file size (max 5MB)
        if (file.size > 5 * 1024 * 1024) {
          uploadErrors.push(`Foto ${i + 1}: excede 5MB`)
          continue
        }

        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${servicio.id}/${Date.now()}_${i}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('evidencias-servicio')
          .upload(path, file, { contentType: file.type })

        if (uploadErr) {
          uploadErrors.push(`Foto ${i + 1}: ${uploadErr.message}`)
          continue
        }

        const { data: urlData } = supabase.storage
          .from('evidencias-servicio')
          .getPublicUrl(path)

        fotoUrls.push(urlData.publicUrl)
      }

      // Verify at least 1 photo uploaded successfully
      if (fotoUrls.length === 0) {
        const errMsg = uploadErrors.length > 0
          ? `Error subiendo fotos: ${uploadErrors.join(', ')}`
          : 'No se pudo subir ninguna foto. Verifica tu conexión.'
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

      // 3. Insert evidence record
      const { error: insertErr } = await supabase
        .from('evidencias_servicio')
        .insert({
          solicitud_id: servicio.id,
          tecnico_id: tecnico.id,
          fotos: fotoUrls,
          checklist,
          firma_url: firmaUrl,
          gps_lat: gps?.lat ?? null,
          gps_lng: gps?.lng ?? null,
        })

      if (insertErr) throw new Error(insertErr.message)

      // 4. Update solicitud estado
      await supabase
        .from('solicitudes_servicio')
        .update({ estado: 'en_verificacion' })
        .eq('id', servicio.id)

      // 5. Trigger WhatsApp confirmation to customer (via API)
      await fetch('/api/completar-servicio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitudId: servicio.id,
          portalToken: token,
        }),
      }).catch(() => {}) // Non-blocking

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
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Servicio registrado</h1>
          <p className="text-sm text-gray-500 mb-6">
            La evidencia fue enviada. El cliente recibirá una notificación para confirmar que quedó satisfecho.
          </p>
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
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <p className="text-sm text-gray-500">{error}</p>
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
            <p className="text-sm font-bold text-green-700">${formatCOP(servicio?.pago_tecnico ?? 0)}</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* 1. Photos */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Fotos del servicio</h3>
          <p className="text-xs text-gray-400 mb-3">Equipo funcionando, placa de serie, repuesto, antes/después (máx 6)</p>

          <div className="grid grid-cols-3 gap-2 mb-3">
            {fotoPreviews.map((src, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                <Image src={src} alt={`Foto ${i + 1}`} fill className="object-cover" />
                <button
                  onClick={() => removePhoto(i)}
                  className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center"
                >
                  X
                </button>
              </div>
            ))}
            {fotos.length < 6 && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-500 transition-colors"
              >
                <svg className="w-6 h-6 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="text-[10px]">Agregar</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
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

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={enviando}
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
