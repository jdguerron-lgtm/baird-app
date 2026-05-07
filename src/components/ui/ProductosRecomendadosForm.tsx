'use client'

import type { ProductoRecomendado } from '@/types/solicitud'

interface Props {
  productos: ProductoRecomendado[]
  onChange: (productos: ProductoRecomendado[]) => void
}

export default function ProductosRecomendadosForm({ productos, onChange }: Props) {
  const agregar = () => {
    onChange([...productos, { nombre: '', descripcion: '' }])
  }

  const actualizar = (idx: number, patch: Partial<ProductoRecomendado>) => {
    onChange(productos.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  const eliminar = (idx: number) => {
    onChange(productos.filter((_, i) => i !== idx))
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
      <h2 className="text-lg font-bold text-slate-900 mb-1">Productos recomendados</h2>
      <p className="text-xs text-gray-500 mb-3">
        Productos opcionales que mejoran el desempeño del equipo (limpiadores, lubricantes, accesorios). Sin precio — informativo para el cliente.
      </p>

      {productos.length === 0 && (
        <p className="text-xs text-gray-400 italic mb-3">Sin recomendaciones.</p>
      )}

      {productos.map((p, idx) => (
        <div key={idx} className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-900 uppercase">Recomendación {idx + 1}</span>
            <button
              type="button"
              onClick={() => eliminar(idx)}
              className="text-xs text-red-600 font-semibold hover:underline"
            >
              Quitar
            </button>
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">Nombre *</label>
            <input
              type="text"
              value={p.nombre}
              onChange={(e) => actualizar(idx, { nombre: e.target.value })}
              placeholder="Ej: Limpiador para tambor de lavadora"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">Descripción / Razón</label>
            <input
              type="text"
              value={p.descripcion}
              onChange={(e) => actualizar(idx, { descripcion: e.target.value })}
              placeholder="Ej: Para uso mensual, evita acumulación de mugre"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={agregar}
        className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 py-3 text-sm font-semibold text-blue-700 hover:border-blue-500 transition"
      >
        + Agregar recomendación
      </button>
    </div>
  )
}
