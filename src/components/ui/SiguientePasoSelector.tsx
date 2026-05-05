'use client'

import type { SiguientePasoDiagnostico } from '@/types/solicitud'

export interface SiguientePasoData {
  paso: SiguientePasoDiagnostico
  detalle: string
  // Solo si paso === 'esperar_repuesto'
  sku?: string
  descripcionRepuesto?: string
  costoRepuesto?: number
  tiempoEstimado?: string
}

interface Props {
  esGarantia: boolean
  data: SiguientePasoData | null
  onChange: (data: SiguientePasoData | null) => void
  marcaEquipo?: string
}

// Marcas que usan el portal Serviplus (Mabe/GE) para búsqueda de SKU/repuestos
const MARCAS_SERVIPLUS = ['mabe', 'ge', 'general electric', 'centrales']
const URL_SERVIPLUS = 'https://visualizador.serviplus.com.mx/index.html'

const OPCIONES: Array<{
  paso: SiguientePasoDiagnostico
  label: string
  icon: string
  descripcion: string
  estilo: string
}> = [
  {
    paso: 'reparar',
    label: 'Proceder con la reparación',
    icon: '🔧',
    descripcion: 'El equipo se puede reparar ahora mismo con lo que tengo disponible',
    estilo: 'border-emerald-300 bg-emerald-50 hover:border-emerald-500',
  },
  {
    paso: 'esperar_repuesto',
    label: 'Esperar por repuesto',
    icon: '📦',
    descripcion: 'Necesito un repuesto específico para completar la reparación (con SKU)',
    estilo: 'border-fuchsia-300 bg-fuchsia-50 hover:border-fuchsia-500',
  },
  {
    paso: 'no_reparable',
    label: 'Imposibilidad de arreglo',
    icon: '⚠️',
    descripcion: 'El equipo no es reparable; daño irreversible o costo de reparación supera el valor del equipo',
    estilo: 'border-stone-300 bg-stone-50 hover:border-stone-500',
  },
  {
    paso: 'negativa_cliente',
    label: 'Negativa del cliente',
    icon: '🚫',
    descripcion: 'El cliente decidió no proceder con la reparación tras conocer el diagnóstico',
    estilo: 'border-red-300 bg-red-50 hover:border-red-500',
  },
]

export default function SiguientePasoSelector({ esGarantia, data, onChange, marcaEquipo }: Props) {
  const update = (patch: Partial<SiguientePasoData>) => {
    if (!data) return
    onChange({ ...data, ...patch })
  }

  const seleccionar = (paso: SiguientePasoDiagnostico) => {
    onChange({ paso, detalle: '' })
  }

  const esMarcaServiplus = !!marcaEquipo && MARCAS_SERVIPLUS.some(m =>
    marcaEquipo.toLowerCase().includes(m)
  )

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
      <h2 className="text-lg font-bold text-slate-900 mb-1">Siguiente paso *</h2>
      <p className="text-xs text-gray-500 mb-4">
        Tras el diagnóstico, indica cuál es la siguiente acción. El cliente debe aprobar antes de proceder con
        cualquier reparación o cambio de estado.
      </p>

      <div className="space-y-2 mb-4">
        {OPCIONES.map(op => (
          <button
            key={op.paso}
            type="button"
            onClick={() => seleccionar(op.paso)}
            className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
              data?.paso === op.paso
                ? `${op.estilo.replace('hover:', '')} ring-2 ring-offset-1 ring-slate-900`
                : 'border-gray-200 bg-white ' + op.estilo.split(' ').filter(c => c.startsWith('hover:')).join(' ')
            }`}
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0">{op.icon}</span>
              <div>
                <div className="text-sm font-bold text-slate-900">{op.label}</div>
                <p className="text-xs text-gray-600 mt-0.5">{op.descripcion}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {data?.paso === 'esperar_repuesto' && (
        <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-fuchsia-900">📦 Detalle del repuesto</h3>
          <p className="text-xs text-fuchsia-800">
            {esGarantia
              ? 'En garantía el repuesto NO tiene costo para el cliente — lo cubre el fabricante. Aún así debes especificar el SKU exacto para que admin lo gestione.'
              : 'En servicio particular, el costo del repuesto debe estar incluido en la cotización aparte. Aquí solo el SKU para seguimiento.'}
          </p>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide">
                SKU del repuesto *
              </label>
              {esMarcaServiplus && (
                <a
                  href={URL_SERVIPLUS}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-fuchsia-700 underline font-medium flex items-center gap-1 hover:text-fuchsia-900"
                >
                  🔍 Buscar SKU en Serviplus (Mabe/GE) ↗
                </a>
              )}
            </div>
            <input
              type="text"
              value={data.sku ?? ''}
              onChange={(e) => update({ sku: e.target.value.toUpperCase() })}
              placeholder="Ej: WM-PCB-7421"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
            {esMarcaServiplus && (
              <p className="text-[11px] text-fuchsia-700 mt-1">
                💡 Esta marca usa Serviplus. Busca el SKU exacto del repuesto en el portal antes de continuar.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Descripción del repuesto *
            </label>
            <input
              type="text"
              value={data.descripcionRepuesto ?? ''}
              onChange={(e) => update({ descripcionRepuesto: e.target.value })}
              placeholder="Ej: Tarjeta electrónica de control"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>

          {!esGarantia && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Costo del repuesto (COP)
              </label>
              <input
                type="number"
                value={data.costoRepuesto ?? ''}
                onChange={(e) => update({ costoRepuesto: Number(e.target.value) || 0 })}
                placeholder="Ej: 250000"
                min="0"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
              Tiempo estimado de llegada *
            </label>
            <input
              type="text"
              value={data.tiempoEstimado ?? ''}
              onChange={(e) => update({ tiempoEstimado: e.target.value })}
              placeholder="Ej: 5 días hábiles"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
            />
          </div>
        </div>
      )}

      {data?.paso === 'no_reparable' && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
            Motivo técnico * (será comunicado al cliente)
          </label>
          <textarea
            value={data.detalle}
            onChange={(e) => update({ detalle: e.target.value })}
            placeholder="Ej: Daño irreparable en estructura interna del tambor; costo de repuesto supera el valor del equipo nuevo."
            rows={3}
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-stone-500 resize-none"
          />
        </div>
      )}

      {data?.paso === 'negativa_cliente' && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
            Razón expresada por el cliente *
          </label>
          <textarea
            value={data.detalle}
            onChange={(e) => update({ detalle: e.target.value })}
            placeholder="Ej: Cliente prefiere reemplazar el equipo en lugar de repararlo."
            rows={3}
            className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
          />
        </div>
      )}
    </div>
  )
}
