'use client'

import type { SiguientePasoDiagnostico } from '@/types/solicitud'

export interface SiguientePasoData {
  paso: SiguientePasoDiagnostico
  detalle: string
  /**
   * "Solo mantenimiento" (2026-10-12): el equipo no necesita reparación, solo
   * el mantenimiento de la tabla preestablecida (TARIFAS_MANTENIMIENTO). En
   * BD sigue siendo `siguiente_paso = 'reparar'` (el CHECK de la columna solo
   * admite 4 valores); la cotización se arma con el precio de catálogo y el
   * neto de tarifa fija del técnico — ver /api/diagnostico.
   */
  mantenimientoCatalogo?: boolean
}

interface Props {
  data: SiguientePasoData | null
  onChange: (data: SiguientePasoData | null) => void
  /** Si el técnico ya agregó productos necesarios arriba, deshabilita la advertencia. */
  tieneProductosNecesarios?: boolean
  /**
   * Habilita la opción "Solo mantenimiento (tarifa de catálogo)". Solo en
   * servicios PARTICULARES de Diagnóstico/Reparación: Mantenimiento y Cambio
   * de filtro ya son tarifa fija y no pasan por aquí.
   */
  opcionMantenimiento?: { equipo: string; precioCliente: number; pagoTecnico: number } | null
}

const OPCION_MANTENIMIENTO = {
  label: 'Reparación con precio predeterminado (mantenimiento)',
  icon: '🧼',
  descripcion: 'Es una reparación que se cobra con el precio fijo de mantenimiento según el electrodoméstico (tabla Baird). No ingresas costo ni cotizas: el precio ya está definido.',
  estilo: 'border-sky-300 bg-sky-50 hover:border-sky-500',
}

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

export default function SiguientePasoSelector({ data, onChange, tieneProductosNecesarios, opcionMantenimiento }: Props) {
  const update = (patch: Partial<SiguientePasoData>) => {
    if (!data) return
    onChange({ ...data, ...patch })
  }

  const seleccionar = (paso: SiguientePasoDiagnostico) => {
    onChange({ paso, detalle: '' })
  }

  const seleccionarMantenimiento = () => {
    onChange({ paso: 'reparar', detalle: 'Reparación con precio predeterminado de mantenimiento (tabla por electrodoméstico)', mantenimientoCatalogo: true })
  }

  const esMantenimiento = Boolean(data?.mantenimientoCatalogo)

  const claseBoton = (estilo: string, activo: boolean) =>
    `w-full text-left p-4 rounded-xl border-2 transition-all ${
      activo
        ? `${estilo.replace('hover:', '')} ring-2 ring-offset-1 ring-slate-900`
        : 'border-gray-200 bg-white ' + estilo.split(' ').filter(c => c.startsWith('hover:')).join(' ')
    }`

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
      <h2 className="text-lg font-bold text-slate-900 mb-1">Siguiente paso *</h2>
      <p className="text-xs text-gray-500 mb-4">
        Tras el diagnóstico, indica cuál es la siguiente acción. El cliente debe aprobar antes de proceder con
        cualquier reparación o cambio de estado.
      </p>

      <div className="space-y-2 mb-4">
        {OPCIONES.map(op => (
          <div key={op.paso} className="space-y-2">
            <button
              type="button"
              onClick={() => seleccionar(op.paso)}
              className={claseBoton(op.estilo, data?.paso === op.paso && !esMantenimiento)}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0">{op.icon}</span>
                <div>
                  <div className="text-sm font-bold text-slate-900">{op.label}</div>
                  <p className="text-xs text-gray-600 mt-0.5">{op.descripcion}</p>
                </div>
              </div>
            </button>
            {/* "Solo mantenimiento" va justo después de "reparar": es la otra
                forma de cerrar con cobro, pero con la tabla preestablecida. */}
            {op.paso === 'reparar' && opcionMantenimiento && (
              <button
                type="button"
                onClick={seleccionarMantenimiento}
                className={claseBoton(OPCION_MANTENIMIENTO.estilo, esMantenimiento)}
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl shrink-0">{OPCION_MANTENIMIENTO.icon}</span>
                  <div>
                    <div className="text-sm font-bold text-slate-900">{OPCION_MANTENIMIENTO.label}</div>
                    <p className="text-xs text-gray-600 mt-0.5">{OPCION_MANTENIMIENTO.descripcion}</p>
                    <p className="text-xs text-sky-800 mt-1 font-semibold">
                      Precio predeterminado para {opcionMantenimiento.equipo}: el cliente paga ${opcionMantenimiento.precioCliente.toLocaleString('es-CO')} COP · tú recibes ${opcionMantenimiento.pagoTecnico.toLocaleString('es-CO')} COP
                    </p>
                  </div>
                </div>
              </button>
            )}
          </div>
        ))}
      </div>

      {esMantenimiento && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-sm text-sky-900">
          🧼 <strong>Reparación con precio predeterminado.</strong> Al cliente le llega la cotización con el precio fijo de mantenimiento de su electrodoméstico para que la apruebe; luego haces el trabajo y completas el servicio como cualquier reparación. No ingresas tu costo: tu pago es el de la tabla (arriba).
        </div>
      )}

      {data?.paso === 'esperar_repuesto' && (
        <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-4 text-sm text-fuchsia-900">
          {tieneProductosNecesarios ? (
            <>📦 Listaste los repuestos arriba. El equipo Baird fijará precio y tiempo de entrega antes de notificar al cliente.</>
          ) : (
            <>⚠️ Indicaste que hay que esperar repuesto pero <strong>no agregaste ningún producto necesario</strong>. Sube y agrega el SKU y descripción del repuesto en la sección &quot;Productos necesarios&quot;.</>
          )}
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
