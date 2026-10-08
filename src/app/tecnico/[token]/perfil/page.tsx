'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import { ESPECIALIDADES, ESPECIALIDADES_INFO, type Especialidad } from '@/lib/constants/especialidades'
import {
  certificacionesAplicables,
  parseCertificaciones,
  type CertificacionId,
  type CertificacionesTecnico,
} from '@/lib/constants/certificaciones'

/**
 * /tecnico/{token}/perfil — autoservicio del técnico: especialidades,
 * gasodomésticos, ARL y DECLARACIÓN de certificaciones. La verificación la
 * hace Baird manualmente desde /admin/tecnicos/[id]; aquí el técnico solo
 * dice "la tengo / no la tengo" (+ número). Guarda vía POST /api/tecnico/perfil.
 */

interface TecnicoPerfil {
  id: string
  nombre_completo: string
  foto_perfil_url: string | null
  cubre_gasodomesticos: boolean | null
  tiene_arl: boolean | null
  certificaciones: unknown
  perfil_actualizado_at: string | null
}

type SiNo = '' | 'si' | 'no'

function Opcion({ selected, onClick, icono, texto, sub }: { selected: boolean; onClick: () => void; icono?: string; texto: string; sub?: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all w-full ${
        selected ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'
      }`}
    >
      {icono && <span className="text-xl leading-none mt-0.5">{icono}</span>}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium">{texto}</span>
        {sub && <span className={`block text-[11px] leading-snug mt-0.5 ${selected ? 'text-blue-700/80' : 'text-gray-400'}`}>{sub}</span>}
      </span>
      {selected && (
        <span className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )}
    </button>
  )
}

export default function PerfilTecnicoPage() {
  const { token } = useParams<{ token: string }>()
  const [tecnico, setTecnico] = useState<TecnicoPerfil | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null)

  const [especialidades, setEspecialidades] = useState<Especialidad[]>([])
  const [cubreGas, setCubreGas] = useState<SiNo>('')
  const [tieneArl, setTieneArl] = useState<SiNo>('')
  const [declaraciones, setDeclaraciones] = useState<Partial<Record<CertificacionId, SiNo>>>({})
  const [numeros, setNumeros] = useState<Partial<Record<CertificacionId, string>>>({})
  const [certsActuales, setCertsActuales] = useState<CertificacionesTecnico>({})

  useEffect(() => {
    const cargar = async () => {
      const { data: tec, error: tecErr } = await querySupabase(() =>
        supabase
          .from('tecnicos')
          .select('id, nombre_completo, foto_perfil_url, cubre_gasodomesticos, tiene_arl, certificaciones, perfil_actualizado_at')
          .eq('portal_token', token)
          .single()
      )
      if (tecErr || !tec) {
        setError('Enlace inválido o expirado')
        setCargando(false)
        return
      }
      setTecnico(tec as TecnicoPerfil)
      setCubreGas(tec.cubre_gasodomesticos === null ? '' : tec.cubre_gasodomesticos ? 'si' : 'no')
      setTieneArl(tec.tiene_arl === null ? '' : tec.tiene_arl ? 'si' : 'no')

      const certs = parseCertificaciones(tec.certificaciones)
      setCertsActuales(certs)
      const decl: Partial<Record<CertificacionId, SiNo>> = {}
      const nums: Partial<Record<CertificacionId, string>> = {}
      for (const [id, c] of Object.entries(certs) as [CertificacionId, CertificacionesTecnico[CertificacionId]][]) {
        if (!c) continue
        if (c.estado === 'declarada' || c.estado === 'verificada') decl[id] = 'si'
        else if (c.estado === 'sin_revisar' && c.nota && /NO tenerla/.test(c.nota)) decl[id] = 'no'
        if (c.numero) nums[id] = c.numero
      }
      setDeclaraciones(decl)
      setNumeros(nums)

      const { data: esp } = await querySupabase(() =>
        supabase.from('especialidades_tecnico').select('especialidad').eq('tecnico_id', tec.id)
      )
      const lista = (esp ?? [])
        .map(e => e.especialidad as string)
        .filter((e): e is Especialidad => (ESPECIALIDADES as readonly string[]).includes(e))
      setEspecialidades(lista)
      setCargando(false)
    }
    cargar()
  }, [token])

  const aplicables = useMemo(
    () => certificacionesAplicables(especialidades, cubreGas === '' ? null : cubreGas === 'si').filter(c => c.declarable),
    [especialidades, cubreGas],
  )

  const toggleEspecialidad = (e: Especialidad) => {
    setEspecialidades(prev => (prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]))
  }

  const guardar = async () => {
    setMensaje(null)
    if (especialidades.length === 0) {
      setMensaje({ texto: 'Selecciona al menos una especialidad', tipo: 'error' })
      return
    }
    if (cubreGas === '') {
      setMensaje({ texto: 'Indica si atiendes equipos a gas', tipo: 'error' })
      return
    }
    setGuardando(true)

    const decl: Record<string, boolean> = {}
    for (const c of aplicables) {
      const v = declaraciones[c.id]
      if (v === 'si' || v === 'no') decl[c.id] = v === 'si'
    }
    const nums: Record<string, string> = {}
    for (const [id, n] of Object.entries(numeros)) if (n && decl[id]) nums[id] = n

    try {
      const res = await fetch('/api/tecnico/perfil', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalToken: token,
          especialidades,
          cubre_gasodomesticos: cubreGas === 'si',
          tiene_arl: tieneArl === '' ? null : tieneArl === 'si',
          declaraciones: decl,
          numeros: nums,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Error ${res.status}`)
      setCertsActuales(parseCertificaciones(json.perfil?.certificaciones))
      setTecnico(prev => prev ? { ...prev, perfil_actualizado_at: json.perfil?.perfil_actualizado_at ?? prev.perfil_actualizado_at } : prev)
      setMensaje({ texto: '¡Perfil actualizado! Gracias por completar tu información.', tipo: 'exito' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setMensaje({ texto: 'No se pudo guardar: ' + (err instanceof Error ? err.message : String(err)), tipo: 'error' })
    } finally {
      setGuardando(false)
    }
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (error || !tecnico) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Acceso no válido</h1>
          <p className="text-sm text-gray-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href={`/tecnico/${token}`} className="relative w-36 h-10 block shrink-0">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill sizes="144px" className="object-contain object-left" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-900 truncate">{tecnico.nombre_completo}</h1>
            <p className="text-xs text-gray-400">Mi perfil</p>
          </div>
          <Link
            href={`/tecnico/${token}`}
            className="shrink-0 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2"
          >
            ← Mis servicios
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {mensaje && (
          <div className={`p-4 rounded-xl text-sm font-medium ${
            mensaje.tipo === 'exito' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {mensaje.tipo === 'exito' ? '✅' : '⚠️'} {mensaje.texto}
          </div>
        )}

        {!tecnico.perfil_actualizado_at && !mensaje && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
            <p className="font-semibold mb-1">Completa tu perfil</p>
            <p className="text-blue-800/80 text-xs">
              Ampliamos la información del técnico: equipos que atiendes, si trabajas con gas y tus certificaciones.
              Nos ayuda a asignarte los servicios correctos y a priorizar técnicos certificados. Toma 2 minutos.
            </p>
          </div>
        )}

        {/* Especialidades */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Equipos que atiendes</h2>
          <p className="text-xs text-gray-400 mb-4">Marca todas las categorías que sabes reparar.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {ESPECIALIDADES.map(e => (
              <Opcion
                key={e}
                selected={especialidades.includes(e)}
                onClick={() => toggleEspecialidad(e)}
                icono={ESPECIALIDADES_INFO[e].icono}
                texto={e}
                sub={ESPECIALIDADES_INFO[e].cubre}
              />
            ))}
          </div>
          {especialidades.length === 0 && <p className="mt-2 text-xs text-red-500">* Selecciona al menos una</p>}
        </section>

        {/* Gas */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Gasodomésticos</h2>
          <p className="text-sm font-semibold text-gray-700 mb-1">¿Atiendes equipos a gas (estufas, hornos, calentadores, secadoras a gas)?</p>
          <p className="text-xs text-gray-400 mb-4">
            Intervenir un artefacto a gas exige certificado de competencia laboral (Res. 90902 de 2013). Si atiendes gas, abajo te preguntamos si lo tienes.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Opcion selected={cubreGas === 'si'} onClick={() => setCubreGas('si')} icono="🔥" texto="Sí, atiendo gas" />
            <Opcion selected={cubreGas === 'no'} onClick={() => setCubreGas('no')} icono="⚡" texto="Solo eléctricos" />
          </div>
          {cubreGas === '' && <p className="mt-2 text-xs text-red-500">* Selecciona una opción</p>}
        </section>

        {/* ARL */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Seguridad social</h2>
          <p className="text-sm font-semibold text-gray-700 mb-4">¿Tienes ARL (afiliación a riesgos laborales)?</p>
          <div className="grid grid-cols-2 gap-3">
            <Opcion selected={tieneArl === 'si'} onClick={() => setTieneArl('si')} icono="🛡️" texto="Sí, tengo ARL" />
            <Opcion selected={tieneArl === 'no'} onClick={() => setTieneArl('no')} icono="🚫" texto="No tengo ARL" />
          </div>
        </section>

        {/* Certificaciones */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Certificaciones y formación</h2>
          <p className="text-xs text-gray-400 mb-4">
            Dinos cuáles tienes. Baird las verifica después; las verificadas aparecen con ✅ y te dan prioridad en los servicios que las exigen.
          </p>
          <div className="space-y-3">
            {aplicables.map(c => {
              const actual = certsActuales[c.id]
              const bloqueada = !!actual && actual.estado !== 'sin_revisar' && actual.estado !== 'declarada'
              const v = declaraciones[c.id] ?? ''
              return (
                <div key={c.id} className={`rounded-xl border p-4 ${c.requeridaParaGas && cubreGas === 'si' ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200'}`}>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-sm font-semibold text-slate-900">{c.nombre}</p>
                    {actual?.estado === 'verificada' && (
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-800">✅ Verificada</span>
                    )}
                    {c.requeridaParaGas && cubreGas === 'si' && actual?.estado !== 'verificada' && (
                      <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">Requerida para gas</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{c.descripcion}</p>
                  {bloqueada ? (
                    <p className="text-xs text-gray-400 italic">Revisada por Baird Service. Si cambió, escríbenos por WhatsApp.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          aria-pressed={v === 'si'}
                          onClick={() => setDeclaraciones(prev => ({ ...prev, [c.id]: 'si' }))}
                          className={`p-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                            v === 'si' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'
                          }`}
                        >
                          La tengo
                        </button>
                        <button
                          type="button"
                          aria-pressed={v === 'no'}
                          onClick={() => setDeclaraciones(prev => ({ ...prev, [c.id]: 'no' }))}
                          className={`p-2.5 rounded-xl border-2 text-sm font-medium transition-all ${
                            v === 'no' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 bg-white hover:border-blue-300 text-gray-700'
                          }`}
                        >
                          No la tengo
                        </button>
                      </div>
                      {v === 'si' && (
                        <input
                          type="text"
                          value={numeros[c.id] ?? ''}
                          onChange={e => setNumeros(prev => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="Número de certificado o matrícula (opcional)"
                          maxLength={60}
                          className="mt-2 w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                        />
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardando ? 'Guardando...' : 'Guardar mi perfil'}
        </button>

        {tecnico.perfil_actualizado_at && (
          <p className="text-center text-[11px] text-gray-400">
            Última actualización: {new Date(tecnico.perfil_actualizado_at).toLocaleString('es-CO')}
          </p>
        )}
      </div>
    </div>
  )
}
