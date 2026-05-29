'use client'

import { useState } from 'react'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { compressImageIfNeeded, inferExtension } from '@/lib/utils/media'
import type { ProductoNecesario } from '@/types/solicitud'

interface Props {
  productos: ProductoNecesario[]
  onChange: (productos: ProductoNecesario[]) => void
  marcaEquipo?: string
  /** Modelo del equipo (extraído de novedades_equipo). Si se pasa, el link
   * Serviplus se pre-rellena con ?p={modelo} para ir directo al despiece. */
  modeloEquipo?: string | null
  /** ID de la solicitud — namespacing del path en Storage para evitar colisiones. */
  solicitudId?: string
}

const MARCAS_SERVIPLUS = ['mabe', 'ge', 'general electric', 'centrales']
const SERVIPLUS_BASE = 'https://visualizador.serviplus.com.mx/consultas/visualmdlo.html'

function urlServiplus(modelo?: string | null): string {
  const m = modelo?.trim()
  return m ? `${SERVIPLUS_BASE}?p=${encodeURIComponent(m)}` : SERVIPLUS_BASE
}

export default function ProductosNecesariosForm({ productos, onChange, marcaEquipo, modeloEquipo, solicitudId }: Props) {
  const esMarcaServiplus = !!marcaEquipo && MARCAS_SERVIPLUS.some(m => marcaEquipo.toLowerCase().includes(m))
  const linkServiplus = urlServiplus(modeloEquipo)

  // Estado transitorio de subida de imagen por índice de producto.
  const [subiendo, setSubiendo] = useState<Record<number, boolean>>({})
  const [errorImg, setErrorImg] = useState<Record<number, string>>({})

  const agregar = () => {
    onChange([...productos, { sku: '', descripcion: '', cantidad: 1 }])
  }

  const actualizar = (idx: number, patch: Partial<ProductoNecesario>) => {
    onChange(productos.map((p, i) => (i === idx ? { ...p, ...patch } : p)))
  }

  const eliminar = (idx: number) => {
    onChange(productos.filter((_, i) => i !== idx))
  }

  const subirImagen = async (idx: number, file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorImg(prev => ({ ...prev, [idx]: 'El archivo debe ser una imagen.' }))
      return
    }
    setErrorImg(prev => ({ ...prev, [idx]: '' }))
    setSubiendo(prev => ({ ...prev, [idx]: true }))
    try {
      const comprimida = await compressImageIfNeeded(file, { maxDimension: 2560, quality: 0.9 })
      const ext = inferExtension(comprimida)
      const stamp = Date.now()
      const rand = Math.random().toString(36).slice(2, 8)
      const path = `${solicitudId || 'producto'}/producto_${stamp}_${rand}_${idx}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('evidencias-servicio')
        .upload(path, comprimida, {
          cacheControl: '3600',
          upsert: false,
          contentType: comprimida.type || undefined,
        })

      if (uploadErr) {
        console.error(`[productos-necesarios] upload imagen ${idx} falló:`, uploadErr)
        setErrorImg(prev => ({ ...prev, [idx]: 'No se pudo subir la imagen. Intenta de nuevo.' }))
        return
      }
      const { data: urlData } = supabase.storage.from('evidencias-servicio').getPublicUrl(path)
      if (urlData?.publicUrl) {
        actualizar(idx, { imagen_url: urlData.publicUrl })
      } else {
        setErrorImg(prev => ({ ...prev, [idx]: 'No se pudo obtener la URL de la imagen.' }))
      }
    } catch (err) {
      console.error(`[productos-necesarios] error procesando imagen ${idx}:`, err)
      setErrorImg(prev => ({ ...prev, [idx]: 'Error al procesar la imagen.' }))
    } finally {
      setSubiendo(prev => ({ ...prev, [idx]: false }))
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
      <div className="flex items-start justify-between mb-1">
        <h2 className="text-lg font-bold text-slate-900">Productos necesarios</h2>
        {esMarcaServiplus && (
          <a
            href={linkServiplus}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-fuchsia-700 underline font-medium hover:text-fuchsia-900 shrink-0 ml-2"
            title={modeloEquipo ? `Buscar despiece para modelo ${modeloEquipo}` : 'Buscar SKU en Serviplus'}
          >
            🔍 {modeloEquipo ? `Buscar despiece ${modeloEquipo}` : 'Buscar SKU Serviplus'} ↗
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

          {/* Imagen del producto (opcional) — foto del repuesto requerido */}
          <div>
            <label className="block text-[10px] font-semibold text-gray-600 uppercase mb-1">Foto del producto (opcional)</label>
            {p.imagen_url ? (
              <div className="flex items-center gap-3">
                <Image
                  src={p.imagen_url}
                  alt={`Foto producto ${idx + 1}`}
                  width={72}
                  height={72}
                  className="w-[72px] h-[72px] object-cover rounded-lg border border-fuchsia-200"
                  unoptimized
                />
                <button
                  type="button"
                  onClick={() => actualizar(idx, { imagen_url: undefined })}
                  className="text-xs text-red-600 font-semibold hover:underline"
                >
                  Quitar foto
                </button>
              </div>
            ) : (
              <label className={`inline-flex items-center gap-2 rounded-lg border-2 border-dashed border-fuchsia-300 bg-white px-3 py-2 text-xs font-semibold text-fuchsia-700 ${subiendo[idx] ? 'opacity-60' : 'cursor-pointer hover:border-fuchsia-500'} transition`}>
                {subiendo[idx] ? '⏳ Subiendo…' : '📷 Agregar foto'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={subiendo[idx]}
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) subirImagen(idx, file)
                    e.target.value = ''
                  }}
                />
              </label>
            )}
            {errorImg[idx] && (
              <p className="text-[11px] text-red-600 mt-1">{errorImg[idx]}</p>
            )}
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
