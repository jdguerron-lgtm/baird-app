'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { ESTADO_ESTILOS, ESTADO_LABELS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'

interface Tecnico {
  id: string
  nombre_completo: string
  foto_perfil_url: string | null
}

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
  horario_visita_1: string
  horario_visita_2: string
  created_at: string
  tiene_evidencia?: boolean
}

export default function PortalTecnicoPage() {
  const { token } = useParams<{ token: string }>()
  const [tecnico, setTecnico] = useState<Tecnico | null>(null)
  const [servicios, setServicios] = useState<Servicio[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'activos' | 'historial'>('activos')

  useEffect(() => {
    const cargar = async () => {
      // 1. Buscar técnico por portal_token
      const { data: tec, error: tecErr } = await supabase
        .from('tecnicos')
        .select('id, nombre_completo, foto_perfil_url')
        .eq('portal_token', token)
        .single()

      if (tecErr || !tec) {
        setError('Enlace inválido o expirado')
        setCargando(false)
        return
      }

      setTecnico(tec)

      // 2. Cargar servicios asignados a este técnico
      const { data: sols } = await supabase
        .from('solicitudes_servicio')
        .select('id, cliente_nombre, tipo_equipo, marca_equipo, novedades_equipo, direccion, zona_servicio, ciudad_pueblo, pago_tecnico, estado, horario_visita_1, horario_visita_2, created_at')
        .eq('tecnico_asignado_id', tec.id)
        .order('created_at', { ascending: false })

      if (sols) {
        // Check which ones have evidence already
        const solIds = sols.map(s => s.id)
        const { data: evidencias } = await supabase
          .from('evidencias_servicio')
          .select('solicitud_id')
          .in('solicitud_id', solIds.length > 0 ? solIds : ['none'])

        const evidenciaSet = new Set(evidencias?.map(e => e.solicitud_id) ?? [])

        setServicios(sols.map(s => ({
          ...s,
          estado: s.estado ?? 'pendiente',
          pago_tecnico: s.pago_tecnico ?? 0,
          tiene_evidencia: evidenciaSet.has(s.id),
        })))
      }

      setCargando(false)
    }

    cargar()
  }, [token])

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Acceso no válido</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  const activos = servicios.filter(s => ['asignada', 'en_proceso'].includes(s.estado))
  const enVerificacion = servicios.filter(s => s.estado === 'en_verificacion')
  const historial = servicios.filter(s => ['completada', 'cancelada', 'en_disputa'].includes(s.estado))

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href="/" className="relative w-28 h-8 block shrink-0">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-900 truncate">
              {tecnico?.nombre_completo}
            </h1>
            <p className="text-xs text-gray-400">Portal del técnico</p>
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-blue-700">{activos.length}</p>
            <p className="text-[10px] font-semibold text-blue-600 uppercase">Activos</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-amber-700">{enVerificacion.length}</p>
            <p className="text-[10px] font-semibold text-amber-600 uppercase">Verificación</p>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold text-emerald-700">{historial.length}</p>
            <p className="text-[10px] font-semibold text-emerald-600 uppercase">Completados</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setTab('activos')}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
              tab === 'activos' ? 'bg-slate-900 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            En proceso ({activos.length + enVerificacion.length})
          </button>
          <button
            onClick={() => setTab('historial')}
            className={`text-sm font-semibold px-4 py-2 rounded-xl transition-colors ${
              tab === 'historial' ? 'bg-slate-900 text-white' : 'bg-white text-gray-500 border border-gray-200'
            }`}
          >
            Historial ({historial.length})
          </button>
        </div>

        {/* Service list */}
        <div className="space-y-3">
          {tab === 'activos' && (
            <>
              {[...activos, ...enVerificacion].length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                  <p className="text-gray-400 text-sm">No tienes servicios activos</p>
                  <p className="text-gray-300 text-xs mt-1">Cuando aceptes un servicio, aparecerá aquí</p>
                </div>
              ) : (
                [...activos, ...enVerificacion].map(s => (
                  <ServiceCard key={s.id} servicio={s} token={token} />
                ))
              )}
            </>
          )}
          {tab === 'historial' && (
            <>
              {historial.length === 0 ? (
                <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                  <p className="text-gray-400 text-sm">Sin servicios completados aún</p>
                </div>
              ) : (
                historial.map(s => (
                  <ServiceCard key={s.id} servicio={s} token={token} />
                ))
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ServiceCard({ servicio: s, token }: { servicio: Servicio; token: string }) {
  const needsDiagnostic = s.estado === 'asignada'
  const canComplete = s.estado === 'en_proceso' && !s.tiene_evidencia

  // Extract model from novedades if present
  const modeloMatch = s.novedades_equipo.match(/^\[Modelo:\s*(.+?)\]\s*/)
  const modelo = modeloMatch ? modeloMatch[1] : null
  const novedadesSinModelo = modeloMatch
    ? s.novedades_equipo.replace(modeloMatch[0], '').trim()
    : s.novedades_equipo

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4">
        {/* Header row */}
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-sm font-bold text-slate-900">
              {s.tipo_equipo} {s.marca_equipo}
            </p>
            {modelo && (
              <p className="text-[10px] text-gray-500 font-mono bg-gray-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">{modelo}</p>
            )}
            <p className="text-xs text-gray-400 mt-0.5">{s.cliente_nombre}</p>
          </div>
          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0 ${ESTADO_ESTILOS[s.estado] ?? 'bg-gray-100 text-gray-600'}`}>
            {ESTADO_LABELS[s.estado] ?? s.estado}
          </span>
        </div>

        {/* Details */}
        <div className="space-y-1.5 text-xs text-gray-600 mb-3">
          <p><span className="font-semibold text-gray-500">Problema:</span> {novedadesSinModelo.substring(0, 120)}{novedadesSinModelo.length > 120 ? '...' : ''}</p>
          <p><span className="font-semibold text-gray-500">Direccion:</span> {s.direccion}</p>
          <p><span className="font-semibold text-gray-500">Zona:</span> {s.zona_servicio}, {s.ciudad_pueblo}</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-gray-100">
          <p className="text-sm font-bold text-green-700">${formatCOP(s.pago_tecnico)} COP</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-300">
              {new Date(s.created_at).toLocaleDateString('es-CO')}
            </span>
            {needsDiagnostic && (
              <Link
                href={`/tecnico/${token}/diagnostico/${s.id}`}
                className="bg-purple-600 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-purple-700 transition-colors"
              >
                🔍 Diagnosticar
              </Link>
            )}
            {canComplete && (
              <Link
                href={`/tecnico/${token}/completar/${s.id}`}
                className="bg-slate-900 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-slate-800 transition-colors"
              >
                Completar servicio
              </Link>
            )}
            {s.estado === 'en_verificacion' && (
              <span className="text-xs text-amber-600 font-medium">Esperando confirmacion del cliente</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
