'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImageIfNeeded, inferExtension, MAX_IMAGE_SIZE_BYTES, MAX_IMAGE_SIZE_MB } from '@/lib/utils/media'
import { PREFIJO_ARCHIVO_ADMIN } from '@/lib/utils/evidencia-admin'

/**
 * "Registrar pago fuera de Wompi" (2026-10-22): para pagos de emergencia
 * (transferencia, consignación, efectivo…) que hay que dejar cerrados en el
 * ledger. La EVIDENCIA (foto del comprobante o PDF) es obligatoria: sube
 * directo a Storage (`{solicitud}/admin_*`) y luego POST /api/admin/pagos/externo.
 */
interface Props {
  solicitudId: string
  /** Saldo sugerido para precargar el monto (0 = sin sugerencia). */
  montoSugerido: number
  onRegistrado: () => Promise<void> | void
}

const METODOS = [
  { v: 'TRANSFERENCIA', l: 'Transferencia' },
  { v: 'CONSIGNACION', l: 'Consignación' },
  { v: 'EFECTIVO', l: 'Efectivo' },
  { v: 'NEQUI_DAVIPLATA', l: 'Nequi / Daviplata' },
  { v: 'OTRO', l: 'Otro' },
]

const hoy = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Bogota' })

export default function PagoExternoForm({ solicitudId, montoSugerido, onRegistrado }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'saldo' | 'anticipo' | 'abono'>('saldo')
  const [monto, setMonto] = useState(montoSugerido > 0 ? String(montoSugerido) : '')
  const [metodo, setMetodo] = useState('TRANSFERENCIA')
  const [referencia, setReferencia] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [nota, setNota] = useState('')
  const [archivos, setArchivos] = useState<File[]>([])
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null)

  const agregar = (files: FileList | null) => {
    if (!files) return
    const validos = Array.from(files).filter(f => f.type.startsWith('image/') || f.type === 'application/pdf')
    if (validos.length < files.length) setMsg({ ok: false, texto: 'Solo se aceptan fotos o PDF del comprobante.' })
    setArchivos(prev => [...prev, ...validos].slice(0, 5))
  }

  const enviar = async () => {
    const montoNum = Math.round(Number(monto.replace(/[^\d]/g, '')))
    if (!montoNum) return setMsg({ ok: false, texto: 'Indica el monto recibido.' })
    if (!referencia.trim()) return setMsg({ ok: false, texto: 'Indica la referencia del pago (n.º de transferencia, recibo…).' })
    if (!nota.trim()) return setMsg({ ok: false, texto: 'Explica por qué se pagó por fuera de Wompi.' })
    if (archivos.length === 0) return setMsg({ ok: false, texto: 'Adjunta la evidencia del pago (comprobante).' })
    if (!window.confirm(`¿Registrar $${montoNum.toLocaleString('es-CO')} como ${tipo} recibido por ${METODOS.find(m => m.v === metodo)?.l}?`)) return

    setEnviando(true)
    setMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return setMsg({ ok: false, texto: 'Sesión expirada — vuelve a iniciar sesión.' })

      const stamp = Date.now()
      const rand = Math.random().toString(36).slice(2, 8)
      const preparados = await Promise.all(archivos.map(f => (f.type.startsWith('image/') ? compressImageIfNeeded(f) : f)))
      const grande = preparados.find(f => f.size > MAX_IMAGE_SIZE_BYTES)
      if (grande) return setMsg({ ok: false, texto: `"${grande.name}" supera ${MAX_IMAGE_SIZE_MB} MB.` })

      const subidas = await Promise.all(preparados.map(async (file, i) => {
        const ext = file.type === 'application/pdf' ? 'pdf' : inferExtension(file)
        const path = `${solicitudId}/${PREFIJO_ARCHIVO_ADMIN}pago_${stamp}_${rand}_${i}.${ext}`
        const { error } = await supabase.storage
          .from('evidencias-servicio')
          .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || undefined })
        if (error) return null
        const { data } = supabase.storage.from('evidencias-servicio').getPublicUrl(path)
        return { url: data.publicUrl, mime: file.type || null, nombre: archivos[i].name }
      }))
      const evidencias = subidas.flatMap(s => (s ? [s] : []))
      if (evidencias.length === 0) return setMsg({ ok: false, texto: 'No se pudo subir la evidencia. Intenta de nuevo.' })

      const res = await fetch('/api/admin/pagos/externo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          solicitudId, tipo, monto: montoNum, metodo,
          referenciaExterna: referencia.trim(), nota: nota.trim(), evidencias,
          // Mediodía en Bogotá: evita que la zona horaria cambie el día.
          fechaPago: `${fecha}T12:00:00-05:00`,
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) return setMsg({ ok: false, texto: body?.error ?? `Error ${res.status}` })

      setMsg({
        ok: true,
        texto: body.cerrado
          ? '✅ Pago registrado y cobro marcado como pagado.'
          : `✅ Pago registrado.${body.faltante > 0 ? ` Aún faltan $${Number(body.faltante).toLocaleString('es-CO')} para completar el saldo.` : ''}`,
      })
      setArchivos([]); setReferencia(''); setNota(''); setMonto('')
      await onRegistrado()
    } catch (e) {
      setMsg({ ok: false, texto: e instanceof Error ? e.message : 'Error de conexión.' })
    } finally {
      setEnviando(false)
    }
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-amber-300 text-amber-800 hover:bg-amber-50"
        title="Para pagos de emergencia recibidos fuera de Wompi — exige comprobante"
      >
        💵 Registrar pago fuera de Wompi
      </button>
    )
  }

  const campo = 'w-full text-xs border border-gray-300 rounded-lg px-2 py-1.5'
  return (
    <div className="border border-amber-200 bg-amber-50/50 rounded-lg p-3 space-y-2">
      <p className="text-xs font-semibold text-amber-900">💵 Pago recibido fuera de Wompi</p>
      <p className="text-[11px] text-amber-800">
        Solo para emergencias. El comprobante es obligatorio y queda en el historial con tu correo.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[11px] text-gray-600">Cobro
          <select className={campo} value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)}>
            <option value="saldo">Saldo final</option>
            <option value="anticipo">Anticipo</option>
            <option value="abono">Abono repuestos</option>
          </select>
        </label>
        <label className="text-[11px] text-gray-600">Monto recibido (COP)
          <input className={campo} inputMode="numeric" value={monto} onChange={e => setMonto(e.target.value)} placeholder="239000" />
        </label>
        <label className="text-[11px] text-gray-600">Método
          <select className={campo} value={metodo} onChange={e => setMetodo(e.target.value)}>
            {METODOS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
        </label>
        <label className="text-[11px] text-gray-600">Fecha del pago
          <input className={campo} type="date" value={fecha} max={hoy()} onChange={e => setFecha(e.target.value)} />
        </label>
      </div>
      <label className="text-[11px] text-gray-600 block">Referencia (n.º de transferencia, recibo…)
        <input className={campo} value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={120} />
      </label>
      <label className="text-[11px] text-gray-600 block">¿Por qué se pagó por fuera?
        <textarea className={campo} rows={2} value={nota} onChange={e => setNota(e.target.value)} maxLength={500} />
      </label>
      <div>
        <label className="text-[11px] text-gray-600 block">Comprobante (foto o PDF, obligatorio)
          <input className="block text-xs mt-1" type="file" accept="image/*,application/pdf" multiple onChange={e => { agregar(e.target.files); e.target.value = '' }} />
        </label>
        {archivos.length > 0 && (
          <ul className="mt-1 text-[11px] text-gray-600 space-y-0.5">
            {archivos.map((f, i) => (
              <li key={i}>📎 {f.name} <button type="button" className="text-red-600 ml-1" onClick={() => setArchivos(a => a.filter((_, j) => j !== i))}>quitar</button></li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={enviar} disabled={enviando}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
          {enviando ? 'Registrando…' : 'Registrar pago'}
        </button>
        <button type="button" onClick={() => setAbierto(false)} disabled={enviando} className="text-xs text-gray-500">Cerrar</button>
      </div>
      {msg && <p className={`text-[11px] ${msg.ok ? 'text-emerald-700' : 'text-red-600'}`}>{msg.texto}</p>}
    </div>
  )
}
