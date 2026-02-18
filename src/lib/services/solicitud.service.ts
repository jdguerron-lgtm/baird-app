import { supabase } from '@/lib/supabase'
import { SolicitudFormData, SolicitudServicio } from '@/types/solicitud'

interface SubmitResult {
  success: boolean
  data?: SolicitudServicio
  error?: string
}

/**
 * Envía una solicitud de servicio a Supabase
 * CORRECCIÓN CRÍTICA: Ahora SÍ guarda numero_serie_factura cuando es garantía
 * @param formData - Datos del formulario de solicitud
 * @returns Resultado con éxito/error y datos de la solicitud creada
 */
export async function submitSolicitud(
  formData: SolicitudFormData
): Promise<SubmitResult> {
  try {
    // IMPORTANTE: Ahora SÍ incluimos numero_serie_factura si es garantía
    const dataToInsert = formData.es_garantia
      ? formData // Incluye todo, incluyendo numero_serie_factura
      : { ...formData, numero_serie_factura: null } // Explícitamente null si no es garantía

    const { data, error } = await supabase
      .from('solicitudes_servicio')
      .insert([dataToInsert])
      .select() // IMPORTANTE: Usar .select() para obtener el ID y datos insertados
      .single()

    if (error) {
      console.error('Error de Supabase:', error)

      // Manejo diferenciado de errores según código
      if (error.code === '23505') {
        // Violación de unique constraint
        return {
          success: false,
          error: 'Ya existe una solicitud con estos datos',
        }
      }

      if (error.code === '23503') {
        // Foreign key violation
        return {
          success: false,
          error: 'Error de referencia en la base de datos',
        }
      }

      if (error.code === '42P01') {
        // Tabla no existe
        return {
          success: false,
          error: 'Error de configuración de base de datos. Contacta a soporte.',
        }
      }

      return {
        success: false,
        error: error.message || 'Error al crear la solicitud',
      }
    }

    if (!data) {
      return {
        success: false,
        error: 'No se recibió confirmación de la solicitud',
      }
    }

    return {
      success: true,
      data: data as SolicitudServicio,
    }
  } catch (error: unknown) {
    console.error('Error inesperado:', error)
    const errorMessage = error instanceof Error
      ? error.message
      : 'Error inesperado al enviar la solicitud'

    return {
      success: false,
      error: errorMessage,
    }
  }
}
