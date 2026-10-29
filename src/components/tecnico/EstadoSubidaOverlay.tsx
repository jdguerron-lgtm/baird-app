'use client'

import type { ArchivoSubida } from '@/lib/utils/cola-subida'

/**
 * Capa sobre cada tile de evidencia con el estado de su subida en segundo
 * plano (2026-10-29): preparando → barra de progreso → ✓ listo, o error con
 * botón "Reintentar". Se usa en Diagnóstico y Completar.
 */
export default function EstadoSubidaOverlay({
  archivo,
  onReintentar,
}: {
  archivo: ArchivoSubida
  onReintentar: (id: string) => void
}) {
  if (archivo.estado === 'listo') {
    return (
      <span
        className="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold flex items-center justify-center shadow"
        title="Subido"
        aria-label="Subido"
      >
        ✓
      </span>
    )
  }

  if (archivo.estado === 'error') {
    return (
      <div className="absolute inset-0 bg-red-600/80 text-white flex flex-col items-center justify-center p-2 text-center">
        <span className="text-[10px] leading-tight line-clamp-3">{archivo.error || 'No se pudo subir'}</span>
        <button
          type="button"
          onClick={() => onReintentar(archivo.id)}
          className="mt-1.5 px-2.5 py-1 rounded-full bg-white text-red-700 text-[11px] font-bold"
        >
          Reintentar
        </button>
      </div>
    )
  }

  // en_cola / preparando / subiendo
  const subiendo = archivo.estado === 'subiendo'
  return (
    <div className="absolute inset-x-0 bottom-0 bg-black/55 text-white px-2 py-1.5">
      <div className="flex items-center justify-between text-[10px] font-medium">
        <span>{subiendo ? 'Subiendo' : archivo.estado === 'preparando' ? 'Preparando…' : 'En cola'}</span>
        {subiendo && <span className="tabular-nums">{archivo.pct} %</span>}
      </div>
      <div className="mt-1 h-1 w-full rounded-full bg-white/30 overflow-hidden">
        <div
          className={`h-full bg-emerald-400 transition-[width] duration-300 ${subiendo ? '' : 'animate-pulse w-1/4'}`}
          style={subiendo ? { width: `${archivo.pct}%` } : undefined}
        />
      </div>
    </div>
  )
}
