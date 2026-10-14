'use client'

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  ESTADO_AUXILIAR_LABELS,
  type AuxiliarRow,
  type EstadoVerificacionAuxiliar,
} from '@/lib/utils/equipo'

/**
 * Equipo de trabajo del técnico — panel admin (2026-10-13).
 *
 * Lista los auxiliares que el técnico registró desde su portal y permite la
 * VERIFICACIÓN MANUAL de Baird (decisión 2026-10-13: solo un auxiliar
 * verificado se muestra al cliente y puede acompañar servicios). El admin ve
 * foto + documento COMPLETO (igual que con el técnico) para compararlo con
 * la cédula que el técnico envía. Lee y escribe por /api/admin/auxiliares
 * (la tabla está cerrada al browser).
 */
export default function EquipoAuxiliaresAdmin({ tecnicoId }: { tecnicoId: string }) {
  const [auxiliares, setAuxiliares] = useState<AuxiliarRow[]>([])
  const [disponible, setDisponible] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null)
  const [fotoExpandida, setFotoExpandida] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setMensaje({ texto: 'Sesión expirada — vuelve a iniciar sesión.', tipo: 'error' })
        return
      }
      const res = await fetch(`/api/admin/auxiliares?tecnicoId=${tecnicoId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setDisponible(body.disponible !== false)
      const lista = (body.auxiliares ?? []) as AuxiliarRow[]
      setAuxiliares(lista)
      setNotas(Object.fromEntries(lista.map(a => [a.id, a.nota_verificacion ?? ''])))
    } catch (err) {
      setMensaje({ texto: 'No se pudo cargar el equipo: ' + (err instanceof Error ? err.message : String(err)), tipo: 'error' })
    } finally {
      setCargando(false)
    }
  }, [tecnicoId])

  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (
    a: AuxiliarRow,
    cambios: { estado_verificacion?: EstadoVerificacionAuxiliar; activo?: boolean },
  ) => {
    if (cambios.activo === false && !window.confirm(`¿Dar de baja a ${a.nombre_completo}? Dejará de aparecer en los servicios activos del técnico.`)) return
    if (cambios.estado_verificacion === 'rechazado' && !window.confirm(`¿Rechazar a ${a.nombre_completo}? No podrá acompañar servicios hasta que lo verifiques.`)) return
    setOcupado(a.id)
    setMensaje(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('Sesión expirada')
      const res = await fetch('/api/admin/auxiliares', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ auxiliarId: a.id, ...cambios, nota: notas[a.id] ?? '' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setAuxiliares(prev => prev.map(x => (x.id === a.id ? (body.auxiliar as AuxiliarRow) : x)))
      setMensaje({
        texto: cambios.activo === false
          ? `${a.nombre_completo} dado de baja`
          : `${a.nombre_completo}: ${ESTADO_AUXILIAR_LABELS[cambios.estado_verificacion ?? 'pendiente'].toLowerCase()}`,
        tipo: 'exito',
      })
    } catch (err) {
      setMensaje({ texto: 'Error: ' + (err instanceof Error ? err.message : String(err)), tipo: 'error' })
    } finally {
      setOcupado(null)
    }
  }

  const colorEstado: Record<EstadoVerificacionAuxiliar, string> = {
    verificado: 'bg-green-50 text-green-700 border-green-200',
    pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
    rechazado: 'bg-red-50 text-red-700 border-red-200',
  }

  const activos = auxiliares.filter(a => a.activo)
  const inactivos = auxiliares.filter(a => !a.activo)
  const pendientes = activos.filter(a => a.estado_verificacion === 'pendiente').length

  return (
    <div className={`bg-white rounded-xl border shadow-sm p-5 mt-6 ${pendientes > 0 ? 'border-amber-300' : 'border-gray-200'}`}>
      {fotoExpandida && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer" onClick={() => setFotoExpandida(null)}>
          <div className="relative max-w-2xl max-h-[85vh] w-full h-full">
            <Image src={fotoExpandida} alt="Foto del auxiliar" fill className="object-contain" />
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Equipo de trabajo (auxiliares)</h2>
        <span className="text-[11px] text-gray-400">
          {activos.length} activo{activos.length !== 1 ? 's' : ''}
          {pendientes > 0 && <span className="text-amber-700 font-semibold"> · {pendientes} por verificar</span>}
        </span>
      </div>
      <p className="text-xs text-gray-400 mb-4">
        Personas que acompañan al técnico en los servicios. Las registra él desde su portal; el cliente SOLO ve a los
        <span className="font-semibold text-gray-600"> verificados</span> (nombre, foto y documento enmascarado). Pídele al técnico
        la cédula del auxiliar, compárala con estos datos y marca el estado. Si el técnico cambia nombre, documento o foto, vuelve a &ldquo;pendiente&rdquo;.
      </p>

      {mensaje && (
        <div className={`p-3 mb-4 rounded-lg text-xs font-medium ${mensaje.tipo === 'exito' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {mensaje.tipo === 'exito' ? '✅' : '⚠️'} {mensaje.texto}
        </div>
      )}

      {cargando ? (
        <p className="text-xs text-gray-400">Cargando…</p>
      ) : !disponible ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
          La tabla <code>tecnico_auxiliares</code> no está disponible (¿migración <code>20261013_tecnico_auxiliares.sql</code> sin aplicar?).
        </p>
      ) : activos.length === 0 && inactivos.length === 0 ? (
        <p className="text-sm text-gray-400">El técnico no ha registrado auxiliares. Va solo a los servicios.</p>
      ) : (
        <div className="space-y-3">
          {[...activos, ...inactivos].map(a => {
            const est = (a.estado_verificacion ?? 'pendiente') as EstadoVerificacionAuxiliar
            const ocupadoEste = ocupado === a.id
            return (
              <div key={a.id} className={`rounded-xl border p-4 ${a.activo ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                <div className="flex items-start gap-4">
                  <div
                    className="w-16 h-16 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shrink-0 relative cursor-pointer"
                    onClick={() => a.foto_perfil_url && setFotoExpandida(a.foto_perfil_url)}
                  >
                    {a.foto_perfil_url ? (
                      <Image src={a.foto_perfil_url} alt={a.nombre_completo} fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xl font-bold">{a.nombre_completo.charAt(0)}</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-slate-900">{a.nombre_completo}</p>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${a.activo ? colorEstado[est] : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
                        {a.activo ? ESTADO_AUXILIAR_LABELS[est] : 'Dado de baja'}
                      </span>
                      {a.activo && a.acompana_por_defecto && (
                        <span className="text-[10px] text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">acompaña por defecto</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1 font-mono">{a.tipo_documento} {a.numero_documento}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {a.whatsapp ? `+${a.whatsapp} · ` : ''}
                      registrado {a.created_at ? new Date(a.created_at).toLocaleDateString('es-CO') : '—'}
                      {a.autorizacion_datos_at ? ' · autorización de datos declarada por el técnico' : ''}
                      {a.fecha_verificacion && est === 'verificado' ? ` · verificado ${new Date(a.fecha_verificacion).toLocaleDateString('es-CO')}` : ''}
                    </p>
                    {a.activo && (
                      <>
                        <input
                          type="text"
                          value={notas[a.id] ?? ''}
                          onChange={e => setNotas(prev => ({ ...prev, [a.id]: e.target.value }))}
                          placeholder="Nota interna (opcional): qué revisaste, por qué rechazas…"
                          maxLength={300}
                          className="mt-2 w-full border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                        />
                        <div className="flex flex-wrap gap-2 mt-2">
                          {est !== 'verificado' && (
                            <button
                              type="button"
                              disabled={ocupadoEste}
                              onClick={() => actualizar(a, { estado_verificacion: 'verificado' })}
                              className="text-xs font-semibold bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
                            >
                              ✅ Verificar
                            </button>
                          )}
                          {est !== 'rechazado' && (
                            <button
                              type="button"
                              disabled={ocupadoEste}
                              onClick={() => actualizar(a, { estado_verificacion: 'rechazado' })}
                              className="text-xs font-semibold bg-white border border-red-200 text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
                            >
                              Rechazar
                            </button>
                          )}
                          {est !== 'pendiente' && (
                            <button
                              type="button"
                              disabled={ocupadoEste}
                              onClick={() => actualizar(a, { estado_verificacion: 'pendiente' })}
                              className="text-xs font-semibold bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg disabled:opacity-50"
                            >
                              Volver a pendiente
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={ocupadoEste}
                            onClick={() => actualizar(a, { activo: false })}
                            className="text-xs font-semibold text-gray-400 hover:text-red-600 px-2 py-1.5 disabled:opacity-50 ml-auto"
                          >
                            Dar de baja
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
