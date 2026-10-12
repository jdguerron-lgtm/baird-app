'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { FRANJAS_HORARIO, type FranjaHorario } from '@/lib/constants/franjas'
import { ESTADO_LABELS } from '@/lib/constants/estados'
import { addDaysYMD, claveSlot, inicioSemanaYMD } from '@/lib/utils/agenda-slots'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'

/**
 * /tecnico/{token}/agenda — calendario semanal del técnico.
 *
 * Por día y franja muestra los servicios Baird que aceptó (azul) y los
 * compromisos que registra por fuera de la plataforma (gris), con el conteo
 * `n/cupo` del slot. El cupo es el mismo que aplica el server al aceptar
 * (MAX_SERVICIOS_TECNICO_POR_FRANJA): cuando una franja llega al tope, o el
 * técnico la cierra, ya no puede aceptar más servicios Baird en ella.
 *
 * Datos vía GET/POST/DELETE /api/tecnico/agenda (service_role; la tabla
 * `agenda_tecnico_bloqueos` está cerrada al anon). El API ya devuelve
 * `fecha` (día CO) + `franja` resueltos — aquí no hay aritmética de TZ.
 */

interface ServicioAgenda {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
  tipo_solicitud: string | null
  direccion: string
  zona_servicio: string
  ciudad_pueblo: string
  estado: string
  es_garantia: boolean
  horario_confirmado: string | null
  fecha: string
  franja: FranjaHorario
}

type ServicioSinFecha = Omit<ServicioAgenda, 'fecha' | 'franja'>

interface Bloqueo {
  id: string
  fecha: string
  franja: FranjaHorario
  titulo: string
  nota: string | null
  bloquea_franja: boolean
}

interface AgendaData {
  tecnico: { id: string; nombre_completo: string }
  cupo: number
  hoy: string
  servicios: ServicioAgenda[]
  sinFecha: ServicioSinFecha[]
  bloqueos: Bloqueo[]
  /** false si la tabla de bloqueos no respondió (p. ej. migración sin aplicar) */
  bloqueosDisponibles?: boolean
}

const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function partesYMD(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number)
  return { y, m, d, dow: new Date(Date.UTC(y, m - 1, d)).getUTCDay() }
}

