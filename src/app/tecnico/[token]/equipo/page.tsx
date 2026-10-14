'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { querySupabase } from '@/lib/utils/retry'
import { uploadFotoAuxiliar } from '@/lib/uploadHelpers'
import { prepararFoto } from '@/lib/utils/foto-registro'
import SelectorFoto from '@/components/ui/SelectorFoto'
import {
  ESTADO_AUXILIAR_LABELS,
  MAX_AUXILIARES_POR_TECNICO,
  TIPOS_DOCUMENTO_AUXILIAR,
  type EstadoVerificacionAuxiliar,
} from '@/lib/utils/equipo'

/**
 * /tecnico/{token}/equipo — "Mi equipo de trabajo" (2026-10-13).
 *
 * El técnico registra a los auxiliares que lo acompañan (nombre, documento,
 * foto, celular opcional) y declara que cuentan con su autorización para
 * compartir esos datos con Baird y con los clientes. Baird los VERIFICA
 * desde /admin/tecnicos/[id]; mientras estén "pendientes" no se muestran al
 * cliente ni pueden ir a servicios. "Me acompaña por defecto" hace que al
 * aceptar un servicio queden incluidos automáticamente (el técnico puede
 * ajustarlo por servicio en su portal).
 *
 * Datos vía GET/POST/PATCH/DELETE /api/tecnico/equipo (service_role).
 * La foto se comprime en el celular (prepararFoto) y sube al bucket público
 * `tecnicos-fotos/{tecnicoId}/auxiliares/`.
 */

interface Auxiliar {
  id: string
  nombre_completo: string
  tipo_documento: string
  numero_documento: string
  foto_perfil_url: string
  whatsapp: string | null
  estado_verificacion: EstadoVerificacionAuxiliar
  nota_verificacion: string | null
  acompana_por_defecto: boolean
  activo: boolean
}

interface Formulario {
  nombre_completo: string
  tipo_documento: string
  numero_documento: string
  whatsapp: string
  foto_perfil_url: string
  acompana_por_defecto: boolean
  autoriza_datos: boolean
}

const FORM_VACIO: Formulario = {
  nombre_completo: '',
  tipo_documento: 'CC',
  numero_documento: '',
  whatsapp: '',
  foto_perfil_url: '',
  acompana_por_defecto: true,
  autoriza_datos: false,
}

