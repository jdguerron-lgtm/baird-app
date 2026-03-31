'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { formatCOP } from '@/lib/utils/format'

interface DatosConfirmacion {
  solicitud: {
    id: string
    tipo_equipo: string
    marca_equipo: string
    pago_tecnico: number
    novedades_equipo: string
    es_garantia: boolean
  }
  tecnico: {
    nombre_completo: string
  }
  fotos: string[]
  completado_at: string
}

export default function ConfirmarServicioPage() {
  const { token } = useParams<{ token: string }>()
  const [datos, setDatos] = useState<DatosConfirmacion | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<'idle' | 'rating' | 'enviando' | 'confirmado' | 'disputa'>('idle')
  const [calificacion, setCalificacion] = useState<number>(0)
  const [comentario, setComentario] = useState('')
  const [mostrarDisputa, setMostrarDisputa] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      // Find evidence by confirmation token
      const { data: evidencia } = await supabase
        .from('evidencias_servicio')
        .select('solicitud_id, tecnico_id, fotos, completado_at, confirmado')
        .eq('confirmacion_token', token)
        .single()

      if (!evidencia) {
        setError('Enlace invalido o expirado')
        setCargando(false)
        return
      }

      if (evidencia.confirmado !== null) {
        setEstado(evidencia.confirmado ? 'confirmado' : 'disputa')
        setCargando(false)
        return
      }

      // Load solicitud and tecnico
      const [{ data: sol }, { data: tec }] = await Promise.all([
        supabase
          .from('solicitudes_servicio')
          .select('id, tipo_equipo, marca_equipo, pago_tecnico, novedades_equipo, es_garantia')
          .eq('id', evidencia.solicitud_id)
          .single(),
        supabase
          .from('tecnicos')
          .select('nombre_completo')
          .eq('id', evidencia.tecnico_id)
          .single(),
      ])

      if (!sol || !tec) {
        setError('Datos del servicio no encontrados')
        setCargando(false)
        return
      }

      setDatos({
        solicitud: sol,
        tecnico: tec,
        fotos: evidencia.fotos ?? [],
        completado_at: evidencia.completado_at,
      })
      setCargando(false)
    }
    cargar()
  }, [token])

  const handleConfirm = async (satisfecho: boolean) => {
    setEstado('enviando')

    const comentarioFinal = satisfecho
      ? `Calificacion: ${calificacion}/10${comentario ? '. ' + comentario : ''}`
      : comentario

    // Atomic update: only confirm if not already confirmed (prevents double-click)
    const { data: updated, error: err } = await supabase
      .from('evidencias_servicio')
      .update({
        confirmado: satisfecho,
        confirmado_at: new Date().toISOString(),
        cliente_comentario: comentarioFinal || null,
      })
      .eq('confirmacion_token', token)
      .is('confirmado', null) // prevents double confirmation
      .select('solicitud_id')
      .single()

    if (err || !updated) {
      setError('Este servicio ya fue confirmado anteriormente.')
      setEstado(satisfecho ? 'confirmado' : 'disputa')
      return
    }

    // Update solicitud estado
    await supabase
      .from('solicitudes_servicio')
      .update({ estado: satisfecho ? 'completada' : 'en_disputa' })
      .eq('id', updated.solicitud_id)

    setEstado(satisfecho ? 'confirmado' : 'disputa')
  }

  // Extract model from novedades
  const modelo = datos?.solicitud.novedades_equipo?.match(/^\[Modelo:\s*(.+?)\]\s*/)?.[1] ?? null

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (estado === 'confirmado') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Servicio confirmado</h1>
          <p className="text-sm text-gray-500 mb-2">
            Gracias por confirmar. Tu servicio ha sido marcado como completado exitosamente.
          </p>
          {calificacion > 0 && (
            <p className="text-sm text-gray-400">
              Tu calificacion: <span className="font-bold text-slate-700">{calificacion}/10</span>
            </p>
          )}
          <p className="text-xs text-gray-300 mt-4">Baird Service — Tecnicos verificados en Colombia</p>
        </div>
      </div>
    )
  }

  if (estado === 'disputa') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">📋</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Reporte registrado</h1>
          <p className="text-sm text-gray-500">
            Hemos recibido tu reporte. El equipo de Baird Service se pondra en contacto contigo para resolver la situacion.
          </p>
          <p className="text-xs text-gray-300 mt-4">Baird Service — Tecnicos verificados en Colombia</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🔗</div>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  // Rating step - after clicking "Si, quede satisfecho"
  if (estado === 'rating') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-4 py-4">
          <div className="max-w-lg mx-auto flex items-center gap-3">
            <div className="relative w-28 h-8 shrink-0">
              <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
            </div>
            <p className="text-xs text-gray-400">Califica tu servicio</p>
          </div>
        </header>

        <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Como fue tu experiencia?</h2>
            <p className="text-xs text-gray-400 mb-5">
              Califica de 1 a 10 el servicio de <span className="font-semibold">{datos!.tecnico.nombre_completo}</span>
            </p>

            {/* Rating selector */}
            <div className="grid grid-cols-5 gap-2 mb-6">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                const isSelected = calificacion === n
                const colorClass = n <= 3
                  ? isSelected ? 'bg-red-500 text-white border-red-500' : 'border-red-200 text-red-600 hover:bg-red-50'
                  : n <= 5
                    ? isSelected ? 'bg-orange-500 text-white border-orange-500' : 'border-orange-200 text-orange-600 hover:bg-orange-50'
                    : n <= 7
                      ? isSelected ? 'bg-amber-500 text-white border-amber-500' : 'border-amber-200 text-amber-600 hover:bg-amber-50'
                      : isSelected ? 'bg-green-600 text-white border-green-600' : 'border-green-200 text-green-700 hover:bg-green-50'

                return (
                  <button
                    key={n}
                    onClick={() => setCalificacion(n)}
                    className={`aspect-square rounded-xl border-2 font-bold text-lg transition-all ${colorClass}`}
                  >
                    {n}
                  </button>
                )
              })}
            </div>

            {/* Labels */}
            <div className="flex justify-between text-[10px] text-gray-400 px-1 mb-4">
              <span>Malo</span>
              <span>Regular</span>
              <span>Excelente</span>
            </div>

            {/* Optional comment */}
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Comentario opcional sobre el servicio..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none mb-4"
            />

            {/* Confirm button */}
            <button
              onClick={() => handleConfirm(true)}
              disabled={calificacion === 0}
              className="w-full bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-sm"
            >
              Confirmar servicio con {calificacion}/10
            </button>
            <button
              onClick={() => { setEstado('idle'); setCalificacion(0) }}
              className="w-full text-gray-400 text-xs mt-2 py-2"
            >
              Volver
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <div className="relative w-28 h-8 shrink-0">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
          </div>
          <p className="text-xs text-gray-400">Confirma tu servicio</p>
        </div>
      </header>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Service info */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Servicio completado</h2>
          <div className="space-y-1.5 text-sm text-gray-600">
            <p>
              <span className="font-semibold text-gray-500">Equipo:</span>{' '}
              {datos!.solicitud.tipo_equipo} {datos!.solicitud.marca_equipo}
            </p>
            {modelo && (
              <p className="text-[10px] text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 rounded inline-block">
                {modelo}
              </p>
            )}
            <p>
              <span className="font-semibold text-gray-500">Tecnico:</span>{' '}
              {datos!.tecnico.nombre_completo}
            </p>
            {datos!.solicitud.es_garantia ? (
              <p className="text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-lg px-2 py-1 inline-block">
                Cubierto por garantia del fabricante
              </p>
            ) : (
              <p>
                <span className="font-semibold text-gray-500">Valor:</span>{' '}
                ${formatCOP(datos!.solicitud.pago_tecnico)} COP
              </p>
            )}
            <p>
              <span className="font-semibold text-gray-500">Completado:</span>{' '}
              {new Date(datos!.completado_at).toLocaleString('es-CO')}
            </p>
          </div>
        </div>

        {/* Evidence photos */}
        {datos!.fotos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Evidencia fotografica</h3>
            <div className="grid grid-cols-3 gap-2">
              {datos!.fotos.map((url, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                  <Image src={url} alt={`Evidencia ${i + 1}`} fill className="object-cover" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Confirmation buttons */}
        {!mostrarDisputa ? (
          <div className="space-y-3">
            <button
              onClick={() => setEstado('rating')}
              className="w-full bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-500 transition-colors text-sm"
            >
              Si, quede satisfecho ✓
            </button>
            <button
              onClick={() => setMostrarDisputa(true)}
              className="w-full bg-white text-orange-600 font-semibold py-3 rounded-xl border border-orange-200 hover:bg-orange-50 transition-colors text-sm"
            >
              Reportar un problema
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-orange-200 p-4 space-y-3">
            <h3 className="text-sm font-bold text-orange-800">Describe el problema</h3>
            <textarea
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Explica que salio mal o que no quedo bien..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => handleConfirm(false)}
                disabled={estado === 'enviando' || !comentario.trim()}
                className="flex-1 bg-orange-600 text-white font-semibold py-3 rounded-xl hover:bg-orange-500 disabled:opacity-50 transition-colors text-sm"
              >
                {estado === 'enviando' ? 'Enviando...' : 'Enviar reporte'}
              </button>
              <button
                onClick={() => setMostrarDisputa(false)}
                className="px-4 py-3 bg-gray-100 text-gray-600 font-semibold rounded-xl hover:bg-gray-200 transition-colors text-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
