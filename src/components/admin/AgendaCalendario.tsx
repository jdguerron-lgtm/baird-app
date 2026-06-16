'use client'

/**
 * AgendaCalendario — vista de calendario de la agenda por franjas horarias.
 *
 * Se renderiza dentro de /admin/solicitudes (toggle Lista | Calendario).
 *
 * Muestra, por día y franja, el conteo `n/cupo` de servicios agendados:
 *   - n    = solicitudes ACTIVAS (estado fuera de ESTADOS_TERMINALES) cuyo
 *            `fecha_visita_at` cae en ese día + franja (TZ Colombia).
 *   - cupo = MAX_RESERVAS_POR_FRANJA (el mismo tope que enforcea agenda.service
 *            al confirmar horario), por lo que el número coincide exactamente
 *            con la disponibilidad real del slot.
 *
 * Dos niveles de detalle:
 *   - Semana: grilla 4 franjas × 7 días, cada celda con su cupo + los servicios.
 *   - Mes: grilla mensual, cada día con total + mini-conteo por franja. Clic en
 *     un día salta a la vista de semana anclada en ese día.
 *
 * Fechas: TZ Colombia (America/Bogota, UTC-5 fijo, sin DST). El cálculo de
 * grillas se hace sobre YMD puro (Date.UTC) para no arrastrar drift de zona.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { FRANJAS_HORARIO, MAX_RESERVAS_POR_FRANJA } from '@/lib/constants/franjas'
import { ESTADOS_TERMINALES, ESTADO_ESTILOS } from '@/lib/constants/estados'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'

type Vista = 'semana' | 'mes'

interface SolAgenda {
  id: string
  cliente_nombre: string | null
  tipo_equipo: string | null
  marca_equipo: string | null
  ciudad_pueblo: string | null
  estado: string | null
  fecha_visita_at: string | null
  tecnico_asignado_id: string | null
}

const CUPO = MAX_RESERVAS_POR_FRANJA
const ESTADOS_TERMINALES_IN = `(${[...ESTADOS_TERMINALES].join(',')})`

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const DIAS_SEMANA = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom']

// ── Helpers de calendario sobre YMD puro (sin TZ) ─────────────────────
function addDaysYMD(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  base.setUTCDate(base.getUTCDate() + n)
  return base.toISOString().slice(0, 10)
}

/** Lunes de la semana que contiene `ymd`. */
function inicioSemanaYMD(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0=domingo
  const offset = (dow + 6) % 7 // lunes = 0
  return addDaysYMD(ymd, -offset)
}

/** 42 días (6 semanas) de la grilla mensual que contiene `ancla`, desde lunes. */
function gridMesYMD(ancla: string): string[] {
  const [y, m] = ancla.split('-').map(Number)
  const primero = `${y}-${String(m).padStart(2, '0')}-01`
  const start = inicioSemanaYMD(primero)
  return Array.from({ length: 42 }, (_, i) => addDaysYMD(start, i))
}

