'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRolAdmin } from '@/components/admin/RolAdminContext'
import type { CodigoDescuentoConUso } from '@/lib/services/descuentos.service'
import { describirDescuento, type TipoDescuento } from '@/lib/constants/descuentos'

/**
 * /admin/descuentos (2026-10-19) — códigos de descuento.
 *
 * El cliente particular escribe el código en /solicitar; el descuento se
 * aplica en el ÚLTIMO pago (saldo final), nunca en el anticipo ni en el abono
 * de repuestos. Baird lo asume (el pago al técnico no cambia). Reglas en
 * src/lib/constants/descuentos.ts.
 *
 * Rol lectura: ve el listado, no puede crear ni editar (el server también lo
 * rechaza).
 */

interface FormCodigo {
  codigo: string
  tipo: TipoDescuento
  valor: string
  descripcion: string
  vigente_desde: string
  vigente_hasta: string
  max_usos: string
  activo: boolean
}

const FORM_VACIO: FormCodigo = {
  codigo: '',
  tipo: 'porcentaje',
  valor: '',
  descripcion: '',
  vigente_desde: '',
  vigente_hasta: '',
  max_usos: '',
  activo: true,
}

const ESTADO_ESTILO: Record<CodigoDescuentoConUso['estado'], string> = {
  activo: 'bg-emerald-100 text-emerald-800',
  inactivo: 'bg-gray-100 text-gray-500',
  programado: 'bg-blue-100 text-blue-800',
  vencido: 'bg-amber-50 text-amber-700 border border-amber-200',
  agotado: 'bg-orange-50 text-orange-700 border border-orange-200',
}

const fmtFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium' }) : '—'

