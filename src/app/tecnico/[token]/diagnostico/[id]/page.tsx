'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  TARIFAS_MANO_OBRA,
  BONO_INCENTIVO,
  calcularTotalGarantia,
  type ComplejidadServicio,
} from '@/lib/constants/tarifas-garantia'
import { formatCOP } from '@/lib/utils/format'

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
  estado: string
  es_garantia: boolean
  created_at: string
}

const MAX_EVIDENCIAS = 4
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB para fotos y videos

export default function DiagnosticoPage() {
  const { token, id } = useParams<{ token: string; id: string }>()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [tecnico, setTecnico] = useState<{ id: string; nombre_completo: string } | null>(null)
  const [servicio, setServicio] = useState<Servicio | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(false)
  const [progreso, setProgreso] = useState('')

  // Form state
  const [diagnosticoTexto, setDiagnosticoTexto] = useState('')
  const [complejidad, setComplejidad] = useState<ComplejidadServicio | null>(null)
  const [requiereRepuestos, setRequiereRepuestos] = useState(false)
  const [repuestosDetalle, setRepuestosDetalle] = useState('')
  const [evidencias, setEvidencias] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])

  // Extract model from novedades
  const modeloEquipo = useMemo(() => {
    const match = servicio?.novedades_equipo?.match(/^\[Modelo:\s*(.+?)\]\s*/)
    return match ? match[1] : null
  }, [servicio])

  const novedadesSinModelo = useMemo(() => {
    if (!servicio) return ''
    const match = servicio.novedades_equipo.match(/^\[Modelo:\s*.+?\]\s*/)
    return match ? servicio.novedades_equipo.replace(match[0], '').trim() : servicio.novedades_equipo
  }, [servicio])

  // Calculate days since creation
  const diasTranscurridos = useMemo(() => {
    if (!servicio) return 0
    const created = new Date(servicio.created_at)
    const now = new Date()
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
  }, [servicio])

  useEffect(() => {
    const cargar = async () => {
      const { data: tec } = await supabase
        .from('tecnicos')
        .select('id, nombre_completo')
        .eq('portal_token', token)
        .single()

      if (!tec) {
        setError('Enlace invalido')
        setCargando(false)
        return
      }
      setTecnico(tec)

      const { data: sol } = await supabase
        .from('solicitudes_servicio')
        .select('id, cliente_nombre, tipo_equipo, marca_equipo, novedades_equipo, direccion, zona_servicio, ciudad_pueblo, pago_tecnico, estado, es_garantia, created_at')
        .eq('id', id)
        .eq('tecnico_asignado_id', tec.id)
        .single()

      if (!sol) {
        setError('Servicio no encontrado')
        setCargando(false)
        return
      }

      if (sol.estado !== 'asignada') {
        setError('Este servicio ya fue diagnosticado')
        setCargando(false)
        return
      }

      setServicio(sol)
      setCargando(false)
    }
    cargar()
  }, [token, id])

  // Handle file selection (photos/videos)
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return
    const newFiles: File[] = []
    const newPreviews: string[] = []

    for (let i = 0; i < files.length && evidencias.length + newFiles.length < MAX_EVIDENCIAS; i++) {
      const file = files[i]
      if (file.size > MAX_FILE_SIZE) {
        setError(`${file.name} excede el limite de 10MB`)
        continue
      }
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        continue
      }
      newFiles.push(file)
      if (file.type.startsWith('image/')) {
        newPreviews.push(URL.createObjectURL(file))
      } else {
        newPreviews.push('video') // placeholder for video
      }
    }

    setEvidencias(prev => [...prev, ...newFiles])
    setPreviews(prev => [...prev, ...newPreviews])
    setError(null)
  }

  const removeEvidencia = (idx: number) => {
    setEvidencias(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => {
      const url = prev[idx]
      if (url && url !== 'video') URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const enviarDiagnostico = async () => {
    if (!complejidad || !diagnosticoTexto.trim() || diagnosticoTexto.length < 10) return
    if (!servicio || !tecnico) return
    if (evidencias.length === 0) {
      setError('Debes adjuntar al menos una foto o video del fallo')
      return
    }

    setEnviando(true)
    setError(null)

    try {
      // 1. Upload evidence files to Supabase Storage
      setProgreso('Subiendo evidencias...')
      const evidenciaUrls: string[] = []

      for (let i = 0; i < evidencias.length; i++) {
        const file = evidencias[i]
        const ext = file.name.split('.').pop() || (file.type.startsWith('video/') ? 'mp4' : 'jpg')
        const path = `${servicio.id}/diagnostico_${Date.now()}_${i}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('evidencias-servicio')
          .upload(path, file, { cacheControl: '3600', upsert: false })

        if (uploadErr) {
          console.error('Upload error:', uploadErr)
          continue
        }

        const { data: urlData } = supabase.storage
          .from('evidencias-servicio')
          .getPublicUrl(path)

        if (urlData?.publicUrl) {
          evidenciaUrls.push(urlData.publicUrl)
        }
      }

      if (evidenciaUrls.length === 0) {
        setError('Error al subir las evidencias. Intenta de nuevo.')
        setEnviando(false)
        return
      }

      // 2. Calculate pricing (hidden from technician)
      const calculo = calcularTotalGarantia(complejidad, 0, diasTranscurridos)

      // 3. Store diagnostic in triaje_resultado (JSONB)
      setProgreso('Guardando diagnostico...')
      const diagnosticoData = {
        diagnostico_tecnico: diagnosticoTexto.trim(),
        complejidad,
        codigo_complejidad: calculo.complejidadInfo.codigo,
        tarifa_mano_obra: calculo.manoObra,
        bono_incentivo: calculo.bono,
        total_servicio: calculo.total,
        requiere_repuestos: requiereRepuestos,
        repuestos_detalle: requiereRepuestos ? repuestosDetalle.trim() : null,
        evidencias_diagnostico: evidenciaUrls,
        diagnosticado_at: new Date().toISOString(),
        dias_transcurridos: diasTranscurridos,
      }

      const { error: updateErr } = await supabase
        .from('solicitudes_servicio')
        .update({
          triaje_resultado: diagnosticoData,
          pago_tecnico: calculo.total,
          estado: 'en_proceso',
        })
        .eq('id', servicio.id)

      if (updateErr) {
        setError('Error al guardar: ' + updateErr.message)
        setEnviando(false)
        return
      }

      setExito(true)
    } catch {
      setError('Error de conexion')
    }

    setEnviando(false)
    setProgreso('')
  }

  // Can submit?
  const canSubmit = complejidad && diagnosticoTexto.length >= 10 && evidencias.length > 0

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (error && !servicio) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Error</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  if (exito) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center">
            <div className="relative w-28 h-8">
              <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-start justify-center p-4 pt-12">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-green-700 mb-2">Diagnostico registrado</h1>
            <p className="text-gray-500 text-sm mb-6">
              Tu diagnostico ha sido registrado exitosamente. Ahora puedes proceder con la reparacion.
              Cuando termines, completa el servicio con las evidencias del trabajo realizado.
            </p>
            <button
              onClick={() => router.push(`/tecnico/${token}`)}
              className="w-full bg-slate-900 text-white font-semibold py-3 px-6 rounded-xl hover:bg-slate-800 transition-colors"
            >
              Volver a mis servicios
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="relative w-28 h-8">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
          </div>
          <span className="text-xs text-purple-700 bg-purple-100 px-2 py-1 rounded-full font-medium">
            Diagnostico
          </span>
        </div>
      </header>

      <div className="flex-1 max-w-lg mx-auto px-4 py-6 w-full">
        {/* Service summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Datos del servicio</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Equipo</span>
              <span className="font-semibold text-slate-900">{servicio!.tipo_equipo} {servicio!.marca_equipo}</span>
            </div>
            {modeloEquipo && (
              <div className="flex justify-between">
                <span className="text-gray-500">Modelo</span>
                <span className="font-mono text-xs text-slate-700 bg-gray-100 px-2 py-0.5 rounded">{modeloEquipo}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Cliente</span>
              <span className="text-slate-700">{servicio!.cliente_nombre}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Zona</span>
              <span className="text-slate-700">{servicio!.zona_servicio}, {servicio!.ciudad_pueblo}</span>
            </div>
            <div>
              <span className="text-gray-500">Problema reportado:</span>
              <p className="text-slate-700 text-xs mt-1">{novedadesSinModelo}</p>
            </div>
          </div>
        </div>

        {/* TSS Bonus incentive banner */}
        <div className={`rounded-2xl shadow-sm border-2 p-5 mb-4 ${
          diasTranscurridos <= 2 ? 'bg-green-50 border-green-300' :
          diasTranscurridos <= 5 ? 'bg-amber-50 border-amber-300' :
          diasTranscurridos <= 8 ? 'bg-orange-50 border-orange-300' :
          'bg-red-50 border-red-300'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">💰</span>
            <h3 className="text-sm font-bold text-slate-900">Bonificacion por pronta solucion</h3>
          </div>
          <p className="text-xs text-gray-600 mb-3">
            Resuelve rapido y gana un bono adicional. El bono depende de los dias transcurridos desde la solicitud y la complejidad del servicio.
          </p>
          <div className="bg-white/80 rounded-xl p-3">
            <div className="grid grid-cols-4 gap-1 text-[10px] font-semibold text-gray-500 uppercase mb-2">
              <span>Dias</span>
              <span className="text-center">Baja</span>
              <span className="text-center">Media</span>
              <span className="text-center">Alta</span>
            </div>
            {[
              { rango: '0-2', min: 0, max: 2 },
              { rango: '3-5', min: 3, max: 5 },
              { rango: '6-8', min: 6, max: 8 },
            ].map(({ rango, min, max }) => {
              const isActive = diasTranscurridos >= min && diasTranscurridos <= max
              return (
                <div key={rango} className={`grid grid-cols-4 gap-1 py-1.5 text-xs rounded-lg px-1 ${
                  isActive ? 'bg-purple-100 font-bold' : ''
                }`}>
                  <span className={isActive ? 'text-purple-800' : 'text-gray-600'}>{rango} dias</span>
                  <span className={`text-center ${isActive ? 'text-purple-800' : 'text-gray-700'}`}>
                    ${formatCOP(BONO_INCENTIVO.baja.find(b => b.min === min)?.bono ?? 0)}
                  </span>
                  <span className={`text-center ${isActive ? 'text-purple-800' : 'text-gray-700'}`}>
                    ${formatCOP(BONO_INCENTIVO.media.find(b => b.min === min)?.bono ?? 0)}
                  </span>
                  <span className={`text-center ${isActive ? 'text-purple-800' : 'text-gray-700'}`}>
                    ${formatCOP(BONO_INCENTIVO.alta.find(b => b.min === min)?.bono ?? 0)}
                  </span>
                </div>
              )
            })}
            {diasTranscurridos > 8 && (
              <div className="grid grid-cols-4 gap-1 py-1.5 text-xs rounded-lg px-1 bg-red-100 font-bold">
                <span className="text-red-700">&gt;8 dias</span>
                <span className="text-center text-red-600">$0</span>
                <span className="text-center text-red-600">$0</span>
                <span className="text-center text-red-600">$0</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className={`text-xs font-bold px-2 py-1 rounded-full ${
              diasTranscurridos <= 2 ? 'bg-green-200 text-green-800' :
              diasTranscurridos <= 5 ? 'bg-amber-200 text-amber-800' :
              diasTranscurridos <= 8 ? 'bg-orange-200 text-orange-800' :
              'bg-red-200 text-red-800'
            }`}>
              {diasTranscurridos} dia{diasTranscurridos !== 1 ? 's' : ''} transcurrido{diasTranscurridos !== 1 ? 's' : ''}
            </span>
            {diasTranscurridos <= 8 ? (
              <span className="text-xs text-gray-500">
                {diasTranscurridos <= 2 ? 'Bono maximo disponible!' : diasTranscurridos <= 5 ? 'Aun tienes bono disponible' : 'Ultimo rango de bonificacion'}
              </span>
            ) : (
              <span className="text-xs text-red-600">Sin bonificacion disponible</span>
            )}
          </div>
        </div>

        {/* Diagnostic form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Diagnostico del tecnico</h2>
          <p className="text-xs text-gray-400 mb-4">Registra el problema real identificado en el equipo</p>

          {/* Problem description */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Problema real identificado *
            </label>
            <textarea
              value={diagnosticoTexto}
              onChange={(e) => setDiagnosticoTexto(e.target.value)}
              placeholder="Describe detalladamente el problema real encontrado en el equipo..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            {diagnosticoTexto.length > 0 && diagnosticoTexto.length < 10 && (
              <p className="text-xs text-red-500 mt-1">Minimo 10 caracteres</p>
            )}
          </div>

          {/* Complexity selection — NO prices shown */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Nivel de complejidad de la reparacion *
            </label>
            <div className="space-y-2">
              {(Object.entries(TARIFAS_MANO_OBRA) as [ComplejidadServicio, typeof TARIFAS_MANO_OBRA['baja']][]).map(([key, tarifa]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setComplejidad(key)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all ${
                    complejidad === key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      complejidad === key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {tarifa.codigo}
                    </div>
                    <div>
                      <span className={`text-sm font-bold ${complejidad === key ? 'text-purple-800' : 'text-slate-900'}`}>
                        {tarifa.label}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">{tarifa.descripcion}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Spare parts */}
          <div className="mb-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requiereRepuestos}
                onChange={(e) => setRequiereRepuestos(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              <span className="text-sm text-slate-700 font-medium">Requiere repuestos</span>
            </label>
            {requiereRepuestos && (
              <textarea
                value={repuestosDetalle}
                onChange={(e) => setRepuestosDetalle(e.target.value)}
                placeholder="Detalla los repuestos necesarios (referencia, cantidad)..."
                rows={2}
                className="w-full mt-2 border border-gray-200 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
              />
            )}
          </div>
        </div>

        {/* Evidence upload */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Evidencia del fallo *</h2>
          <p className="text-xs text-gray-400 mb-4">
            Toma fotos o graba un video corto del problema identificado para justificar el diagnostico
          </p>

          {/* File grid */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {previews.map((preview, idx) => (
              <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                {preview === 'video' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white">
                    <span className="text-3xl mb-1">🎬</span>
                    <span className="text-xs font-medium">{evidencias[idx]?.name?.substring(0, 20)}</span>
                    <span className="text-[10px] text-gray-300 mt-0.5">
                      {(evidencias[idx]?.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={`Evidencia ${idx + 1}`} className="w-full h-full object-cover" />
                )}
                <button
                  onClick={() => removeEvidencia(idx)}
                  className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ))}

            {evidencias.length < MAX_EVIDENCIAS && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
              >
                <span className="text-2xl mb-1">📷</span>
                <span className="text-xs text-gray-500 font-medium">Foto o video</span>
                <span className="text-[10px] text-gray-400 mt-0.5">Max 10MB</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          <p className="text-[10px] text-gray-400">
            {evidencias.length}/{MAX_EVIDENCIAS} archivos · Fotos o videos del fallo encontrado
          </p>
        </div>

        {/* Error message */}
        {error && servicio && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Progress */}
        {progreso && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-blue-700 flex items-center gap-2">
              <span className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              {progreso}
            </p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={enviarDiagnostico}
          disabled={enviando || !canSubmit}
          className={`w-full font-bold py-4 px-6 rounded-xl text-base transition-all shadow-sm mb-8 ${
            canSubmit && !enviando
              ? 'bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {enviando ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              {progreso || 'Guardando...'}
            </span>
          ) : (
            'Registrar diagnostico'
          )}
        </button>

        {!canSubmit && !enviando && (
          <p className="text-center text-xs text-gray-400 -mt-4 mb-8">
            {!diagnosticoTexto || diagnosticoTexto.length < 10
              ? 'Describe el problema encontrado'
              : !complejidad
                ? 'Selecciona el nivel de complejidad'
                : 'Adjunta al menos una foto o video del fallo'}
          </p>
        )}
      </div>
    </div>
  )
}
