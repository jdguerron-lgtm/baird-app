import Image from 'next/image'
import type { CarnetAuxiliarData } from '@/lib/utils/equipo'

interface Props {
  auxiliar: CarnetAuxiliarData
  /** Nombre del técnico al que acompaña ("Auxiliar de Pedro Gómez"). */
  tecnicoNombre?: string | null
  className?: string
}

/**
 * Tarjeta compacta del auxiliar (2026-10-13). Misma lógica que el carnet del
 * técnico: foto de perfil + nombre + documento ENMASCARADO, para que el
 * cliente compare con la cédula física en la puerta. Solo se renderiza para
 * auxiliares verificados por Baird (lo garantiza `resolverEquipoServicio`).
 */
export default function CarnetAuxiliar({ auxiliar, tecnicoNombre, className = '' }: Props) {
  const iniciales = auxiliar.nombre_completo
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className={`w-full max-w-sm mx-auto rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 p-3">
        <div className="relative w-16 h-16 rounded-xl bg-slate-200 overflow-hidden shrink-0 ring-2 ring-white shadow">
          {auxiliar.foto_perfil_url ? (
            <Image src={auxiliar.foto_perfil_url} alt={`Foto de ${auxiliar.nombre_completo}`} fill sizes="64px" className="object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-lg font-bold text-slate-500">{iniciales || '?'}</div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 leading-tight break-words">{auxiliar.nombre_completo}</p>
          <p className="text-xs text-slate-600 mt-0.5">
            Auxiliar{tecnicoNombre ? ` de ${tecnicoNombre}` : ''}
          </p>
          <p className="font-mono text-xs text-slate-800 mt-1">
            {auxiliar.documento ? `${auxiliar.tipo_documento ?? 'CC'} ${auxiliar.documento}` : '—'}
            <span className="font-sans text-slate-400"> · {auxiliar.codigo}</span>
          </p>
        </div>
        {auxiliar.verificado && (
          <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold px-2 py-0.5">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Verificado
          </span>
        )}
      </div>
    </div>
  )
}