/** ISO (UTC) → valor para <input type="date"> en hora Colombia. */
function isoADate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const bogota = new Date(d.toLocaleString('en-US', { timeZone: 'America/Bogota' }))
  const y = bogota.getFullYear()
  const m = String(bogota.getMonth() + 1).padStart(2, '0')
  const day = String(bogota.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Fecha YYYY-MM-DD (Colombia) → ISO al inicio o al final del día. */
function dateAIso(date: string, fin: boolean): string | null {
  if (!date) return null
  return `${date}T${fin ? '23:59:59' : '00:00:00'}-05:00`
}

export default function DescuentosPage() {
  const { soloLectura } = useRolAdmin()
  const [codigos, setCodigos] = useState<CodigoDescuentoConUso[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<FormCodigo>(FORM_VACIO)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null)

  const token = async () => (await supabase.auth.getSession()).data.session?.access_token ?? ''

  const cargar = useCallback(async () => {
    setCargando(true)
    setError('')
    try {
      const res = await fetch('/api/admin/descuentos', { headers: { Authorization: `Bearer ${await token()}` } })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setCodigos(data.codigos)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error cargando códigos')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const set = <K extends keyof FormCodigo>(k: K, v: FormCodigo[K]) => setForm((f) => ({ ...f, [k]: v }))

  const editar = (c: CodigoDescuentoConUso) => {
    setEditandoId(c.id)
    setMensaje(null)
    setForm({
      codigo: c.codigo,
      tipo: c.tipo,
      valor: String(c.valor),
      descripcion: c.descripcion ?? '',
      vigente_desde: isoADate(c.vigente_desde),
      vigente_hasta: isoADate(c.vigente_hasta),
      max_usos: c.max_usos != null ? String(c.max_usos) : '',
      activo: c.activo,
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelar = () => {
    setEditandoId(null)
    setForm(FORM_VACIO)
    setMensaje(null)
  }

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (soloLectura) return
    const valor = Number(form.valor.replace(/[^\d.]/g, ''))
    if (!Number.isFinite(valor) || valor <= 0) {
      setMensaje({ ok: false, texto: 'Ingresa un valor válido.' })
      return
    }
    const body: Record<string, unknown> = {
      tipo: form.tipo,
      valor: form.tipo === 'valor' ? Math.round(valor) : valor,
      descripcion: form.descripcion.trim() || null,
      activo: form.activo,
      vigente_desde: dateAIso(form.vigente_desde, false),
      vigente_hasta: dateAIso(form.vigente_hasta, true),
      max_usos: form.max_usos.trim() ? Number(form.max_usos) : null,
    }
    setGuardando(true)
    setMensaje(null)
    try {
      const res = await fetch('/api/admin/descuentos', {
        method: editandoId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify(editandoId ? { id: editandoId, ...body } : { codigo: form.codigo.trim().toUpperCase(), ...body }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      setMensaje({ ok: true, texto: editandoId ? `Código ${data.codigo.codigo} actualizado.` : `Código ${data.codigo.codigo} creado.` })
      setEditandoId(null)
      setForm(FORM_VACIO)
      await cargar()
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : 'Error guardando' })
    } finally {
      setGuardando(false)
    }
  }

  const toggleActivo = async (c: CodigoDescuentoConUso) => {
    if (soloLectura) return
    if (!confirm(`¿${c.activo ? 'Desactivar' : 'Activar'} el código ${c.codigo}?${c.activo ? ' Las solicitudes que ya lo usaron conservan su descuento.' : ''}`)) return
    try {
      const res = await fetch('/api/admin/descuentos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token()}` },
        body: JSON.stringify({ id: c.id, activo: !c.activo }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Error')
      await cargar()
    } catch (e) {
      setMensaje({ ok: false, texto: e instanceof Error ? e.message : 'Error' })
    }
  }

  const ejemplo = (() => {
    const v = Number(form.valor)
    if (!Number.isFinite(v) || v <= 0) return null
    const total = 200_000
    const d = form.tipo === 'porcentaje' ? Math.round(total * Math.min(v, 100) / 100) : Math.min(Math.round(v), total)
    return { total, descuento: d, anticipo: 100_000, saldo: Math.max(0, total - d - 100_000) }
  })()

  return (
    <div className="p-8 max-w-6xl">
      <h1 className="text-xl font-bold text-slate-900">Códigos de descuento</h1>
      <p className="text-sm text-gray-500 mt-1 mb-6">
        El cliente particular escribe el código en el formulario de reserva. El descuento se aplica{' '}
        <strong>solo en el último pago</strong> (saldo final): el anticipo del 50% y el abono de repuestos se
        cobran completos. Baird asume el descuento — el pago al técnico no cambia. Un porcentaje se calcula
        sobre el total del servicio (diagnóstico + servicio + repuestos, IVA incluido). Si el descuento supera
        lo que falta por pagar, el saldo queda en $0 (sin devoluciones). No aplica a garantía.
      </p>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl p-3 mb-4">{error}</div>}

      {!soloLectura && (
        <form onSubmit={guardar} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {editandoId ? `Editar código ${form.codigo}` : 'Nuevo código'}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Código</span>
              <input
                type="text"
                value={form.codigo}
                onChange={(e) => set('codigo', e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                disabled={Boolean(editandoId)}
                placeholder="BIENVENIDO10"
                maxLength={30}
                required
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm font-mono uppercase focus:outline-none focus:border-emerald-500 disabled:bg-gray-100"
              />
              {!editandoId && <span className="block text-[11px] text-gray-400 mt-1">Letras, números, guion o guion bajo (3–30).</span>}
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Tipo</span>
              <select
                value={form.tipo}
                onChange={(e) => set('tipo', e.target.value as TipoDescuento)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              >
                <option value="porcentaje">Porcentaje (%) del total</option>
                <option value="valor">Valor fijo (COP)</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">{form.tipo === 'porcentaje' ? 'Porcentaje (1–100)' : 'Valor (COP)'}</span>
              <input
                type="text"
                inputMode="decimal"
                value={form.valor}
                onChange={(e) => set('valor', e.target.value)}
                placeholder={form.tipo === 'porcentaje' ? '10' : '20000'}
                required
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Máximo de usos (opcional)</span>
              <input
                type="number"
                min={1}
                value={form.max_usos}
                onChange={(e) => set('max_usos', e.target.value)}
                placeholder="Ilimitado"
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </label>
            <label className="block md:col-span-2">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Descripción (opcional, la ve el cliente)</span>
              <input
                type="text"
                value={form.descripcion}
                onChange={(e) => set('descripcion', e.target.value)}
                placeholder="Ej: Campaña redes octubre"
                maxLength={200}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Vigente desde (opcional)</span>
              <input
                type="date"
                value={form.vigente_desde}
                onChange={(e) => set('vigente_desde', e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-semibold text-gray-700 mb-1">Vigente hasta (opcional)</span>
              <input
                type="date"
                value={form.vigente_hasta}
                onChange={(e) => set('vigente_hasta', e.target.value)}
                className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
              />
            </label>
          </div>
          {ejemplo && (
            <p className="text-[11px] text-gray-500 mt-3">
              Ejemplo con un servicio de ${ejemplo.total.toLocaleString('es-CO')}: anticipo ${ejemplo.anticipo.toLocaleString('es-CO')} (sin descuento) →
              descuento −${ejemplo.descuento.toLocaleString('es-CO')} → saldo final ${ejemplo.saldo.toLocaleString('es-CO')}.
            </p>
          )}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={form.activo} onChange={(e) => set('activo', e.target.checked)} className="rounded border-gray-300" />
              Activo
            </label>
            <div className="flex-1" />
            {editandoId && (
              <button type="button" onClick={cancelar} className="text-xs font-semibold text-gray-600 px-3 py-2 rounded-lg hover:bg-gray-100">
                Cancelar
              </button>
            )}
            <button
              type="submit"
              disabled={guardando}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : editandoId ? 'Guardar cambios' : '➕ Crear código'}
            </button>
          </div>
          {mensaje && (
            <p className={`mt-3 text-sm ${mensaje.ok ? 'text-emerald-700' : 'text-red-600'}`}>{mensaje.ok ? '✅ ' : '❌ '}{mensaje.texto}</p>
          )}
        </form>
      )}

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
            <tr>
              <th className="text-left px-4 py-3">Código</th>
              <th className="text-left px-4 py-3">Descuento</th>
              <th className="text-left px-4 py-3">Descripción</th>
              <th className="text-left px-4 py-3">Vigencia</th>
              <th className="text-left px-4 py-3">Usos</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {cargando && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Cargando…</td></tr>
            )}
            {!cargando && codigos.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-6 text-center text-gray-400">Aún no hay códigos de descuento.</td></tr>
            )}
            {!cargando && codigos.map((c) => (
              <tr key={c.id} className={c.estado === 'activo' ? '' : 'opacity-70'}>
                <td className="px-4 py-3 font-mono font-semibold text-slate-900">{c.codigo}</td>
                <td className="px-4 py-3 text-gray-900">
                  {describirDescuento(c)}{' '}
                  <span className="text-xs text-gray-400">{c.tipo === 'porcentaje' ? 'del total' : 'fijo'}</span>
                </td>
                <td className="px-4 py-3 text-gray-600 max-w-[220px] truncate" title={c.descripcion ?? ''}>{c.descripcion ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {c.vigente_desde || c.vigente_hasta ? `${fmtFecha(c.vigente_desde)} → ${fmtFecha(c.vigente_hasta)}` : 'Sin límite'}
                </td>
                <td className="px-4 py-3 text-gray-900">
                  {c.usos}{c.max_usos != null ? ` / ${c.max_usos}` : ''}
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_ESTILO[c.estado]}`}>{c.estado}</span>
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  {!soloLectura && (
                    <>
                      <button type="button" onClick={() => editar(c)} className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50">
                        ✏️ Editar
                      </button>
                      <button type="button" onClick={() => toggleActivo(c)} className="text-xs font-semibold text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100">
                        {c.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