export default function EquipoTecnicoPage() {
  const { token } = useParams<{ token: string }>()
  const [tecnico, setTecnico] = useState<{ id: string; nombre_completo: string } | null>(null)
  const [auxiliares, setAuxiliares] = useState<Auxiliar[]>([])
  const [disponible, setDisponible] = useState(true)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null)

  const [editando, setEditando] = useState<'nuevo' | string | null>(null)
  const [form, setForm] = useState<Formulario>(FORM_VACIO)
  const [subiendoFoto, setSubiendoFoto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    const { data: tec, error: tecErr } = await querySupabase(() =>
      supabase.from('tecnicos').select('id, nombre_completo').eq('portal_token', token).single()
    )
    if (tecErr || !tec) {
      setError('Enlace inválido o expirado')
      setCargando(false)
      return
    }
    setTecnico(tec)
    try {
      const res = await fetch(`/api/tecnico/equipo?portalToken=${encodeURIComponent(token)}`)
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setDisponible(body.disponible !== false)
      setAuxiliares((body.auxiliares ?? []) as Auxiliar[])
    } catch (err) {
      setMensaje({ texto: 'No se pudo cargar tu equipo: ' + (err instanceof Error ? err.message : String(err)), tipo: 'error' })
    } finally {
      setCargando(false)
    }
  }, [token])

  useEffect(() => { cargar() }, [cargar])

  const activos = auxiliares.filter(a => a.activo)

  const abrirNuevo = () => {
    setForm(FORM_VACIO)
    setEditando('nuevo')
    setMensaje(null)
  }

  const abrirEdicion = (a: Auxiliar) => {
    setForm({
      nombre_completo: a.nombre_completo,
      tipo_documento: a.tipo_documento,
      numero_documento: a.numero_documento,
      whatsapp: a.whatsapp ? a.whatsapp.replace(/^57/, '') : '',
      foto_perfil_url: a.foto_perfil_url,
      acompana_por_defecto: a.acompana_por_defecto,
      autoriza_datos: true,
    })
    setEditando(a.id)
    setMensaje(null)
  }

  const subirFoto = async (files: FileList) => {
    if (!tecnico) return
    const file = files[0]
    if (!file) return
    setSubiendoFoto(true)
    setMensaje(null)
    try {
      const lista = await prepararFoto(file, 'perfil')
      const url = await uploadFotoAuxiliar(lista, tecnico.id)
      setForm(prev => ({ ...prev, foto_perfil_url: url }))
    } catch (err) {
      setMensaje({ texto: 'No se pudo subir la foto: ' + (err instanceof Error ? err.message : String(err)), tipo: 'error' })
    } finally {
      setSubiendoFoto(false)
    }
  }

  const guardar = async () => {
    if (!editando) return
    setGuardando(true)
    setMensaje(null)
    try {
      const esNuevo = editando === 'nuevo'
      const res = await fetch('/api/tecnico/equipo', {
        method: esNuevo ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portalToken: token,
          ...(esNuevo ? {} : { id: editando }),
          auxiliar: {
            nombre_completo: form.nombre_completo,
            tipo_documento: form.tipo_documento,
            numero_documento: form.numero_documento,
            whatsapp: form.whatsapp || null,
            foto_perfil_url: form.foto_perfil_url,
            acompana_por_defecto: form.acompana_por_defecto,
            autoriza_datos: form.autoriza_datos,
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      const aux = body.auxiliar as Auxiliar
      setAuxiliares(prev => (esNuevo ? [...prev, aux] : prev.map(a => (a.id === aux.id ? aux : a))))
      setEditando(null)
      setMensaje({
        texto: esNuevo
          ? `${aux.nombre_completo} quedó registrado. Baird lo verificará y te avisamos: hasta entonces no aparece ante los clientes.`
          : body.reverificar
            ? `${aux.nombre_completo} actualizado. Como cambiaron sus datos, Baird debe verificarlo de nuevo.`
            : `${aux.nombre_completo} actualizado.`,
        tipo: 'exito',
      })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : String(err), tipo: 'error' })
    } finally {
      setGuardando(false)
    }
  }

  const togglePorDefecto = async (a: Auxiliar) => {
    setOcupado(a.id)
    try {
      const res = await fetch('/api/tecnico/equipo', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalToken: token, id: a.id, acompana_por_defecto: !a.acompana_por_defecto }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setAuxiliares(prev => prev.map(x => (x.id === a.id ? (body.auxiliar as Auxiliar) : x)))
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : String(err), tipo: 'error' })
    } finally {
      setOcupado(null)
    }
  }

  const darDeBaja = async (a: Auxiliar) => {
    if (!window.confirm(`¿Quitar a ${a.nombre_completo} de tu equipo? Dejará de aparecer en tus servicios activos.`)) return
    setOcupado(a.id)
    try {
      const res = await fetch('/api/tecnico/equipo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ portalToken: token, id: a.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error ?? `Error ${res.status}`)
      setAuxiliares(prev => prev.map(x => (x.id === a.id ? { ...x, activo: false, acompana_por_defecto: false } : x)))
      setMensaje({ texto: `${a.nombre_completo} ya no está en tu equipo.`, tipo: 'exito' })
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : String(err), tipo: 'error' })
    } finally {
      setOcupado(null)
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

  const colorEstado: Record<EstadoVerificacionAuxiliar, string> = {
    verificado: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
    rechazado: 'bg-red-50 text-red-700 border-red-200',
  }
  const puedeAgregar = disponible && activos.length < MAX_AUXILIARES_POR_TECNICO

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-4">
          <Link href={`/tecnico/${token}`} className="relative w-36 h-10 block shrink-0">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill sizes="144px" className="object-contain object-left" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-bold text-slate-900 truncate">{tecnico.nombre_completo}</h1>
            <p className="text-xs text-gray-400">Mi equipo de trabajo</p>
          </div>
          <Link
            href={`/tecnico/${token}`}
            className="shrink-0 text-xs font-semibold text-slate-700 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2"
          >
            ← Mis servicios
          </Link>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {mensaje && (
          <div className={`p-4 rounded-xl text-sm font-medium ${
            mensaje.tipo === 'exito' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {mensaje.tipo === 'exito' ? '✅' : '⚠️'} {mensaje.texto}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
          <p className="font-semibold mb-1">¿Vas con auxiliar? Regístralo aquí</p>
          <p className="text-blue-800/80 text-xs leading-relaxed">
            El cliente debe saber quiénes van a entrar a su casa. Registra a cada persona que te acompaña (nombre, documento y foto).
            Baird la verifica y, desde ese momento, el cliente la ve junto a tu carnet digital en cada servicio.
            Los auxiliares trabajan bajo tu responsabilidad y tú les pagas; Baird no interviene en ese acuerdo.
          </p>
        </div>

        {!disponible && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
            El registro de auxiliares todavía no está habilitado. Avisa al equipo Baird por WhatsApp.
          </div>
        )}

        {/* Lista */}
        <section className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Mis auxiliares ({activos.length}/{MAX_AUXILIARES_POR_TECNICO})
            </h2>
            {puedeAgregar && editando === null && (
              <button
                type="button"
                onClick={abrirNuevo}
                className="text-xs font-semibold bg-slate-900 text-white px-3 py-1.5 rounded-lg hover:bg-slate-800"
              >
                + Agregar auxiliar
              </button>
            )}
          </div>

          {activos.length === 0 && editando === null ? (
            <p className="text-sm text-gray-400">Aún no has registrado auxiliares. Si vas solo a los servicios, no necesitas hacer nada.</p>
          ) : (
            <div className="space-y-3">
              {activos.map(a => (
                <div key={a.id} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-start gap-3">
                    <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-gray-100 shrink-0">
                      <Image src={a.foto_perfil_url} alt={a.nombre_completo} fill sizes="56px" className="object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900">{a.nombre_completo}</p>
                      <p className="text-xs text-gray-500 font-mono">{a.tipo_documento} {a.numero_documento}</p>
                      <span className={`inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${colorEstado[a.estado_verificacion]}`}>
                        {ESTADO_AUXILIAR_LABELS[a.estado_verificacion]}
                      </span>
                      {a.estado_verificacion === 'rechazado' && a.nota_verificacion && (
                        <p className="text-[11px] text-red-700 mt-1">{a.nota_verificacion}</p>
                      )}
                      {a.estado_verificacion === 'pendiente' && (
                        <p className="text-[11px] text-amber-700 mt-1">Baird está revisando sus datos. Mientras tanto no aparece ante los clientes.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-gray-100">
                    <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer mr-auto">
                      <input
                        type="checkbox"
                        checked={a.acompana_por_defecto}
                        disabled={ocupado === a.id || a.estado_verificacion !== 'verificado'}
                        onChange={() => togglePorDefecto(a)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                      Me acompaña por defecto en los servicios que acepte
                    </label>
                    <button type="button" onClick={() => abrirEdicion(a)} className="text-xs font-semibold text-blue-700 underline">
                      Editar
                    </button>
                    <button type="button" disabled={ocupado === a.id} onClick={() => darDeBaja(a)} className="text-xs font-semibold text-red-600 underline disabled:opacity-50">
                      Quitar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Formulario */}
          {editando !== null && (
            <div className="mt-4 rounded-xl border-2 border-slate-900 p-4 space-y-4">
              <h3 className="text-sm font-bold text-slate-900">{editando === 'nuevo' ? 'Nuevo auxiliar' : 'Editar auxiliar'}</h3>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Nombre completo *</label>
                <input
                  type="text"
                  value={form.nombre_completo}
                  onChange={e => setForm(p => ({ ...p, nombre_completo: e.target.value }))}
                  maxLength={80}
                  placeholder="Como aparece en la cédula"
                  className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Tipo *</label>
                  <select
                    value={form.tipo_documento}
                    onChange={e => setForm(p => ({ ...p, tipo_documento: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl py-2.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    {TIPOS_DOCUMENTO_AUXILIAR.map(t => (
                      <option key={t.value} value={t.value}>{t.value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Número de documento *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={form.numero_documento}
                    onChange={e => setForm(p => ({ ...p, numero_documento: e.target.value }))}
                    maxLength={20}
                    placeholder="Sin puntos"
                    className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Celular (opcional)</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={form.whatsapp}
                  onChange={e => setForm(p => ({ ...p, whatsapp: e.target.value }))}
                  maxLength={15}
                  placeholder="3XX XXX XXXX"
                  className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                />
                <p className="text-[11px] text-gray-400 mt-1">Solo para que Baird pueda contactarlo si hace falta. No recibe mensajes del servicio.</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Foto de la cara *</label>
                <div className="flex items-center gap-3">
                  <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-gray-100 border border-gray-200 shrink-0 flex items-center justify-center">
                    {form.foto_perfil_url ? (
                      <Image src={form.foto_perfil_url} alt="Foto del auxiliar" fill sizes="80px" className="object-cover" />
                    ) : (
                      <span className="text-2xl">👤</span>
                    )}
                  </div>
                  <div className="flex-1">
                    <SelectorFoto
                      onFiles={subirFoto}
                      capture="user"
                      disabled={subiendoFoto}
                      labelCamara={subiendoFoto ? 'Subiendo…' : '📷 Tomar foto'}
                      variant="buttons"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">De frente, con buena luz y sin gorra: el cliente la compara con la cédula.</p>
                  </div>
                </div>
              </div>

              <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.acompana_por_defecto}
                  onChange={e => setForm(p => ({ ...p, acompana_por_defecto: e.target.checked }))}
                  className="w-4 h-4 rounded border-gray-300 mt-0.5"
                />
                <span>Me acompaña por defecto en los servicios que acepte (lo puedes cambiar en cada servicio).</span>
              </label>

              {editando === 'nuevo' && (
                <label className="flex items-start gap-2 text-xs text-gray-700 cursor-pointer bg-gray-50 border border-gray-200 rounded-xl p-3">
                  <input
                    type="checkbox"
                    checked={form.autoriza_datos}
                    onChange={e => setForm(p => ({ ...p, autoriza_datos: e.target.checked }))}
                    className="w-4 h-4 rounded border-gray-300 mt-0.5"
                  />
                  <span>
                    Declaro que <strong>{form.nombre_completo.trim() || 'esta persona'}</strong> me autorizó a compartir su nombre, foto y número de documento
                    con Baird Service y con los clientes de los servicios que atendamos juntos, conforme a la{' '}
                    <Link href="/politica-privacidad" target="_blank" className="underline">política de privacidad</Link> (Ley 1581 de 2012),
                    y que trabaja bajo mi responsabilidad. *
                  </span>
                </label>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={guardar}
                  disabled={guardando || subiendoFoto}
                  className="flex-1 bg-slate-900 hover:bg-slate-800 text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50"
                >
                  {guardando ? 'Guardando…' : editando === 'nuevo' ? 'Registrar auxiliar' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  disabled={guardando}
                  className="px-4 bg-white border border-gray-200 text-gray-700 font-semibold py-3 rounded-xl text-sm"
                >
                  Cancelar
                </button>
              </div>
              {editando !== 'nuevo' && (
                <p className="text-[11px] text-gray-400">Si cambias nombre, documento o foto, Baird tendrá que verificarlo de nuevo.</p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
