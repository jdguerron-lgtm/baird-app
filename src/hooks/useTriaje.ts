import { useState, useCallback } from 'react'
import { TriajeState, TriajeResponse } from '@/types/solicitud'

/**
 * Hook personalizado para manejar el triaje de IA
 * Gestiona el estado del triaje y proporciona funciones para analizar problemas
 */
export function useTriaje() {
  const [triaje, setTriaje] = useState<TriajeState>({
    loading: false,
    data: null,
    error: null,
  })

  /**
   * Analiza un problema usando la API de triaje de IA
   */
  const analizarProblema = useCallback(async (
    novedades: string,
    tipoEquipo: string,
    marcaEquipo: string,
    tipoSolicitud: string
  ) => {
    // No analizar si la descripción es muy corta
    if (novedades.length < 20) {
      return
    }

    setTriaje({ loading: true, data: null, error: null })

    try {
      const response = await fetch('/api/triaje', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          novedades_equipo: novedades,
          tipo_equipo: tipoEquipo,
          marca_equipo: marcaEquipo,
          tipo_solicitud: tipoSolicitud,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al analizar')
      }

      const data: TriajeResponse = await response.json()
      setTriaje({ loading: false, data, error: null })
    } catch (error: unknown) {
      const errorMessage = error instanceof Error
        ? error.message
        : 'Error al analizar el problema'

      setTriaje({
        loading: false,
        data: null,
        error: errorMessage,
      })
    }
  }, [])

  /**
   * Resetea el estado del triaje a su valor inicial
   */
  const resetTriaje = useCallback(() => {
    setTriaje({ loading: false, data: null, error: null })
  }, [])

  return {
    triaje: triaje.data,
    triajeLoading: triaje.loading,
    triajeError: triaje.error,
    analizarProblema,
    resetTriaje,
  }
}
