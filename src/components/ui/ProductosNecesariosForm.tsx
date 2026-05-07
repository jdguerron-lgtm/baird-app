'use client'

import type { ProductoNecesario } from '@/types/solicitud'

interface Props {
  productos: ProductoNecesario[]
  onChange: (productos: ProductoNecesario[]) => void
  marcaEquipo?: string
}

const MARCAS_SERVIPLUS = ['mabe', 'ge', 'general electric', 'centrales']
const URL_SERVIPLUS = 'https://visualizador.serviplus.com.mx/index.html'

export default function ProductosNecesariosForm({ productos, onChange, marcaEquipo }: Props) {
  const esMarcaServiplus = !!marcaEquipo && MARCAS_SERVIPLUS.some(m => marcaEquipo.toLowerCase().includes(m))

  const agregar = () => {
    onChange([...productos, { sku: '', descripcion: '', cantidad: 1 }])
  }

  const actualizar = (idx: number, patch: Partial<ProductoNecesario>) => {
    onChange(productos.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  const eliminar = (idx: number) => {
    onChange(productos.filter((_, i) => i !== idx))
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-bold text-slate-900">Productos necesarios</h2>
        {esMarcaServiplus && (
          <a
            href={URL_SERVIPLUS}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-fuchsia-700 underline font-medium hover:text-fuchsia-900 shrink-0 ml-2"
          >
            🔍 Buscar SKU Serviplus ↗
          </a>
        )}
      </div>
      <p className="text-xs text-gray-500 mb-3">
        Repuestos que se necesitan para completar la reparación. Solo SKU, descripción y cantidad — el equipo Baird fija el precio y tiempo de entrega.
      </p>

      {productos.length === 0 && (
        <p className="text-xs text-gray-400 italic mb-3">Sin productos agregados.</p>
      )}

      {productos.map((p, idx) => (
        <div key={idx} className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3 mb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-fuchsia-900 uppercase">Producto {idx + 1}</span>
            <button
              type="button"
              onClick={() => eliminar(idx)}
              className="text-xs text-red-600 font-semibold hover:underline"
            >
              Quitar
            </button>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">SKU *</label>
            <input
              type="text"
              value={p.sku}
              onChange={(e) => actualizar(idx, { sku: e.target.value.toUpperCase() })}
              placeholder="Ej: WM-PCB-7421"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">Descripción *</label>
            <input
              type="text"
              value={p.descripcion}
              onChange={(e) => actualizar(idx, { descripcion: e.target.value })}
              placeholder="Ej: Tarjeta electrónica de control"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">Cantidad *</label>
            <input
              type="number"
              value={p.cantidad}
              min={1}
              max={99}
              onChange={(e) => actualizar(idx, { cantidad: Math.max(1, Number(e.target.value) || 1) })}
              className="w-32 border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={agregar}
        className="w-full rounded-xl border-2 border-dashed border-fuchsia-300 bg-fuchsia-50 py-3 text-sm font-semibold text-fuchsia-700 hover:border-fuchsia-500 transition"
      >
        + Agregar repuesto
      </button>
    </div>
  )
}
