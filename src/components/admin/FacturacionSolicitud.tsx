'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRolAdmin } from '@/components/admin/RolAdminContext'
import { FACTURACION_ESTADO_LABEL, type FacturacionEstado } from '@/types/solicitud'

/**
 * Bloque "🧾 Facturación" de la ficha `/admin/solicitudes/[id]` — 2026-10-22.
 *
 * Muestra el seguimiento de facturación del servicio (estado, N° de FV,
 * fecha, quién y nota) y permite cambiarlo: "Marcar facturada" (pide el
 * número de la FV de Siigo y una nota opcional), "No aplica" y "Volver a
 * pendiente". Solo opera sobre servicios `completada`; en otros estados se
 * muestra informativo.
 *
 * Es el ÚNICO bloque de edición visible y operable para el rol lectura
 * (logística): el server lo autoriza en `POST /api/admin/facturacion-estado`
 * y el guard de `window.fetch` deja pasar esa ruta exacta. Ver
 * docs/SEGURIDAD.md § "Rol lectura" y docs/FACTURACION.md.
 */

export interface SolicitudFacturacionView {
  id: string
  estado: string
  facturacion_estado?: FacturacionEstado | null
  factura_numero?: string | null
  facturada_at?: string | null
  facturada_por?: string | null
  facturacion_nota?: string | null
}

export type FacturacionActualizada = Required<
  Pick<SolicitudFacturacionView, 'facturacion_estado' | 'factura_numero' | 'facturada_at' | 'facturada_por' | 'facturacion_nota'>
>

interface Props {
  solicitud: SolicitudFacturacionView
  /** Se llama con las columnas nuevas tras un cambio exitoso (para refrescar la ficha sin refetch). */
  onActualizada?: (f: FacturacionActualizada) => void
}

const ESTILO_ESTADO: Record<FacturacionEstado, string> = {
  pendiente: 'bg-amber-50 text-amber-800 border-amber-200',
  facturada: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  no_aplica: 'bg-gray-100 text-gray-600 border-gray-200',
}

