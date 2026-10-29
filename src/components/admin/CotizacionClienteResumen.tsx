'use client'

import { formatCOP } from '@/lib/utils/format'

/**
 * "📄 Cotización enviada al cliente" en la ficha admin (2026-10-29).
 *
 * Muestra lo MISMO que el cliente vio en /cotizacion/{token}: fecha de envío,
 * si la aprobó o rechazó, el desglose (diagnóstico + servicio o total único),
 * los repuestos incluidos, el tiempo de entrega y los cambios de valor que
 * hizo el admin después. Solo lectura y solo particular. Las cuentas internas
 * (pago al técnico, margen) siguen en "💰 Cuentas del servicio".
 *
 * Lee el JSONB `solicitudes_servicio.cotizacion` tal cual (ver docs/SUPABASE.md).
 */

type Producto = { sku?: string; descripcion?: string; nombre?: string; cantidad?: number }

interface Cotizacion {
  token?: string
  total?: number | null
  mano_obra?: number | null
  repuestos?: number | null
  diagnostico_cliente?: number | null
  servicio_cliente?: number | null
  recargo_weekend?: number | null
  tiempo_entrega?: string | null
  diagnostico_tecnico?: string | null
  productos_necesarios?: Producto[] | null
  productos_recomendados?: Producto[] | null
  repuestos_detalle?: string | null
  mantenimiento_catalogo?: unknown
  pendiente_precio?: boolean | null
  cotizado_at?: string | null
  aprobado_at?: string | null
  rechazado_at?: string | null
  comentario_rechazo?: string | null
  valor_anterior?: number | null
  valor_actualizado_at?: string | null
  valor_actualizado_motivo?: string | null
  cobro_final_admin?: boolean | null
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://lineablanca.bairdservice.com'

function fecha(iso: string | null | undefined): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleString('es-CO', {
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Bogota',
  })
}