/** Instante UTC de la medianoche Colombia de `ymd` (para acotar el fetch). */
function colombiaMidnightIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00-05:00`).toISOString()
}

/** Hora local Colombia (0-23) de un instante UTC. CO es UTC-5 fijo (sin DST). */
function horaColombia(iso: string): number {
  return (new Date(iso).getUTCHours() - 5 + 24) % 24
}

/** Mapea una hora local a su franja. Espeja los horaInicio de FRANJAS_HORARIO. */
function franjaPorHora(hora: number): string {
  if (hora < 12) return '8am-12pm'
  if (hora < 15) return '12pm-3pm'
  if (hora < 18) return '3pm-6pm'
  return '6pm-8pm'
}

function claveSlot(dia: string, franja: string): string {
  return `${dia}|${franja}`
}

function colorCupo(n: number): string {
  if (n <= 0) return 'text-gray-300'
  if (n >= CUPO) return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-700'
}

function nombreCorto(nombre: string | null | undefined): string {
  if (!nombre) return 'Cliente'
  return nombre.trim().split(/\s+/)[0]
}

export default function AgendaCalendario() {
  const hoy = fechaColombiaYMD()
  const [vista, setVista] = useState<Vista>('semana')
  const [ancla, setAncla] = useState<string>(hoy)
  const [solicitudes, setSolicitudes] = useState<SolAgenda[]>([])
  const [cargando, setCargando] = useState(true)

  // Rango visible de días (YMD) según la vista.
  const dias = useMemo<string[]>(() => {
    if (vista === 'semana') {
      const inicio = inicioSemanaYMD(ancla)
      return Array.from({ length: 7 }, (_, i) => addDaysYMD(inicio, i))
    }
    return gridMesYMD(ancla)
  }, [vista, ancla])

  const rangoInicio = dias[0]
  const rangoFin = dias[dias.length - 1]

  useEffect(() => {
    let cancelado = false
    const cargar = async () => {
      setCargando(true)
      const desde = colombiaMidnightIso(rangoInicio)
      const hasta = colombiaMidnightIso(addDaysYMD(rangoFin, 1))

      const { data, error } = await supabase
        .from('solicitudes_servicio')
        .select('id, cliente_nombre, tipo_equipo, marca_equipo, ciudad_pueblo, estado, fecha_visita_at, tecnico_asignado_id')
        .not('fecha_visita_at', 'is', null)
        .gte('fecha_visita_at', desde)
        .lt('fecha_visita_at', hasta)
        .not('estado', 'in', ESTADOS_TERMINALES_IN)
        .order('fecha_visita_at', { ascending: true })

      if (cancelado) return
      if (error) {
        console.error('[AgendaCalendario] Error cargando solicitudes:', error.message)
        setSolicitudes([])
      } else {
        setSolicitudes(data ?? [])
      }
      setCargando(false)
    }
    cargar()
    return () => { cancelado = true }
  }, [rangoInicio, rangoFin])

  // Index: slot (día|franja) → solicitudes.
  const porSlot = useMemo(() => {
    const map = new Map<string, SolAgenda[]>()
    for (const s of solicitudes) {
      if (!s.fecha_visita_at) continue
      const dia = fechaColombiaYMD(new Date(s.fecha_visita_at))
      const franja = franjaPorHora(horaColombia(s.fecha_visita_at))
      const k = claveSlot(dia, franja)
      const arr = map.get(k)
      if (arr) arr.push(s)
      else map.set(k, [s])
    }
    return map
  }, [solicitudes])

  const totalDia = (dia: string): number =>
    FRANJAS_HORARIO.reduce((acc, f) => acc + (porSlot.get(claveSlot(dia, f.value))?.length ?? 0), 0)

  // ── Navegación ────────────────────────────────────────────────────
  const navegar = (delta: number) => {
    if (vista === 'semana') {
      setAncla(prev => addDaysYMD(prev, delta * 7))
      return
    }
    // Mes: salta al día 1 del mes destino, con rollover de año.
    const [y, m] = ancla.split('-').map(Number)
    const nm = (m - 1) + delta
    const ny = y + Math.floor(nm / 12)
    const nmes = ((nm % 12) + 12) % 12
    setAncla(`${ny}-${String(nmes + 1).padStart(2, '0')}-01`)
  }

  const irHoy = () => setAncla(hoy)

  const titulo = useMemo(() => {
    if (vista === 'semana') {
      const ini = dias[0]
      const fin = dias[6]
      const [, mi, di] = ini.split('-')
      const [, mf, df] = fin.split('-')
      const mesIni = MESES[Number(mi) - 1]
      const mesFin = MESES[Number(mf) - 1]
      const año = fin.split('-')[0]
      return mi === mf
        ? `${Number(di)} – ${Number(df)} ${mesFin} ${año}`
        : `${Number(di)} ${mesIni} – ${Number(df)} ${mesFin} ${año}`
    }
    const [y, m] = ancla.split('-').map(Number)
    return `${MESES[m - 1]} ${y}`
  }, [vista, dias, ancla])

  const anclaMes = ancla.slice(0, 7)

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 sm:p-5">
      {/* Barra de control */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => navegar(-1)}
            className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            onClick={irHoy}
            className="px-3 h-8 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50"
          >
            Hoy
          </button>
          <button
            onClick={() => navegar(1)}
            className="w-8 h-8 grid place-items-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            aria-label="Siguiente"
          >
            ›
          </button>
          <h2 className="ml-2 text-sm font-bold text-slate-900 capitalize">{titulo}</h2>
        </div>

        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {(['semana', 'mes'] as Vista[]).map(v => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`px-3 py-1 text-xs font-semibold rounded-md capitalize transition-colors ${
                vista === v ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-3 mb-3 text-[11px] text-gray-400">
        <span><strong className="text-gray-600">n/{CUPO}</strong> = agendados / cupo por franja</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-amber-100 inline-block" /> con cupo</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> lleno</span>
      </div>

      {cargando ? (
        <div className="p-10 text-center">
          <div className="animate-spin h-7 w-7 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
        </div>
      ) : vista === 'semana' ? (
        <VistaSemana dias={dias} hoy={hoy} porSlot={porSlot} />
      ) : (
        <VistaMes
          dias={dias}
          hoy={hoy}
          anclaMes={anclaMes}
          porSlot={porSlot}
          totalDia={totalDia}
          onDiaClick={(d) => { setAncla(d); setVista('semana') }}
        />
      )}
    </div>
  )
}