export default function FacturacionSolicitud({ solicitud, onActualizada }: Props) {
  const { soloLectura } = useRolAdmin()
  const estado: FacturacionEstado = solicitud.facturacion_estado ?? 'pendiente'
  const completada = solicitud.estado === 'completada'

  const [modo, setModo] = useState<'ver' | 'facturar'>('ver')
  const [numero, setNumero] = useState(solicitud.factura_numero ?? '')
  const [nota, setNota] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null)

  const enviar = async (facturacion_estado: FacturacionEstado) => {
    setGuardando(true)
    setResultado(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setResultado({ ok: false, texto: 'Sesión expirada. Inicia sesión de nuevo.' })
        return
      }
      const body: Record<string, string> = { solicitud_id: solicitud.id, facturacion_estado }
      if (facturacion_estado === 'facturada') body.factura_numero = numero.trim()
      if (nota.trim()) body.facturacion_nota = nota.trim()
      const res = await fetch('/api/admin/facturacion-estado', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setResultado({ ok: false, texto: data?.error ?? `Error ${res.status}` })
        return
      }
      const s = data?.solicitud ?? {}
      onActualizada?.({
        facturacion_estado: (s.facturacion_estado as FacturacionEstado) ?? facturacion_estado,
        factura_numero: s.factura_numero ?? null,
        facturada_at: s.facturada_at ?? null,
        facturada_por: s.facturada_por ?? null,
        facturacion_nota: s.facturacion_nota ?? null,
      })
      setModo('ver')
      setNota('')
      setResultado({
        ok: true,
        texto:
          facturacion_estado === 'facturada'
            ? `Marcada como facturada (${s.factura_numero ?? numero.trim()}).`
            : facturacion_estado === 'no_aplica'
              ? 'Marcada como "no aplica".'
              : 'Volvió a pendiente de facturar.',
      })
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : 'Error de red' })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">🧾 Facturación</h2>
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ESTILO_ESTADO[estado]}`}>
          {FACTURACION_ESTADO_LABEL[estado]}
          {estado === 'facturada' && solicitud.factura_numero ? ` · ${solicitud.factura_numero}` : ''}
        </span>
      </div>

      {estado !== 'pendiente' && (
        <dl className="text-xs text-gray-600 space-y-0.5 mb-3">
          {solicitud.factura_numero && (
            <div className="flex gap-2"><dt className="text-gray-400 w-24 shrink-0">N° factura</dt><dd className="font-mono font-semibold text-slate-800">{solicitud.factura_numero}</dd></div>
          )}
          {solicitud.facturada_at && (
            <div className="flex gap-2"><dt className="text-gray-400 w-24 shrink-0">Fecha</dt><dd>{new Date(solicitud.facturada_at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}</dd></div>
          )}
          {solicitud.facturada_por && (
            <div className="flex gap-2"><dt className="text-gray-400 w-24 shrink-0">Marcó</dt><dd className="truncate">{solicitud.facturada_por}</dd></div>
          )}
          {solicitud.facturacion_nota && (
            <div className="flex gap-2"><dt className="text-gray-400 w-24 shrink-0">Nota</dt><dd className="whitespace-pre-wrap">{solicitud.facturacion_nota}</dd></div>
          )}
        </dl>
      )}
      {estado === 'pendiente' && solicitud.facturacion_nota && (
        <p className="text-xs text-gray-600 mb-3"><span className="text-gray-400">Nota:</span> {solicitud.facturacion_nota}</p>
      )}

      {!completada ? (
        <p className="text-xs text-gray-500">
          La facturación se marca cuando el servicio esté <span className="font-semibold">completado</span>.
          {' '}Descarga el paquete para Siigo en <span className="font-semibold">Liquidaciones</span> y, al emitir la FV, vuelve aquí.
        </p>
      ) : modo === 'facturar' ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              placeholder="N° de factura en Siigo (ej. FV-2-1524)"
              maxLength={40}
              autoFocus
              className="flex-1 min-w-[200px] text-sm border-2 border-gray-200 rounded-lg px-3 py-1.5 font-mono focus:outline-none focus:border-emerald-500"
              aria-label="Número de factura"
            />
          </div>
          <input
            type="text"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Nota opcional (ej. va en la FV consolidada de MABE de la quincena)"
            maxLength={500}
            className="w-full text-xs border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-emerald-500"
            aria-label="Nota de facturación"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => enviar('facturada')}
              disabled={guardando || numero.trim().length === 0}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : '✅ Confirmar facturada'}
            </button>
            <button
              type="button"
              onClick={() => { setModo('ver'); setResultado(null) }}
              disabled={guardando}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {estado !== 'facturada' && (
            <button
              type="button"
              onClick={() => { setNumero(solicitud.factura_numero ?? ''); setModo('facturar'); setResultado(null) }}
              disabled={guardando}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
              title="Registra el número de la factura de venta emitida en Siigo"
            >
              🧾 Marcar facturada
            </button>
          )}
          {estado === 'facturada' && (
            <button
              type="button"
              onClick={() => { setNumero(solicitud.factura_numero ?? ''); setModo('facturar'); setResultado(null) }}
              disabled={guardando}
              className="text-xs px-3 py-1.5 rounded-lg border border-emerald-300 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              title="Corrige el número de factura o la nota"
            >
              ✏️ Corregir N° de factura
            </button>
          )}
          {estado !== 'no_aplica' && (
            <button
              type="button"
              onClick={() => enviar('no_aplica')}
              disabled={guardando}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              title="Este servicio no genera factura (p. ej. cortesía o ya incluido en otra FV)"
            >
              No aplica
            </button>
          )}
          {estado !== 'pendiente' && (
            <button
              type="button"
              onClick={() => enviar('pendiente')}
              disabled={guardando}
              className="text-xs px-3 py-1.5 rounded-lg border border-amber-300 text-amber-700 hover:bg-amber-50 disabled:opacity-50"
              title="Limpia el número y la fecha; el servicio vuelve a salir en 'Sin facturar'"
            >
              ↩️ Volver a pendiente
            </button>
          )}
        </div>
      )}

      {resultado && (
        <p className={`mt-2 text-[11px] ${resultado.ok ? 'text-emerald-700' : 'text-amber-700'}`}>{resultado.texto}</p>
      )}
      <p className="mt-3 text-[11px] text-gray-400">
        {soloLectura
          ? 'Tu cuenta de logística puede marcar aquí la facturación (única acción de edición habilitada). Queda registrado con tu correo en el historial.'
          : 'Seguimiento manual: contabilidad captura la FV en Siigo a partir del export de Liquidaciones y deja constancia aquí. Queda en el historial con quién lo marcó.'}
      </p>
    </div>
  )
}