function Fila({ label, valor, bold }: { label: string; valor: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 text-sm ${bold ? 'font-bold border-t border-gray-200 pt-2 mt-1' : ''}`}>
      <span className={bold ? 'text-slate-900' : 'text-gray-600'}>{label}</span>
      <span className={bold ? 'text-blue-700' : 'text-slate-800'}>${formatCOP(valor)} COP</span>
    </div>
  )
}

export default function CotizacionClienteResumen({
  cotizacion,
  estado,
  esGarantia,
}: {
  cotizacion: unknown
  estado: string
  esGarantia: boolean
}) {
  if (esGarantia || !cotizacion || typeof cotizacion !== 'object') return null
  const c = cotizacion as Cotizacion
  const total = Number(c.total ?? 0)
  const pendientePrecio = c.pendiente_precio === true || estado === 'pendiente_pricing'

  // Estado de la respuesta del cliente.
  let respuesta: { texto: string; estilo: string }
  if (pendientePrecio && total <= 0) {
    respuesta = { texto: '⏳ Aún no enviada: falta fijar el precio', estilo: 'bg-orange-100 text-orange-800' }
  } else if (c.rechazado_at || estado === 'cotizacion_rechazada' || estado === 'reparacion_rechazada') {
    respuesta = { texto: `❌ Rechazada${c.rechazado_at ? ` el ${fecha(c.rechazado_at)}` : ''}`, estilo: 'bg-red-100 text-red-800' }
  } else if (c.aprobado_at) {
    respuesta = { texto: `✅ Aprobada el ${fecha(c.aprobado_at)}`, estilo: 'bg-emerald-100 text-emerald-800' }
  } else if (estado === 'cotizacion_enviada') {
    respuesta = { texto: '🕐 Esperando respuesta del cliente', estilo: 'bg-cyan-100 text-cyan-800' }
  } else if (total > 0) {
    respuesta = { texto: 'Sin aprobación registrada', estilo: 'bg-gray-100 text-gray-700' }
  } else {
    return null
  }

  const desglose = Number(c.diagnostico_cliente ?? 0) > 0 && Number(c.servicio_cliente ?? 0) > 0
  const desgloseLegacy = Number(c.mano_obra ?? 0) > 0 || Number(c.repuestos ?? 0) > 0
  const productos = (c.productos_necesarios ?? []).filter((p) => p && (p.descripcion || p.sku || p.nombre))
  const recomendados = (c.productos_recomendados ?? []).filter((p) => p && (p.nombre || p.descripcion))
  const linkCliente = c.token ? `${APP_URL}/cotizacion/${c.token}` : null

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">📄 Cotización enviada al cliente</h2>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${respuesta.estilo}`}>{respuesta.texto}</span>
      </div>

      <p className="text-xs text-gray-500 mb-3">
        {c.cotizado_at ? `Enviada el ${fecha(c.cotizado_at)}` : 'Sin fecha de envío registrada'}
        {linkCliente && (
          <>
            {' · '}
            <a href={linkCliente} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
              Ver la página que ve el cliente ↗
            </a>
          </>
        )}
      </p>

      {total > 0 && (
        <div className="space-y-1.5">
          {desglose ? (
            <>
              <Fila label="Visita de diagnóstico" valor={Number(c.diagnostico_cliente)} />
              <Fila label="Servicio (mano de obra + repuestos, IVA incluido)" valor={Number(c.servicio_cliente)} />
            </>
          ) : desgloseLegacy ? (
            <>
              <Fila label="Mano de obra" valor={Number(c.mano_obra ?? 0)} />
              <Fila label="Repuestos" valor={Number(c.repuestos ?? 0)} />
            </>
          ) : null}
          {Number(c.recargo_weekend ?? 0) > 0 && (
            <p className="text-xs text-gray-500">Incluye recargo fin de semana / festivo de ${formatCOP(Number(c.recargo_weekend))}.</p>
          )}
          <Fila label={desglose || desgloseLegacy ? 'Total cotizado' : 'Total cotizado (todo incluido, con IVA)'} valor={total} bold />
        </div>
      )}

      {c.valor_anterior != null && Number(c.valor_anterior) !== total && (
        <p className="mt-2 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2">
          ✏️ El valor cambió de <b>${formatCOP(Number(c.valor_anterior))}</b> a <b>${formatCOP(total)}</b>
          {c.valor_actualizado_at ? ` el ${fecha(c.valor_actualizado_at)}` : ''}
          {c.valor_actualizado_motivo ? `: ${c.valor_actualizado_motivo}` : ''}
          {c.cobro_final_admin ? ' (cobro final fijado por el admin)' : ''}.
        </p>
      )}

      {c.tiempo_entrega && (
        <p className="mt-2 text-sm text-gray-700">⏱ Tiempo de entrega: <b>{c.tiempo_entrega}</b></p>
      )}

      {Boolean(c.mantenimiento_catalogo) && (
        <p className="mt-2 text-xs text-gray-500">Precio de catálogo (mantenimiento / tarifa fija).</p>
      )}

      {productos.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-600 mb-1">Repuestos incluidos</p>
          <ul className="text-sm text-gray-800 list-disc pl-5 space-y-0.5">
            {productos.map((p, i) => (
              <li key={i}>
                {p.descripcion || p.nombre || p.sku}
                {p.sku && (p.descripcion || p.nombre) ? <span className="text-gray-400"> · {p.sku}</span> : null}
                {p.cantidad && p.cantidad > 1 ? <span className="text-gray-500"> × {p.cantidad}</span> : null}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!productos.length && c.repuestos_detalle && (
        <p className="mt-3 text-sm text-gray-700 whitespace-pre-line">🔧 {c.repuestos_detalle}</p>
      )}

      {recomendados.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-gray-600 mb-1">Recomendaciones que vio el cliente</p>
          <ul className="text-sm text-gray-700 list-disc pl-5 space-y-0.5">
            {recomendados.map((p, i) => (
              <li key={i}>{p.nombre || p.descripcion}</li>
            ))}
          </ul>
        </div>
      )}

      {c.diagnostico_tecnico && (
        <details className="mt-3">
          <summary className="text-xs font-semibold text-gray-600 cursor-pointer">Diagnóstico que leyó el cliente</summary>
          <p className="mt-1 text-sm text-gray-700 whitespace-pre-line">{c.diagnostico_tecnico}</p>
        </details>
      )}

      {c.comentario_rechazo && (
        <p className="mt-3 text-sm text-red-800 bg-red-50 rounded-lg px-3 py-2">Motivo del rechazo: {c.comentario_rechazo}</p>
      )}
    </div>
  )
}
