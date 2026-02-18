import { TriajeResponse } from '@/types/solicitud'
import { LightBulbIcon } from '@/components/icons'

interface TriajeDisplayProps {
  triaje: TriajeResponse
}

/**
 * Componente que muestra los resultados del análisis de IA del problema
 * Incluye diagnóstico, métricas, costo estimado, repuestos y recomendaciones
 */
export function TriajeDisplay({ triaje }: TriajeDisplayProps) {
  const urgenciaColors = {
    baja: 'bg-green-50 border-green-200 text-green-800',
    media: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    alta: 'bg-red-50 border-red-200 text-red-800',
  }

  const complejidadColors = {
    baja: 'text-green-600',
    media: 'text-yellow-600',
    alta: 'text-red-600',
  }

  return (
    <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-6 space-y-4 animate-fadeIn">
      <div className="flex items-center gap-2 mb-4">
        <LightBulbIcon className="w-6 h-6 text-blue-600" />
        <h3 className="text-lg font-bold text-gray-900">Análisis Inteligente del Problema</h3>
      </div>

      {/* Diagnóstico Principal */}
      <div className="bg-white rounded-lg p-4 border border-blue-100">
        <p className="text-sm font-semibold text-gray-600 mb-1">Posible Falla:</p>
        <p className="text-base text-gray-900">{triaje.posible_falla}</p>
      </div>

      {/* Métricas Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Urgencia */}
        <div className={`rounded-lg p-3 border ${urgenciaColors[triaje.urgencia]}`}>
          <p className="text-xs font-semibold mb-1">Urgencia</p>
          <p className="text-lg font-bold capitalize">{triaje.urgencia}</p>
        </div>

        {/* Complejidad */}
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <p className="text-xs font-semibold text-gray-600 mb-1">Complejidad</p>
          <p className={`text-lg font-bold capitalize ${complejidadColors[triaje.nivel_complejidad]}`}>
            {triaje.nivel_complejidad}
          </p>
        </div>

        {/* Tiempo Estimado */}
        <div className="bg-white rounded-lg p-3 border border-gray-200">
          <p className="text-xs font-semibold text-gray-600 mb-1">Tiempo Est.</p>
          <p className="text-lg font-bold text-gray-900">
            {triaje.tiempo_estimado_horas}h
          </p>
        </div>
      </div>

      {/* Estimado de Costo */}
      <div className="bg-white rounded-lg p-4 border border-gray-200">
        <p className="text-sm font-semibold text-gray-600 mb-2">Estimado de Costo:</p>
        <p className="text-2xl font-bold text-green-600">
          ${triaje.costo_estimado_min.toLocaleString()} - ${triaje.costo_estimado_max.toLocaleString()} COP
        </p>
        <p className="text-xs text-gray-500 mt-1">*Valor aproximado, sujeto a confirmación del técnico</p>
      </div>

      {/* Repuestos */}
      {triaje.requiere_repuestos && triaje.repuestos_sugeridos.length > 0 && (
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <p className="text-sm font-semibold text-gray-600 mb-2">Posibles Repuestos Necesarios:</p>
          <ul className="list-disc list-inside space-y-1">
            {triaje.repuestos_sugeridos.map((repuesto, idx) => (
              <li key={idx} className="text-sm text-gray-700">{repuesto}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Recomendaciones */}
      {triaje.recomendaciones.length > 0 && (
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <p className="text-sm font-semibold text-gray-600 mb-2">Recomendaciones:</p>
          <ul className="space-y-2">
            {triaje.recomendaciones.map((rec, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-blue-600 mt-0.5">•</span>
                <span>{rec}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
