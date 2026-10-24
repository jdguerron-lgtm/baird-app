'use client'

import type { ResumenBonoGarantia } from '@/lib/utils/bono-garantia'
import { formatCOP } from '@/lib/utils/format'

/**
 * BonoGarantiaResumen — tira compacta con los factores del pago MABE de UN
 * servicio (2026-10-24, pedido de Juan: "claridad por servicio en el admin"):
 * TA, días de solución con la pausa por repuesto, recargo finde/festivo por
 * trabajo real y encuesta. Los números salen de `resumenBonoGarantia`
 * (src/lib/utils/bono-garantia.ts), la misma regla de la liquidación.
 */

const fmtFechaHora = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CO', { timeZone: 'America/Bogota', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}
const fmtFecha = (iso: string | null | undefined): string => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', weekday: 'short', day: '2-digit', month: 'short' })
}
const fmtYMD = (ymd: string | null): string => {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('es-CO', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' })
}

function Chip({ tono, icono, titulo, detalle, title }: {
  tono: 'ok' | 'no' | 'neutro' | 'aviso'
  icono: string
  titulo: string
  detalle?: string
  title?: string
}) {
  const clase =
    tono === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
    : tono === 'no' ? 'bg-red-50 border-red-200 text-red-900'
    : tono === 'aviso' ? 'bg-amber-50 border-amber-200 text-amber-900'
    : 'bg-gray-50 border-gray-200 text-slate-700'
  return (
    <div className={`rounded-lg border px-2.5 py-1.5 min-w-0 ${clase}`} title={title}>
      <p className="text-[11px] font-semibold leading-tight">{icono} {titulo}</p>
      {detalle && <p className="text-[10px] leading-tight opacity-80 mt-0.5">{detalle}</p>}
    </div>
  )
}

export default function BonoGarantiaResumen({ resumen }: { resumen: ResumenBonoGarantia }) {
  const { ta, dias, finde, encuesta, tarifa, consolidado } = resumen
  const pausa = dias.pausa

  // ── TA ──
  const taChip = ta.cumple === null
    ? { tono: 'neutro' as const, titulo: 'TA sin dato', detalle: 'se asume cumplido' }
    : ta.cumple
      ? { tono: 'ok' as const, titulo: `TA cumplido${ta.horas !== null ? ` · ${ta.horas} h` : ''}`, detalle: `límite ${ta.limite} h desde el horario confirmado` }
      : { tono: 'no' as const, titulo: `TA NO cumplido${ta.horas !== null ? ` · ${ta.horas} h` : ''}`, detalle: 'bono anulado' }

  // ── Días ──
  const rangoBono = dias.netos <= 1 ? '0–1 día' : dias.netos <= 2 ? '1.1–2 días' : dias.netos <= 3 ? '2.1–3 días' : '> 3 días (sin bono)'
  const diasDetalle = pausa.aplica
    ? `${dias.brutos} brutos − ${pausa.dias} de pausa · tabla ${rangoBono}`
    : `${fmtFecha(dias.inicio)} → ${consolidado ? fmtFecha(dias.fin) : 'hoy'} · tabla ${rangoBono}`

  // ── Pausa repuesto ──
  const pausaChip = !pausa.aplica
    ? null
    : pausa.abierta
      ? { tono: 'aviso' as const, titulo: `Pausa repuesto abierta · ${pausa.dias} d`, detalle: `desde ${fmtFechaHora(pausa.inicio)} · el reloj sigue parado` }
      : { tono: 'neutro' as const, titulo: `Pausa repuesto · ${pausa.dias} d`, detalle: `${fmtFechaHora(pausa.inicio)} → ${fmtFechaHora(pausa.fin)} (${pausa.origenFin === 'recibido' ? 'recibido en el sistema' : 'salió del ciclo sin marcar recibido'})` }

  // ── Finde / festivo ──
  const findeChip = finde.aplica
    ? {
        tono: 'ok' as const,
        titulo: finde.proyeccion ? 'Finde/festivo (proyección)' : 'Finde/festivo ✓',
        detalle:
          finde.motivo === 'diagnóstico' ? `diagnóstico el ${fmtYMD(finde.fecha)}`
          : finde.motivo === 'cierre' ? `cierre el ${fmtYMD(finde.fecha)}`
          : finde.motivo === 'horario' ? `visita agendada ${fmtYMD(finde.fecha) || 'en finde'}`
          : 'recargo registrado',
      }
    : { tono: 'neutro' as const, titulo: finde.proyeccion ? 'Sin finde (por ahora)' : 'Sin finde/festivo', detalle: finde.proyeccion ? 'se define con el día real del diagnóstico o cierre' : 'ni diagnóstico ni cierre cayeron en sáb/dom/festivo' }

  // ── Encuesta ──
  const encuestaChip = encuesta.contestada
    ? { tono: 'ok' as const, titulo: `Encuesta ${encuesta.calificacion ?? ''}/10`, detalle: 'tabla A (bono pleno)' }
    : consolidado
      ? { tono: 'aviso' as const, titulo: 'Encuesta sin contestar', detalle: 'tabla B (bono reducido)' }
      : { tono: 'neutro' as const, titulo: 'Encuesta pendiente', detalle: 'se asume contestada (proyección)' }

  return (
    <div className="mb-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
        <Chip tono={taChip.tono} icono="⏱️" titulo={taChip.titulo} detalle={taChip.detalle} />
        <Chip tono={dias.netos <= 3 ? 'ok' : 'no'} icono="📅" titulo={`${dias.netos} días de solución`} detalle={diasDetalle} />
        {pausaChip && <Chip tono={pausaChip.tono} icono="📦" titulo={pausaChip.titulo} detalle={pausaChip.detalle} />}
        <Chip tono={findeChip.tono} icono="🗓️" titulo={findeChip.titulo} detalle={findeChip.detalle} />
        <Chip tono={encuestaChip.tono} icono="⭐" titulo={encuestaChip.titulo} detalle={encuestaChip.detalle} />
      </div>
      {tarifa && (
        <p className="mt-1.5 text-[11px] text-gray-500">
          Bono: <span className="font-semibold text-slate-800">${formatCOP(tarifa.bono)}</span>
          {' · '}Recargo finde: <span className="font-semibold text-slate-800">${formatCOP(tarifa.recargoWeekend)}</span>
          {' · '}{consolidado ? 'consolidado al cierre' : 'proyección (cambia con el cierre real, la encuesta y el día de trabajo)'}
        </p>
      )}
    </div>
  )
}
