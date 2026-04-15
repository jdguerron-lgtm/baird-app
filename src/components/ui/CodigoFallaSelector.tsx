'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import Fuse from 'fuse.js'
import {
  CODIGOS_FALLA,
  EQUIPO_A_FAMILIA,
  type CodigoFalla,
} from '@/lib/constants/codigos-falla'

interface Props {
  tipoEquipo: string
  diagnosticoTexto: string
  value: CodigoFalla | null
  onChange: (codigo: CodigoFalla | null) => void
}

// Threshold for "low confidence" clarification
const LOW_CONFIDENCE_THRESHOLD = 0.55

export function CodigoFallaSelector({ tipoEquipo, diagnosticoTexto, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [showClarification, setShowClarification] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Pre-filter codes by equipment family
  const codigosFiltrados = useMemo(() => {
    const familias = EQUIPO_A_FAMILIA[tipoEquipo]
    if (!familias || familias.length === 0) return CODIGOS_FALLA
    // Include family-specific + generic "FALLAS FEAS" codes
    return CODIGOS_FALLA.filter(
      c => familias.includes(c.familia) || c.familia === 'FALLAS FEAS'
    )
  }, [tipoEquipo])

  // Fuse.js instance for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(codigosFiltrados, {
      keys: [
        { name: 'descripcion', weight: 0.6 },
        { name: 'sistema', weight: 0.2 },
        { name: 'componente', weight: 0.15 },
        { name: 'codigo', weight: 0.05 },
      ],
      threshold: 0.5,
      includeScore: true,
      minMatchCharLength: 3,
    })
  }, [codigosFiltrados])

  // Auto-suggestions based on diagnostic text
  const autoSugerencias = useMemo(() => {
    if (!diagnosticoTexto || diagnosticoTexto.length < 5) return []
    const results = fuse.search(diagnosticoTexto)
    return results.slice(0, 5)
  }, [diagnosticoTexto, fuse])

  // Manual search results
  const resultadosBusqueda = useMemo(() => {
    if (!busqueda || busqueda.length < 2) return []
    // Check if searching by code number
    const asNumber = parseInt(busqueda, 10)
    if (!isNaN(asNumber)) {
      return codigosFiltrados
        .filter(c => c.codigo.toString().includes(busqueda))
        .slice(0, 8)
        .map(c => ({ item: c, score: 0 }))
    }
    return fuse.search(busqueda).slice(0, 8)
  }, [busqueda, fuse, codigosFiltrados])

  // Check if we need clarification (low confidence on top results)
  const needsClarification = useMemo(() => {
    if (autoSugerencias.length < 2) return false
    const topScore = autoSugerencias[0]?.score ?? 1
    const secondScore = autoSugerencias[1]?.score ?? 1
    // If top scores are very close and above threshold → ambiguous
    return topScore > LOW_CONFIDENCE_THRESHOLD && secondScore > LOW_CONFIDENCE_THRESHOLD
  }, [autoSugerencias])

  // Items to display in modal
  const displayItems = busqueda.length >= 2 ? resultadosBusqueda : autoSugerencias

  // Focus search when modal opens
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 300)
      if (needsClarification && !value) setShowClarification(true)
    } else {
      setBusqueda('')
      setShowClarification(false)
    }
  }, [open, needsClarification, value])

  const handleSelect = useCallback((codigo: CodigoFalla) => {
    onChange(codigo)
    setOpen(false)
    setShowClarification(false)
  }, [onChange])

  const handleClear = useCallback(() => {
    onChange(null)
  }, [onChange])

  const matchLabel = (score: number | undefined) => {
    if (!score) return { text: '—', cls: '' }
    const pct = Math.round((1 - score) * 100)
    if (pct >= 80) return { text: `${pct}%`, cls: 'bg-green-100 text-green-700' }
    if (pct >= 55) return { text: `${pct}%`, cls: 'bg-amber-100 text-amber-700' }
    return { text: `${pct}%`, cls: 'bg-red-100 text-red-700' }
  }

  return (
    <>
      {/* Trigger Button */}
      <div className="mb-5">
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Código de falla
        </label>

        {value ? (
          /* Selected state */
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full text-left px-4 py-3.5 rounded-xl border-2 border-purple-500 bg-purple-50 transition-all flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-purple-600 text-white flex flex-col items-center justify-center shrink-0">
              <span className="text-[7px] uppercase font-semibold opacity-80">Falla</span>
              <span className="text-sm font-extrabold leading-none">{value.codigo}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-purple-800 truncate">{value.descripcion}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">{value.familia}</span>
                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{value.sistema}</span>
                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{value.complejidad}</span>
              </div>
            </div>
            <span className="text-gray-400 text-xs shrink-0">Cambiar</span>
          </button>
        ) : (
          /* Empty state */
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="w-full text-left px-4 py-3.5 rounded-xl border-2 border-gray-200 bg-white hover:border-gray-300 transition-all flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
              <span className="text-lg">🔍</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">Seleccionar código de falla</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {diagnosticoTexto.length >= 5
                  ? `${autoSugerencias.length} sugerencia${autoSugerencias.length !== 1 ? 's' : ''} disponible${autoSugerencias.length !== 1 ? 's' : ''}`
                  : 'Escribe el diagnóstico primero para ver sugerencias'}
              </p>
            </div>
            <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="mt-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
          >
            Quitar código de falla
          </button>
        )}
      </div>

      {/* Bottom Sheet Modal */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-end justify-center"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            className="bg-white rounded-t-2xl w-full max-w-lg max-h-[85vh] flex flex-col animate-in"
            style={{ animation: 'slideUp 0.3s ease' }}
          >
            {/* Handle */}
            <div className="flex justify-center py-3">
              <div className="w-9 h-1 rounded-full bg-gray-300" />
            </div>

            {/* Header */}
            <div className="px-5 pb-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Código de falla</h3>
                <button
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Selecciona el código que mejor describe la falla encontrada
              </p>
            </div>

            {/* Search */}
            <div className="px-5 py-3 border-b border-gray-50">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por código o descripción..."
                  className="w-full border border-gray-200 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-3">
              {/* Clarification section (inline in bottom sheet) */}
              {showClarification && busqueda.length < 2 && (
                <div className="mb-4 bg-amber-50 rounded-xl border border-amber-200 p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <span className="text-lg">🔍</span>
                    <div>
                      <p className="text-sm font-bold text-amber-800">¿Podrías precisar la falla?</p>
                      <p className="text-xs text-amber-600 mt-1">
                        Tu diagnóstico puede corresponder a varias fallas. Selecciona la más cercana:
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {autoSugerencias.slice(0, 3).map(({ item }) => (
                      <button
                        key={item.codigo}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className="w-full text-left bg-white border border-amber-200 rounded-lg px-3 py-2.5 text-xs hover:bg-amber-50/50 transition-colors"
                      >
                        <span className="font-bold text-amber-800">{item.codigo}</span>
                        <span className="text-gray-700 ml-1">— {item.descripcion}</span>
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowClarification(false)}
                    className="mt-2 text-xs text-amber-500 font-medium hover:text-amber-700"
                  >
                    Ver todas las sugerencias
                  </button>
                </div>
              )}

              {/* Auto-suggest banner */}
              {!showClarification && busqueda.length < 2 && autoSugerencias.length > 0 && (
                <div className="mb-3 bg-purple-50 border border-purple-100 rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <span className="text-sm">✨</span>
                  <p className="text-xs text-purple-700">
                    <span className="font-semibold">Sugerencias automáticas</span> basadas en tu diagnóstico
                  </p>
                </div>
              )}

              {/* Results list */}
              {displayItems.length > 0 ? (
                <div className="space-y-1.5">
                  {displayItems.map(({ item, score }) => {
                    const match = matchLabel(score)
                    const isSelected = value?.codigo === item.codigo
                    return (
                      <button
                        key={item.codigo}
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={`w-full text-left flex items-center gap-3 p-3 rounded-xl transition-all ${
                          isSelected
                            ? 'border-2 border-purple-500 bg-purple-50'
                            : 'border border-gray-100 bg-white hover:bg-gray-50'
                        }`}
                      >
                        <div className={`w-11 h-11 rounded-lg flex flex-col items-center justify-center shrink-0 ${
                          isSelected ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-700'
                        }`}>
                          <span className="text-[7px] uppercase font-semibold opacity-70">Falla</span>
                          <span className="text-sm font-extrabold leading-none">{item.codigo}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-slate-900 truncate">{item.descripcion}</p>
                          <div className="flex flex-wrap items-center gap-1 mt-1">
                            <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-full font-medium">{item.familia}</span>
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full font-medium">{item.sistema}</span>
                            {match.text !== '—' && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${match.cls}`}>{match.text}</span>
                            )}
                          </div>
                        </div>
                        <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center ${
                          isSelected ? 'border-purple-500 bg-purple-500' : 'border-gray-300'
                        }`}>
                          {isSelected && (
                            <svg width="12" height="12" fill="white" viewBox="0 0 20 20">
                              <path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" />
                            </svg>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="py-8 text-center">
                  <p className="text-sm text-gray-400">
                    {busqueda.length >= 2
                      ? 'No se encontraron códigos para esta búsqueda'
                      : diagnosticoTexto.length < 5
                        ? 'Escribe el diagnóstico para ver sugerencias'
                        : 'No hay sugerencias disponibles'}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            {value && (
              <div className="px-5 py-4 border-t border-gray-100 bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 px-6 rounded-xl transition-colors text-sm"
                >
                  Confirmar código {value.codigo}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide-up animation */}
      <style jsx global>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
