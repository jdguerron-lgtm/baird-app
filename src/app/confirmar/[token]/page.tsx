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
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'confirmado' | 'disputa'>('idle')
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
        setError('Enlace inválido o expirado')
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
          .select('id, tipo_equipo, marca_equipo, pago_tecnico')
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

    // Atomic update: only confirm if not already confirmed (prevents double-click)
    const { data: updated, error: err } = await supabase
      .from('evidencias_servicio')
      .update({
        confirmado: satisfecho,
        confirmado_at: new Date().toISOString(),
        cliente_comentario: comentario || null,
      })
      .eq('confirmacion_token', token)
      .is('confirmado', null) // ← prevents double confirmation
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
          <p className="text-sm text-gray-500">
            Gracias por confirmar. Tu servicio ha sido marcado como completado exitosamente.
          </p>
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
            Hemos recibido tu reporte. El equipo de Baird Service se pondrá en contacto contigo para resolver la situación.
          </p>
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
            <p><span className="font-semibold text-gray-500">Equipo:</span> {datos!.solicitud.tipo_equipo} {datos!.solicitud.marca_equipo}</p>
            <p><span className="font-semibold text-gray-500">Técnico:</span> {datos!.tecnico.nombre_completo}</p>
            <p><span className="font-semibold text-gray-500">Valor:</span> ${formatCOP(datos!.solicitud.pago_tecnico)} COP</p>
            <p><span className="font-semibold text-gray-500">Completado:</span> {new Date(datos!.completado_at).toLocaleString('es-CO')}</p>
          </div>
        </div>

        {/* Evidence photos */}
        {datos!.fotos.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Evidencia fotográfica</h3>
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
              onClick={() => handleConfirm(true)}
              disabled={estado === 'enviando'}
              className="w-full bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-500 disabled:opacity-50 transition-colors text-sm"
            >
              {estado === 'enviando' ? 'Enviando...' : 'Si, quede satisfecho ✓'}
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
              placeholder="Explica qué salió mal o qué no quedó bien..."
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
