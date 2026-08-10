'use client'

// Buscador global del admin (vive en el sidebar): encuentra clientes, casos
// (solicitudes), números de orden/garantía MABE y técnicos desde un solo input.
// Carga un índice liviano la primera vez que se enfoca (mismo patrón que los
// listados admin: queries client-side con el singleton) y filtra en memoria —
// eso permite matchear también por prefijo del ID del caso (ej. "0bafe18a")
// y por teléfono ignorando espacios/+57.

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ESTADO_ESTILOS } from '@/lib/constants/estados'

interface SolIndex {
  id: string
  cliente_nombre: string | null
  cliente_telefono: string | null
  ciudad_pueblo: string | null
  tipo_equipo: string | null
  marca_equipo: string | null
  estado: string | null
  numero_serie_factura: string | null
  es_garantia: boolean
  created_at: string
}

interface TecIndex {
  id: string
  nombre_completo: string
  whatsapp: string
  ciudad_pueblo: string | null
  estado_verificacion: string | null
}

const MAX_SOLICITUDES = 8
const MAX_TECNICOS = 4

export default function BuscadorGlobal() {
  const router = useRouter()
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const [cargando, setCargando] = useState(false)
  const [sols, setSols] = useState<SolIndex[] | null>(null)
  const [tecs, setTecs] = useState<TecIndex[] | null>(null)
  const contRef = useRef<HTMLDivElement>(null)

  // Cerrar con click fuera o Escape
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (contRef.current && !contRef.current.contains(e.target as Node)) setAbierto(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAbierto(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const cargarIndice = async () => {
    if (sols !== null || cargando) return
    setCargando(true)
    try {
      const [solRes, tecRes] = await Promise.all([
        supabase
          .from('solicitudes_servicio')
          .select('id, cliente_nombre, cliente_telefono, ciudad_pueblo, tipo_equipo, marca_equipo, estado, numero_serie_factura, es_garantia, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('tecnicos')
          .select('id, nombre_completo, whatsapp, ciudad_pueblo, estado_verificacion'),
      ])
      setSols((solRes.data as SolIndex[] | null) ?? [])
      setTecs((tecRes.data as TecIndex[] | null) ?? [])
    } catch (e) {
      console.error('Error cargando índice de búsqueda:', e)
      setSols([])
      setTecs([])
    }
    setCargando(false)
  }

  const texto = q.trim().toLowerCase()
  // Versión solo-dígitos del query para buscar teléfonos sin importar +57/espacios
  const digitos = texto.replace(/\D/g, '')

  const matchSol = (s: SolIndex) =>
    (s.cliente_nombre ?? '').toLowerCase().includes(texto) ||
    (s.ciudad_pueblo ?? '').toLowerCase().includes(texto) ||
    (s.tipo_equipo ?? '').toLowerCase().includes(texto) ||
    (s.marca_equipo ?? '').toLowerCase().includes(texto) ||
    (s.numero_serie_factura ?? '').toLowerCase().includes(texto) ||
    s.id.toLowerCase().startsWith(texto) ||
    (digitos.length >= 4 && (s.cliente_telefono ?? '').replace(/\D/g, '').includes(digitos))

  const matchTec = (t: TecIndex) =>
    t.nombre_completo.toLowerCase().includes(texto) ||
    (t.ciudad_pueblo ?? '').toLowerCase().includes(texto) ||
    (digitos.length >= 4 && t.whatsapp.replace(/\D/g, '').includes(digitos))

  const activo = abierto && texto.length >= 2
  const solsMatch = activo && sols ? sols.filter(matchSol).slice(0, MAX_SOLICITUDES) : []
  const tecsMatch = activo && tecs ? tecs.filter(matchTec).slice(0, MAX_TECNICOS) : []

  const irA = (href: string) => {
    setAbierto(false)
    setQ('')
    router.push(href)
  }

  return (
    <div ref={contRef} className="relative px-3 pt-3">
      <input
        type="search"
        placeholder="🔍 Cliente, caso, orden, teléfono…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value)
          setAbierto(true)
        }}
        onFocus={() => {
          setAbierto(true)
          cargarIndice()
        }}
        className="w-full border border-gray-200 rounded-lg py-1.5 px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
      />

      {activo && (
        <div className="absolute left-2 top-full mt-1 w-[22rem] max-h-[70vh] overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50">
          {cargando || sols === null ? (
            <p className="p-4 text-xs text-gray-400">Cargando…</p>
          ) : solsMatch.length === 0 && tecsMatch.length === 0 ? (
            <p className="p-4 text-xs text-gray-400">Sin resultados para “{q.trim()}”</p>
          ) : (
            <>
              {solsMatch.length > 0 && (
                <div className="py-1">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Casos / Solicitudes
                  </p>
                  {solsMatch.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => irA(`/admin/solicitudes/${s.id}`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {s.cliente_nombre ?? 'Sin nombre'}
                        </p>
                        <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_ESTILOS[s.estado ?? ''] ?? 'bg-gray-100 text-gray-600'}`}>
                          {s.estado}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 truncate">
                        {[s.tipo_equipo, s.marca_equipo, s.ciudad_pueblo].filter(Boolean).join(' · ') || '—'}
                      </p>
                      <p className="text-[10px] text-gray-400 truncate">
                        #{s.id.slice(0, 8)}
                        {s.numero_serie_factura ? ` · Orden ${s.numero_serie_factura}` : ''}
                        {s.es_garantia ? ' · 🛡️ Garantía' : ' · Particular'}
                        {' · '}{new Date(s.created_at).toLocaleDateString('es-CO')}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {tecsMatch.length > 0 && (
                <div className="py-1 border-t border-gray-100">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    Técnicos
                  </p>
                  {tecsMatch.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => irA(`/admin/tecnicos/${t.id}`)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-50 transition-colors"
                    >
                      <p className="text-xs font-semibold text-slate-900 truncate">🔧 {t.nombre_completo}</p>
                      <p className="text-[11px] text-gray-500 truncate">
                        {[t.ciudad_pueblo, t.whatsapp, t.estado_verificacion].filter(Boolean).join(' · ')}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
