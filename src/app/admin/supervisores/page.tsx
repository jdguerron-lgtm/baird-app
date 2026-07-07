'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { ESTADOS_VALIDOS, ESTADO_LABELS } from '@/lib/constants/estados'

interface Supervisor {
  id: string
  nombre: string
  whatsapp: string
  activo: boolean
  ambito: 'todos' | 'garantia' | 'particular'
  marca: string | null
  estados: string[] | null
  created_at: string
}

const AMBITOS: { value: Supervisor['ambito']; label: string; hint: string }[] = [
  { value: 'todos', label: 'Todos', hint: 'Garantía y particular' },
  { value: 'garantia', label: 'Solo garantía', hint: 'La marca paga' },
  { value: 'particular', label: 'Solo particular', hint: 'El cliente paga' },
]

const MARCAS = ['MABE', 'GE', 'GENERAL ELECTRIC', 'SAMSUNG', 'LG', 'WHIRLPOOL', 'HACEB']

const FORM_VACIO = {
  nombre: '',
  whatsapp: '',
  ambito: 'todos' as Supervisor['ambito'],
  marca: '',
  estados: [] as string[],
}

export default function SupervisoresAdmin() {
  const [supervisores, setSupervisores] = useState<Supervisor[]>([])
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState(FORM_VACIO)
  const [enviandoAcceso, setEnviandoAcceso] = useState<string | null>(null)
  const [linkAcceso, setLinkAcceso] = useState<
    { nombre: string; link: string; whatsappOk: boolean; error?: string } | null
  >(null)

  const authHeaders = useCallback(async (): Promise<HeadersInit> => {
    const { data: { session } } = await supabase.auth.getSession()
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    }
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    const res = await fetch('/api/admin/supervisores', { headers: await authHeaders() })
    const data = await res.json()
    setSupervisores(res.ok ? data.supervisores : [])
    setCargando(false)
  }, [authHeaders])

  // Carga inicial con el patrón idiomático setCargando(true)→await→setCargando(false).
  // react-hooks/set-state-in-effect lo marca como falso positivo (código correcto).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargar() }, [cargar])

  const resetForm = () => {
    setForm(FORM_VACIO)
    setEditandoId(null)
    setError('')
  }

  const editar = (s: Supervisor) => {
    setEditandoId(s.id)
    setError('')
    setAviso(null)
    setForm({
      nombre: s.nombre,
      whatsapp: s.whatsapp,
      ambito: s.ambito,
      marca: s.marca ?? '',
      estados: s.estados ?? [],
    })
  }

  const toggleEstado = (estado: string) => {
    setForm(f => ({
      ...f,
      estados: f.estados.includes(estado)
        ? f.estados.filter(e => e !== estado)
        : [...f.estados, estado],
    }))
  }

  const guardar = async () => {
    setError('')
    setAviso(null)
    if (!form.nombre.trim()) return setError('El nombre es obligatorio')
    if (!form.whatsapp.trim()) return setError('El WhatsApp es obligatorio')

    setGuardando(true)
    const payload = {
      nombre: form.nombre.trim(),
      whatsapp: form.whatsapp.trim(),
      ambito: form.ambito,
      marca: form.marca.trim() || null,
      estados: form.estados.length > 0 ? form.estados : null,
    }

    const res = await fetch('/api/admin/supervisores', {
      method: editandoId ? 'PATCH' : 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(editandoId ? { id: editandoId, ...payload } : payload),
    })
    const data = await res.json()
    setGuardando(false)

    if (!res.ok) {
      setError(data.error ?? 'Error al guardar')
      return
    }

    const fueCreacion = !editandoId
    resetForm()
    cargar()
    if (fueCreacion) {
      setAviso(
        data.whatsapp_bienvenida
          ? { ok: true, texto: 'Supervisor creado. Mensaje de bienvenida enviado por WhatsApp.' }
          : {
              ok: false,
              texto: `Supervisor creado, pero la bienvenida por WhatsApp no salió${
                data.whatsapp_error ? ` (${data.whatsapp_error})` : ''
              }.`,
            },
      )
    } else {
      setAviso({ ok: true, texto: 'Cambios guardados.' })
    }
  }

  const toggleActivo = async (s: Supervisor) => {
    await fetch('/api/admin/supervisores', {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify({ id: s.id, activo: !s.activo }),
    })
    cargar()
  }

  const eliminar = async (s: Supervisor) => {
    if (!confirm(`¿Eliminar al supervisor "${s.nombre}"? Dejará de recibir notificaciones.`)) return
    await fetch(`/api/admin/supervisores?id=${s.id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
    cargar()
  }

  const enviarAcceso = async (s: Supervisor) => {
    setAviso(null)
    setLinkAcceso(null)
    setEnviandoAcceso(s.id)
    const res = await fetch('/api/admin/supervisores/enviar-acceso', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ id: s.id }),
    })
    const data = await res.json()
    setEnviandoAcceso(null)
    if (!res.ok) {
      setAviso({ ok: false, texto: data.error ?? 'No se pudo generar el acceso' })
      return
    }
    setLinkAcceso({ nombre: s.nombre, link: data.link, whatsappOk: data.whatsapp_ok, error: data.whatsapp_error })
  }

  const copiarLink = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link)
      setAviso({ ok: true, texto: 'Link copiado al portapapeles.' })
    } catch {
      setAviso({ ok: false, texto: 'No se pudo copiar automáticamente; copialo manualmente.' })
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Supervisores</h1>
        <p className="text-sm text-gray-500 mt-1">
          Reciben por WhatsApp los cambios de estado según su configuración (ámbito, marca y estados).
          Al crear un supervisor activo, se le envía un mensaje de bienvenida con su alcance.
        </p>
      </div>

      {aviso && (
        <div
          className={`mb-6 rounded-lg p-3 text-sm ${
            aviso.ok
              ? 'bg-green-50 border border-green-200 text-green-900'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}
        >
          {aviso.ok ? '✅ ' : '⚠️ '}{aviso.texto}
        </div>
      )}

      {linkAcceso && (
        <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">
                Acceso de {linkAcceso.nombre}
              </p>
              <p className="text-xs mt-0.5">
                {linkAcceso.whatsappOk ? (
                  <span className="text-green-700">✅ Enviado por WhatsApp.</span>
                ) : (
                  <span className="text-amber-700">
                    ⚠️ No salió por WhatsApp{linkAcceso.error ? ` (${linkAcceso.error})` : ''}. Copiá el link y mandalo a mano.
                  </span>
                )}
              </p>
              <code className="block mt-2 text-xs text-slate-600 break-all bg-white border border-gray-200 rounded px-2 py-1.5">
                {linkAcceso.link}
              </code>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                onClick={() => copiarLink(linkAcceso.link)}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
              >
                Copiar
              </button>
              <button
                onClick={() => setLinkAcceso(null)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formulario crear / editar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-900 mb-4">
          {editandoId ? 'Editar supervisor' : 'Nuevo supervisor'}
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">Nombre</span>
            <input
              type="text"
              value={form.nombre}
              onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
              placeholder="Nombre del supervisor"
              className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">WhatsApp</span>
            <input
              type="tel"
              value={form.whatsapp}
              onChange={e => setForm(f => ({ ...f, whatsapp: e.target.value }))}
              placeholder="3134951164 o 573134951164"
              className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            />
          </label>
        </div>

        {/* Ámbito */}
        <div className="mb-4">
          <span className="block text-xs font-medium text-gray-600 mb-2">Ámbito</span>
          <div className="flex flex-wrap gap-2">
            {AMBITOS.map(({ value, label, hint }) => (
              <button
                key={value}
                type="button"
                onClick={() => setForm(f => ({ ...f, ambito: value }))}
                className={`px-3 py-2 rounded-xl border text-left transition ${
                  form.ambito === value
                    ? 'border-slate-900 bg-slate-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="text-sm font-medium text-slate-900">{label}</div>
                <div className="text-[11px] text-gray-500">{hint}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Marca */}
        <label className="block mb-4">
          <span className="block text-xs font-medium text-gray-600 mb-1">
            Marca <span className="text-gray-400 font-normal">(opcional — vacío = todas)</span>
          </span>
          <select
            value={form.marca}
            onChange={e => setForm(f => ({ ...f, marca: e.target.value }))}
            className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent bg-white"
          >
            <option value="">Todas las marcas</option>
            {MARCAS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </label>

        {/* Estados */}
        <div className="mb-4">
          <span className="block text-xs font-medium text-gray-600 mb-2">
            Estados <span className="text-gray-400 font-normal">(opcional — ninguno = todos)</span>
          </span>
          <div className="flex flex-wrap gap-1.5">
            {ESTADOS_VALIDOS.map(estado => (
              <button
                key={estado}
                type="button"
                onClick={() => toggleEstado(estado)}
                className={`text-[11px] font-medium px-2.5 py-1 rounded-full transition ${
                  form.estados.includes(estado)
                    ? 'bg-slate-900 text-white'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {ESTADO_LABELS[estado] ?? estado}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={guardar}
            disabled={guardando}
            className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Agregar supervisor'}
          </button>
          {editandoId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-xl border border-gray-200 px-5 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
          </div>
        ) : supervisores.length === 0 ? (
          <p className="text-sm text-gray-400 p-8 text-center">No hay supervisores configurados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Supervisor</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Ámbito</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Marca</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estados</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Activo</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {supervisores.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-900">{s.nombre}</p>
                      <p className="text-xs text-gray-400">{s.whatsapp}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs font-medium text-gray-700">
                        {AMBITOS.find(a => a.value === s.ambito)?.label ?? s.ambito}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-gray-600">{s.marca ?? 'Todas'}</span>
                    </td>
                    <td className="px-5 py-3">
                      {s.estados && s.estados.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {s.estados.map(e => (
                            <span key={e} className="text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">
                              {ESTADO_LABELS[e] ?? e}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Todos</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => toggleActivo(s)}
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full transition ${
                          s.activo
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}
                      >
                        {s.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => enviarAcceso(s)}
                          disabled={enviandoAcceso === s.id}
                          className="text-xs font-semibold text-slate-700 hover:text-slate-900 transition-colors disabled:text-gray-300"
                          title="Enviar por WhatsApp el link de acceso al panel de solo lectura (o copiarlo)"
                        >
                          {enviandoAcceso === s.id ? 'Enviando…' : '🔗 Acceso'}
                        </button>
                        <button
                          onClick={() => editar(s)}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                        >
                          Editar
                        </button>
                        <button
                          onClick={() => eliminar(s)}
                          className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