function tituloSemana(lunes: string): string {
  const a = partesYMD(lunes)
  const b = partesYMD(addDaysYMD(lunes, 6))
  if (a.m === b.m) return `${a.d} al ${b.d} de ${MESES[a.m - 1]}`
  return `${a.d} de ${MESES[a.m - 1]} al ${b.d} de ${MESES[b.m - 1]}`
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function nombreCorto(nombre: string | null | undefined): string {
  if (!nombre) return 'Cliente'
  return nombre.trim().split(/\s+/)[0]
}

async function fetchConReintento(input: RequestInfo, init?: RequestInit, intentos = 2): Promise<Response> {
  let ultimo: unknown
  for (let i = 0; i < intentos; i++) {
    try {
      return await fetch(input, init)
    } catch (e) {
      ultimo = e
      await new Promise(r => setTimeout(r, 600 * (i + 1)))
    }
  }
  throw ultimo instanceof Error ? ultimo : new Error('Sin conexión')
}

export default function AgendaTecnicoPage() {
  const { token } = useParams<{ token: string }>()
  const [hoy] = useState(() => fechaColombiaYMD())
  const [lunes, setLunes] = useState(() => inicioSemanaYMD(fechaColombiaYMD()))
  const [data, setData] = useState<AgendaData | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null)
  const [nuevo, setNuevo] = useState<{ fecha: string; franja: FranjaHorario } | null>(null)
  const [borrando, setBorrando] = useState<string | null>(null)

  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => addDaysYMD(lunes, i)), [lunes])

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true)
    setError(null)
    try {
      const qs = new URLSearchParams({ portalToken: token, desde: lunes, hasta: addDaysYMD(lunes, 6) })
      const res = await fetchConReintento(`/api/tecnico/agenda?${qs.toString()}`, { cache: 'no-store' })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json) {
        setError(res.status === 401 ? 'Enlace inválido o expirado' : (json?.error ?? 'No se pudo cargar la agenda'))
        return
      }
      setData(json as AgendaData)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la agenda')
    } finally {
      setCargando(false)
    }
  }, [token, lunes])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 3500)
    return () => clearTimeout(t)
  }, [aviso])

  // Índices por slot
  const porSlot = useMemo(() => {
    const servicios = new Map<string, ServicioAgenda[]>()
    const bloqueos = new Map<string, Bloqueo[]>()
    for (const s of data?.servicios ?? []) {
      const k = claveSlot(s.fecha, s.franja)
      servicios.set(k, [...(servicios.get(k) ?? []), s])
    }
    for (const b of data?.bloqueos ?? []) {
      const k = claveSlot(b.fecha, b.franja)
      bloqueos.set(k, [...(bloqueos.get(k) ?? []), b])
    }
    return { servicios, bloqueos }
  }, [data])

  const borrar = async (b: Bloqueo) => {
    if (!confirm(`¿Quitar "${b.titulo}" de tu agenda?`)) return
    setBorrando(b.id)
    try {
      const res = await fetchConReintento('/api/tecnico/agenda', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalToken: token, id: b.id }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) throw new Error(json?.error ?? 'No se pudo quitar')
      setData(prev => prev ? { ...prev, bloqueos: prev.bloqueos.filter(x => x.id !== b.id) } : prev)
      setAviso({ texto: 'Compromiso quitado', tipo: 'exito' })
    } catch (e) {
      setAviso({ texto: e instanceof Error ? e.message : 'No se pudo quitar', tipo: 'error' })
    } finally {
      setBorrando(null)
    }
  }

  const cupo = data?.cupo ?? 3
  const totalSemanaBaird = data?.servicios.length ?? 0
  const totalSemanaExt = data?.bloqueos.length ?? 0

  if (error && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">No pudimos abrir tu agenda</h1>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => cargar()}
            className="bg-slate-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800"
          >
            Reintentar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4 sticky top-0 z-20">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/" className="relative w-28 h-9 block shrink-0">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill sizes="112px" className="object-contain object-left" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-900 truncate">📅 Mi agenda</h1>
            <p className="text-xs text-gray-400 truncate">{data?.tecnico.nombre_completo ?? 'Portal del técnico'}</p>
          </div>
          <Link
            href={`/tecnico/${token}`}
            className="shrink-0 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2"
          >
            ← Servicios
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">
        {/* Explicación corta */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 text-xs text-gray-600 space-y-1.5">
          <p className="text-sm font-semibold text-slate-900">Organiza tu semana en un solo lugar</p>
          <p>
            Aquí ves los servicios Baird que aceptaste y puedes agregar tus compromisos por fuera de la plataforma
            (otros clientes, taller, diligencias). Cada franja admite hasta <strong>{cupo} compromisos</strong>:
            si la llenas o la cierras, no te llegarán más servicios Baird en esa franja.
          </p>
          <div className="flex flex-wrap gap-3 pt-1 text-[11px]">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 border border-blue-300 inline-block" /> Servicio Baird</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-200 border border-gray-300 inline-block" /> Compromiso externo</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 border border-red-300 inline-block" /> Franja llena / cerrada</span>
          </div>
        </div>

        {/* Navegación de semana */}
        <div className="bg-white border border-gray-200 rounded-xl p-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLunes(addDaysYMD(lunes, -7))}
            className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 font-bold hover:bg-gray-50"
            aria-label="Semana anterior"
          >
            ‹
          </button>
          <div className="flex-1 text-center">
            <p className="text-sm font-bold text-slate-900">Semana del {tituloSemana(lunes)}</p>
            <p className="text-[11px] text-gray-400">
              {totalSemanaBaird} Baird · {totalSemanaExt} externos
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLunes(inicioSemanaYMD(hoy))}
            className="text-xs font-semibold text-slate-700 border border-gray-200 rounded-lg px-2.5 h-9 hover:bg-gray-50"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => setLunes(addDaysYMD(lunes, 7))}
            className="w-9 h-9 rounded-lg border border-gray-200 text-gray-600 font-bold hover:bg-gray-50"
            aria-label="Semana siguiente"
          >
            ›
          </button>
        </div>

        {aviso && (
          <div className={`text-sm font-medium rounded-xl px-4 py-3 border ${aviso.tipo === 'exito' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
            {aviso.texto}
          </div>
        )}
        {error && data && (
          <div className="text-sm rounded-xl px-4 py-3 border bg-red-50 border-red-200 text-red-700">{error}</div>
        )}
        {data && data.bloqueosDisponibles === false && (
          <div className="text-xs rounded-xl px-4 py-3 border bg-amber-50 border-amber-200 text-amber-800">
            Por ahora no pudimos cargar tus compromisos externos. Los servicios Baird sí están al día.
          </div>
        )}

        {/* Días */}
        {cargando && !data ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
          </div>
        ) : (
          <div className={`space-y-3 ${cargando ? 'opacity-60' : ''}`}>
            {dias.map(dia => {
              const p = partesYMD(dia)
              const esHoy = dia === hoy
              const pasado = dia < hoy
              return (
                <section
                  key={dia}
                  className={`rounded-xl border overflow-hidden ${esHoy ? 'border-slate-900 shadow-sm' : 'border-gray-200'} ${pasado ? 'opacity-70' : ''} bg-white`}
                >
                  <div className={`px-4 py-2.5 flex items-center justify-between ${esHoy ? 'bg-slate-900 text-white' : 'bg-gray-50 text-slate-800'}`}>
                    <p className="text-sm font-bold">
                      {cap(DIAS_LARGOS[p.dow])} {p.d} de {MESES[p.m - 1]}
                    </p>
                    {esHoy && <span className="text-[10px] font-semibold uppercase tracking-wide bg-white/15 rounded px-2 py-0.5">Hoy</span>}
                  </div>
                  <div className="divide-y divide-gray-100">
                    {FRANJAS_HORARIO.map(f => {
                      const k = claveSlot(dia, f.value)
                      const servicios = porSlot.servicios.get(k) ?? []
                      const bloqueos = porSlot.bloqueos.get(k) ?? []
                      const n = servicios.length + bloqueos.length
                      const cerrada = bloqueos.some(b => b.bloquea_franja)
                      const llena = cerrada || n >= cupo
                      return (
                        <div key={f.value} className={`px-4 py-2.5 ${llena ? 'bg-red-50/40' : ''}`}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-semibold text-gray-700">
                              <span className="mr-1">{f.icon}</span>{f.label}
                            </p>
                            <div className="flex items-center gap-2 shrink-0">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                  cerrada ? 'bg-red-100 text-red-700'
                                  : n <= 0 ? 'bg-gray-100 text-gray-400'
                                  : n >= cupo ? 'bg-red-100 text-red-700'
                                  : 'bg-amber-100 text-amber-700'
                                }`}
                                title={cerrada ? 'Franja cerrada por ti' : `${n} de ${cupo} compromisos`}
                              >
                                {cerrada ? 'Cerrada' : `${n}/${cupo}`}
                              </span>
                              {!pasado && (
                                <button
                                  type="button"
                                  onClick={() => setNuevo({ fecha: dia, franja: f.value })}
                                  className="text-[11px] font-semibold text-slate-700 border border-gray-200 rounded-lg px-2 py-1 hover:bg-gray-50"
                                >
                                  + Agregar
                                </button>
                              )}
                            </div>
                          </div>
                          {(servicios.length > 0 || bloqueos.length > 0) && (
                            <div className="mt-2 space-y-1.5">
                              {servicios.map(s => (
                                <div key={s.id} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="text-xs font-semibold text-blue-900">
                                      {s.tipo_equipo} {s.marca_equipo} · {nombreCorto(s.cliente_nombre)}
                                    </p>
                                    <span className="text-[10px] font-semibold text-blue-700 bg-white/70 rounded px-1.5 py-0.5 shrink-0">
                                      {s.es_garantia ? 'Garantía' : (s.tipo_solicitud ?? 'Particular')}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-blue-800/80 mt-0.5">
                                    {s.zona_servicio}, {s.ciudad_pueblo} · {ESTADO_LABELS[s.estado] ?? s.estado}
                                  </p>
                                </div>
                              ))}
                              {bloqueos.map(b => (
                                <div key={b.id} className="bg-gray-100 border border-gray-200 rounded-lg px-3 py-2 flex items-start gap-2">
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-gray-800">
                                      {b.bloquea_franja && <span className="mr-1" title="Franja cerrada">⛔</span>}
                                      {b.titulo}
                                    </p>
                                    {b.nota && <p className="text-[11px] text-gray-500 mt-0.5 whitespace-pre-line">{b.nota}</p>}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => borrar(b)}
                                    disabled={borrando === b.id}
                                    className="text-[11px] text-gray-400 hover:text-red-600 shrink-0 disabled:opacity-50"
                                    aria-label="Quitar compromiso"
                                  >
                                    {borrando === b.id ? '…' : '✕ Quitar'}
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </section>
              )
            })}
          </div>
        )}

        {/* Servicios activos sin fecha confirmada */}
        {data && data.sinFecha.length > 0 && (
          <section className="bg-white border border-amber-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-200">
              <p className="text-sm font-bold text-amber-900">⏳ Servicios activos sin fecha confirmada ({data.sinFecha.length})</p>
              <p className="text-[11px] text-amber-800/80">Aparecerán en el calendario cuando el cliente confirme el horario.</p>
            </div>
            <div className="divide-y divide-gray-100">
              {data.sinFecha.map(s => (
                <div key={s.id} className="px-4 py-2.5">
                  <p className="text-xs font-semibold text-slate-900">
                    {s.tipo_equipo} {s.marca_equipo} · {nombreCorto(s.cliente_nombre)}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {s.zona_servicio}, {s.ciudad_pueblo} · {ESTADO_LABELS[s.estado] ?? s.estado}
                    {s.horario_confirmado ? ` · ${s.horario_confirmado}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {nuevo && (
        <NuevoBloqueoModal
          token={token}
          fecha={nuevo.fecha}
          franja={nuevo.franja}
          onClose={() => setNuevo(null)}
          onCreado={b => {
            setData(prev => prev ? { ...prev, bloqueos: [...prev.bloqueos, b] } : prev)
            setNuevo(null)
            setAviso({ texto: 'Compromiso agregado a tu agenda', tipo: 'exito' })
          }}
        />
      )}
    </div>
  )
}

function NuevoBloqueoModal({
  token, fecha, franja, onClose, onCreado,
}: {
  token: string
  fecha: string
  franja: FranjaHorario
  onClose: () => void
  onCreado: (b: Bloqueo) => void
}) {
  const [titulo, setTitulo] = useState('')
  const [nota, setNota] = useState('')
  const [bloqueaFranja, setBloqueaFranja] = useState(false)
  const [franjaSel, setFranjaSel] = useState<FranjaHorario>(franja)
  const [guardando, setGuardando] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const p = partesYMD(fecha)

  const guardar = async () => {
    if (!titulo.trim()) {
      setErr('Escribe un título (ej. "Servicio particular", "Taller").')
      return
    }
    setGuardando(true)
    setErr(null)
    try {
      const res = await fetchConReintento('/api/tecnico/agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalToken: token,
          fecha,
          franja: franjaSel,
          titulo: titulo.trim(),
          nota: nota.trim() || undefined,
          bloquea_franja: bloqueaFranja,
        }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.bloqueo) throw new Error(json?.error ?? 'No se pudo guardar')
      onCreado(json.bloqueo as Bloqueo)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-end sm:items-center justify-center px-0 sm:px-4" role="dialog" aria-modal="true" aria-label="Agregar compromiso">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-5 space-y-4">
        <div>
          <p className="text-base font-bold text-slate-900">Agregar compromiso externo</p>
          <p className="text-xs text-gray-500">{cap(DIAS_LARGOS[p.dow])} {p.d} de {MESES[p.m - 1]}</p>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-700 mb-1">Franja</label>
          <div className="grid grid-cols-2 gap-2">
            {FRANJAS_HORARIO.map(f => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFranjaSel(f.value)}
                className={`text-xs font-medium rounded-lg border px-2 py-2 text-left ${franjaSel === f.value ? 'border-slate-900 bg-slate-900 text-white' : 'border-gray-200 text-gray-700'}`}
              >
                {f.icon} {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="blq-titulo" className="block text-xs font-semibold text-gray-700 mb-1">¿Qué tienes?</label>
          <input
            id="blq-titulo"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            maxLength={80}
            placeholder='Ej. "Servicio particular", "Taller", "Diligencia"'
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          />
        </div>

        <div>
          <label htmlFor="blq-nota" className="block text-xs font-semibold text-gray-700 mb-1">Nota (opcional)</label>
          <textarea
            id="blq-nota"
            value={nota}
            onChange={e => setNota(e.target.value)}
            maxLength={300}
            rows={2}
            placeholder="Dirección, cliente, recordatorio…"
            className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-slate-900/20"
          />
        </div>

        <label className="flex items-start gap-3 bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer">
          <input
            type="checkbox"
            checked={bloqueaFranja}
            onChange={e => setBloqueaFranja(e.target.checked)}
            className="mt-0.5 w-4 h-4"
          />
          <span className="text-xs text-gray-700">
            <span className="font-semibold block">Cerrar toda la franja</span>
            No me ofrezcan más servicios Baird en esta franja, aunque tenga cupo.
          </span>
        </label>

        {err && <p className="text-xs text-red-600 font-medium">{err}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={guardando}
            className="flex-1 text-sm font-semibold text-gray-700 border border-gray-200 rounded-xl py-2.5"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="flex-1 text-sm font-semibold text-white bg-slate-900 rounded-xl py-2.5 disabled:opacity-60"
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}