// ── Vista semana: 4 franjas × 7 días ──────────────────────────────────
function VistaSemana({
  dias, hoy, porSlot,
}: {
  dias: string[]
  hoy: string
  porSlot: Map<string, SolAgenda[]>
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        {/* Encabezado de días */}
        <div className="grid grid-cols-[88px_repeat(7,minmax(0,1fr))] gap-px">
          <div />
          {dias.map((d, i) => {
            const dayNum = Number(d.split('-')[2])
            const esHoy = d === hoy
            return (
              <div
                key={d}
                className={`text-center py-1.5 rounded-t-lg ${esHoy ? 'bg-slate-900 text-white' : 'text-gray-500'}`}
              >
                <div className="text-[10px] uppercase tracking-wide">{DIAS_SEMANA[i]}</div>
                <div className="text-sm font-bold">{dayNum}</div>
              </div>
            )
          })}
        </div>

        {/* Filas por franja */}
        {FRANJAS_HORARIO.map(franja => (
          <div key={franja.value} className="grid grid-cols-[88px_repeat(7,minmax(0,1fr))] gap-px">
            <div className="flex flex-col justify-center px-2 py-2 text-right">
              <span className="text-base leading-none">{franja.icon}</span>
              <span className="text-[10px] text-gray-500 leading-tight mt-0.5">{franja.value}</span>
            </div>
            {dias.map(d => {
              const items = porSlot.get(claveSlot(d, franja.value)) ?? []
              const n = items.length
              return (
                <div key={d + franja.value} className="min-h-[88px] border border-gray-100 bg-white p-1.5">
                  <div className="flex justify-end mb-1">
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${colorCupo(n)}`}>
                      {n}/{CUPO}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {items.map(s => (
                      <Link
                        key={s.id}
                        href={`/admin/solicitudes/${s.id}`}
                        title={`${s.cliente_nombre ?? ''} · ${s.tipo_equipo ?? ''} ${s.marca_equipo ?? ''} · ${s.ciudad_pueblo ?? ''} · ${s.estado ?? ''}`}
                        className={`block rounded px-1.5 py-1 text-[10px] leading-tight font-medium hover:opacity-80 transition-opacity ${ESTADO_ESTILOS[s.estado ?? ''] ?? 'bg-gray-100 text-gray-700'}`}
                      >
                        <span className="block truncate">{nombreCorto(s.cliente_nombre)} · {s.tipo_equipo ?? '—'}</span>
                        <span className="block truncate opacity-70">{s.ciudad_pueblo ?? '—'}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Vista mes: grilla mensual, mini-conteo por franja ─────────────────
function VistaMes({
  dias, hoy, anclaMes, porSlot, totalDia, onDiaClick,
}: {
  dias: string[]
  hoy: string
  anclaMes: string
  porSlot: Map<string, SolAgenda[]>
  totalDia: (dia: string) => number
  onDiaClick: (dia: string) => void
}) {
  const cupoDia = FRANJAS_HORARIO.length * CUPO
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[700px]">
        {/* Encabezado días de la semana */}
        <div className="grid grid-cols-7 gap-px mb-px">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400 py-1">
              {d}
            </div>
          ))}
        </div>

        {/* 6 semanas */}
        <div className="grid grid-cols-7 gap-px bg-gray-100 rounded-lg overflow-hidden">
          {dias.map(d => {
            const esHoy = d === hoy
            const esOtroMes = d.slice(0, 7) !== anclaMes
            const total = totalDia(d)
            const dayNum = Number(d.split('-')[2])
            return (
              <button
                key={d}
                onClick={() => onDiaClick(d)}
                className={`text-left min-h-[92px] p-1.5 transition-colors ${
                  esOtroMes ? 'bg-gray-50/60' : 'bg-white'
                } hover:bg-blue-50/50`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold grid place-items-center w-5 h-5 rounded-full ${
                    esHoy ? 'bg-slate-900 text-white' : esOtroMes ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    {dayNum}
                  </span>
                  {total > 0 && (
                    <span className="text-[9px] font-semibold text-gray-400">{total}/{cupoDia}</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-0.5">
                  {FRANJAS_HORARIO.map(f => {
                    const n = porSlot.get(claveSlot(d, f.value))?.length ?? 0
                    return (
                      <span
                        key={f.value}
                        title={`${f.label}: ${n}/${CUPO}`}
                        className={`text-[9px] leading-none rounded px-1 py-0.5 text-center ${
                          n <= 0 ? 'bg-gray-50 text-gray-300' : n >= CUPO ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {f.icon}{n}
                      </span>
                    )
                  })}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
