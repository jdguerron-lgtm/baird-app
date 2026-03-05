'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface SeedResult {
  tipo: string
  id: string
}

interface SolicitudOption {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  estado: string
  created_at: string
}

export default function AdminTestPage() {
  const [seedResult, setSeedResult] = useState<SeedResult | null>(null)
  const [seedError, setSeedError] = useState<string | null>(null)
  const [seedLoading, setSeedLoading] = useState(false)

  const [solicitudes, setSolicitudes] = useState<SolicitudOption[]>([])
  const [selectedSolId, setSelectedSolId] = useState('')
  const [notifyResult, setNotifyResult] = useState<Record<string, unknown> | null>(null)
  const [notifyLoading, setNotifyLoading] = useState(false)

  const [health, setHealth] = useState<Record<string, unknown> | null>(null)
  const [healthLoading, setHealthLoading] = useState(false)

  // Load recent solicitudes for the dropdown
  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('solicitudes_servicio')
        .select('id, cliente_nombre, tipo_equipo, estado, created_at')
        .order('created_at', { ascending: false })
        .limit(20)

      if (data) setSolicitudes(data.map(s => ({ ...s, estado: s.estado ?? 'pendiente' })))
    }
    load()
  }, [seedResult]) // Reload after seeding

  async function seedTecnico() {
    setSeedLoading(true)
    setSeedError(null)
    setSeedResult(null)

    const { data: tec, error: tecErr } = await supabase
      .from('tecnicos')
      .insert({
        nombre_completo: `Tecnico Prueba ${Date.now().toString(36)}`,
        whatsapp: '3001234567',
        ciudad_pueblo: 'Bogota',
        tipo_documento: 'CC',
        numero_documento: `TEST-${Date.now()}`,
        estado_verificacion: 'verificado',
        acepta_garantias: true,
      })
      .select('id')
      .single()

    if (tecErr || !tec) {
      setSeedError(tecErr?.message ?? 'Error creando tecnico')
      setSeedLoading(false)
      return
    }

    const { error: espErr } = await supabase.from('especialidades_tecnico').insert([
      { tecnico_id: tec.id, especialidad: 'Lavadoras' },
      { tecnico_id: tec.id, especialidad: 'Neveras y Nevecones' },
    ])

    if (espErr) {
      setSeedError(`Tecnico creado (${tec.id}) pero error en especialidades: ${espErr.message}`)
    } else {
      setSeedResult({ tipo: 'tecnico', id: tec.id })
    }
    setSeedLoading(false)
  }

  async function seedSolicitud() {
    setSeedLoading(true)
    setSeedError(null)
    setSeedResult(null)

    const { data, error } = await supabase
      .from('solicitudes_servicio')
      .insert({
        cliente_nombre: 'Cliente Prueba',
        cliente_telefono: '3009876543',
        direccion: 'Calle Test #1-23',
        ciudad_pueblo: 'Bogota',
        zona_servicio: 'Centro',
        marca_equipo: 'Samsung',
        tipo_equipo: 'Nevera',
        tipo_solicitud: 'Reparación',
        novedades_equipo: 'Solicitud de prueba creada desde admin test tools para diagnosticar el matching pipeline',
        es_garantia: false,
        pago_tecnico: 100000,
        horario_visita_1: 'Lun 10 Mar, 8:00 AM - 12:00 PM',
        horario_visita_2: 'Mar 11 Mar, 12:00 PM - 4:00 PM',
      })
      .select('id')
      .single()

    if (error || !data) {
      setSeedError(error?.message ?? 'Error creando solicitud')
    } else {
      setSeedResult({ tipo: 'solicitud', id: data.id })
    }
    setSeedLoading(false)
  }

  async function reNotify() {
    if (!selectedSolId) return
    setNotifyLoading(true)
    setNotifyResult(null)

    try {
      const res = await fetch('/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solicitudId: selectedSolId }),
      })
      const json = await res.json()
      setNotifyResult({ status: res.status, ...json })
    } catch (e) {
      setNotifyResult({ error: e instanceof Error ? e.message : 'Error de red' })
    }
    setNotifyLoading(false)
  }

  async function checkHealth() {
    setHealthLoading(true)
    try {
      const res = await fetch('/api/health')
      const json = await res.json()
      setHealth(json)
    } catch (e) {
      setHealth({ error: e instanceof Error ? e.message : 'Error de red' })
    }
    setHealthLoading(false)
  }

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Testing Tools</h1>
        <p className="text-sm text-gray-500 mt-1">
          Crear datos de prueba, disparar notificaciones y diagnosticar el matching pipeline.
        </p>
      </div>

      <div className="space-y-6">

        {/* Health Check */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Health Check</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={checkHealth}
              disabled={healthLoading}
              className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              {healthLoading ? 'Verificando...' : 'Verificar Servicios'}
            </button>
          </div>
          {health && (
            <pre className="mt-4 bg-gray-50 rounded-lg p-4 text-xs text-gray-700 overflow-x-auto">
              {JSON.stringify(health, null, 2)}
            </pre>
          )}
        </div>

        {/* Seed Data */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Seed Data</h2>
          <p className="text-xs text-gray-500 mb-4">
            Crea datos de prueba en la base de datos para testear el flujo completo.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={seedTecnico}
              disabled={seedLoading}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {seedLoading ? 'Creando...' : 'Crear Tecnico de Prueba'}
            </button>
            <button
              onClick={seedSolicitud}
              disabled={seedLoading}
              className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {seedLoading ? 'Creando...' : 'Crear Solicitud de Prueba'}
            </button>
          </div>

          {seedError && (
            <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700">{seedError}</p>
            </div>
          )}

          {seedResult && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700 font-medium">
                {seedResult.tipo === 'tecnico' ? 'Tecnico' : 'Solicitud'} creado: <code className="bg-green-100 px-1 rounded">{seedResult.id.slice(0, 8)}...</code>
              </p>
              <Link
                href={seedResult.tipo === 'tecnico' ? `/admin/tecnicos/${seedResult.id}` : `/admin/solicitudes/${seedResult.id}`}
                className="text-xs font-semibold text-green-700 hover:text-green-900 underline mt-1 inline-block"
              >
                Ver detalle →
              </Link>
            </div>
          )}
        </div>

        {/* Re-Notify */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Re-Notificar Solicitud</h2>
          <p className="text-xs text-gray-500 mb-4">
            Selecciona una solicitud y dispara la notificacion WhatsApp manualmente. Muestra la respuesta completa del API.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedSolId}
              onChange={(e) => setSelectedSolId(e.target.value)}
              className="flex-1 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            >
              <option value="">Seleccionar solicitud...</option>
              {solicitudes.map((s) => (
                <option key={s.id} value={s.id}>
                  #{s.id.slice(0, 8)} — {s.cliente_nombre} — {s.tipo_equipo} ({s.estado})
                </option>
              ))}
            </select>
            <button
              onClick={reNotify}
              disabled={notifyLoading || !selectedSolId}
              className="px-4 py-2 bg-orange-600 text-white text-sm font-semibold rounded-xl hover:bg-orange-700 disabled:opacity-50 transition-colors"
            >
              {notifyLoading ? 'Enviando...' : 'Enviar Notificacion'}
            </button>
          </div>

          {selectedSolId && (
            <Link
              href={`/admin/solicitudes/${selectedSolId}`}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 mt-3 inline-block"
            >
              Ver diagnostico de matching →
            </Link>
          )}

          {notifyResult && (
            <pre className="mt-4 bg-gray-50 rounded-lg p-4 text-xs text-gray-700 overflow-x-auto">
              {JSON.stringify(notifyResult, null, 2)}
            </pre>
          )}
        </div>

      </div>
    </div>
  )
}
