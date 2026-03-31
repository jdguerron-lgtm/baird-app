'use client'

import { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { formatCOP } from '@/lib/utils/format'
import {
  TARIFAS_MANO_OBRA,
  TARIFA_KILOMETRO,
  calcularTotalGarantia,
  type ComplejidadServicio,
} from '@/lib/constants/tarifas-garantia'

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

export default function DiagnosticoPage() {
  const { token, id } = useParams<{ token: string; id: string }>()
  const router = useRouter()

  const [tecnico, setTecnico] = useState<{ id: string; nombre_completo: string } | null>(null)
  const [servicio, setServicio] = useState<Servicio | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(false)

  // Form state
  const [diagnosticoTexto, setDiagnosticoTexto] = useState('')
  const [complejidad, setComplejidad] = useState<ComplejidadServicio | null>(null)
  const [kilometros, setKilometros] = useState(0)
  const [requiereRepuestos, setRequiereRepuestos] = useState(false)
  const [repuestosDetalle, setRepuestosDetalle] = useState('')

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

  // Calculate totals
  const calculo = useMemo(() => {
    if (!complejidad) return null
    return calcularTotalGarantia(complejidad, kilometros, diasTranscurridos)
  }, [complejidad, kilometros, diasTranscurridos])

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

  const enviarDiagnostico = async () => {
    if (!complejidad || !diagnosticoTexto.trim() || diagnosticoTexto.length < 10) return
    if (!servicio || !tecnico || !calculo) return

    setEnviando(true)

    try {
      // Store diagnostic in triaje_resultado (JSONB)
      const diagnosticoData = {
        diagnostico_tecnico: diagnosticoTexto.trim(),
        complejidad,
        codigo_complejidad: calculo.complejidadInfo.codigo,
        tarifa_mano_obra: calculo.manoObra,
        kilometros,
        tarifa_kilometraje: calculo.kilometraje,
        bono_incentivo: calculo.bono,
        total_servicio: calculo.total,
        requiere_repuestos: requiereRepuestos,
        repuestos_detalle: requiereRepuestos ? repuestosDetalle.trim() : null,
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
        setError('Error al guardar el diagnostico: ' + updateErr.message)
        setEnviando(false)
        return
      }

      setExito(true)
    } catch {
      setError('Error de conexion')
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

  if (error) {
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
            <p className="text-gray-500 text-sm mb-2">
              Complejidad: <strong>{TARIFAS_MANO_OBRA[complejidad!].label}</strong>
            </p>
            <p className="text-2xl font-bold text-green-700 mb-4">
              ${formatCOP(calculo!.total)} COP
            </p>
            <p className="text-gray-400 text-xs mb-6">
              Ahora puedes proceder a realizar la reparacion. Cuando termines, completa el servicio con las evidencias.
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
            <div className="flex justify-between pt-2 border-t border-gray-100">
              <span className="text-gray-500">Dias desde solicitud</span>
              <span className={`font-bold ${diasTranscurridos <= 2 ? 'text-green-600' : diasTranscurridos <= 5 ? 'text-amber-600' : 'text-red-600'}`}>
                {diasTranscurridos} dia{diasTranscurridos !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Diagnostic form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Diagnostico del tecnico</h2>

          {/* Problem description */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Problema real identificado *
            </label>
            <textarea
              value={diagnosticoTexto}
              onChange={(e) => setDiagnosticoTexto(e.target.value)}
              placeholder="Describe el problema real encontrado en el equipo..."
              rows={3}
              className="w-full border border-gray-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
            />
            {diagnosticoTexto.length > 0 && diagnosticoTexto.length < 10 && (
              <p className="text-xs text-red-500 mt-1">Minimo 10 caracteres</p>
            )}
          </div>

          {/* Complexity selection */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Complejidad de la reparacion *
            </label>
            <div className="space-y-2">
              {(Object.entries(TARIFAS_MANO_OBRA) as [ComplejidadServicio, typeof TARIFAS_MANO_OBRA['baja']][]).map(([key, tarifa]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setComplejidad(key)}
                  className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                    complejidad === key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className={`text-sm font-bold ${complejidad === key ? 'text-purple-800' : 'text-slate-900'}`}>
                        {tarifa.codigo} - {tarifa.label}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">{tarifa.descripcion}</p>
                    </div>
                    <span className={`text-sm font-bold ${complejidad === key ? 'text-purple-700' : 'text-green-700'}`}>
                      ${formatCOP(tarifa.manoObra)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Kilometers */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Kilometros recorridos (ida)
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min="0"
                max="500"
                value={kilometros}
                onChange={(e) => setKilometros(Math.max(0, Number(e.target.value)))}
                className="w-28 border border-gray-200 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <span className="text-xs text-gray-500">
                x ${formatCOP(TARIFA_KILOMETRO)}/km = <strong>${formatCOP(kilometros * TARIFA_KILOMETRO)}</strong>
              </span>
            </div>
          </div>

          {/* Spare parts */}
          <div className="mb-5">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requiereRepuestos}
                onChange={(e) => setRequiereRepuestos(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300"
              />
              <span className="text-sm text-slate-700 font-medium">Requiere repuestos</span>
            </label>
            {requiereRepuestos && (
              <textarea
                value={repuestosDetalle}
                onChange={(e) => setRepuestosDetalle(e.target.value)}
                placeholder="Detalla los repuestos necesarios..."
                rows={2}
                className="w-full mt-2 border border-gray-200 rounded-xl py-2.5 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 resize-none"
              />
            )}
          </div>
        </div>

        {/* Pricing summary */}
        {calculo && (
          <div className="bg-white rounded-2xl shadow-sm border-2 border-green-200 p-5 mb-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Resumen de tarifa</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Mano de obra ({calculo.complejidadInfo.label})</span>
                <span className="font-semibold">${formatCOP(calculo.manoObra)}</span>
              </div>
              {calculo.kilometraje > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-600">Kilometraje ({kilometros} km)</span>
                  <span className="font-semibold">${formatCOP(calculo.kilometraje)}</span>
                </div>
              )}
              {calculo.bono > 0 && (
                <div className="flex justify-between text-green-700">
                  <span>Bono incentivo TSS ({diasTranscurridos} dias)</span>
                  <span className="font-semibold">+${formatCOP(calculo.bono)}</span>
                </div>
              )}
              {calculo.bono === 0 && diasTranscurridos > 8 && (
                <div className="flex justify-between text-red-500">
                  <span>Bono incentivo TSS (&gt;8 dias)</span>
                  <span className="font-semibold">$0</span>
                </div>
              )}
              <div className="flex justify-between pt-3 border-t-2 border-green-200">
                <span className="text-lg font-bold text-slate-900">Total</span>
                <span className="text-lg font-bold text-green-700">${formatCOP(calculo.total)} COP</span>
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={enviarDiagnostico}
          disabled={enviando || !complejidad || !diagnosticoTexto.trim() || diagnosticoTexto.length < 10}
          className={`w-full font-bold py-4 px-6 rounded-xl text-base transition-all shadow-sm mb-8 ${
            complejidad && diagnosticoTexto.length >= 10
              ? 'bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {enviando ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              Guardando...
            </span>
          ) : (
            'Registrar diagnostico'
          )}
        </button>
      </div>
    </div>
  )
}
