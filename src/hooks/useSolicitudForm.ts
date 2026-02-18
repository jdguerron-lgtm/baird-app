import { useState, useCallback } from 'react'
import { SolicitudFormData } from '@/types/solicitud'
import { solicitudFormSchema } from '@/lib/validations/solicitud.schema'
import { z } from 'zod'

const initialFormData: SolicitudFormData = {
  cliente_nombre: '',
  cliente_telefono: '',
  direccion: '',
  ciudad_pueblo: '',
  zona_servicio: '',
  marca_equipo: '',
  tipo_equipo: 'Lavadora',
  tipo_solicitud: 'Diagnóstico',
  novedades_equipo: '',
  es_garantia: false,
  numero_serie_factura: '',
}

/**
 * Hook personalizado para manejar el formulario de solicitud de servicio
 * Gestiona el estado del formulario, validación con Zod y errores
 */
export function useSolicitudForm() {
  const [formData, setFormData] = useState<SolicitudFormData>(initialFormData)
  const [errors, setErrors] = useState<Partial<Record<keyof SolicitudFormData, string>>>({})

  /**
   * Maneja cambios en los campos del formulario
   * Limpia el error del campo cuando el usuario empieza a escribir
   */
  const handleChange = useCallback((
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target
    const checked = (e.target as HTMLInputElement).checked

    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))

    // Limpiar error del campo cuando el usuario empieza a escribir
    if (errors[name as keyof SolicitudFormData]) {
      setErrors(prev => {
        const newErrors = { ...prev }
        delete newErrors[name as keyof SolicitudFormData]
        return newErrors
      })
    }
  }, [errors])

  /**
   * Valida el formulario completo usando el schema de Zod
   * @returns true si el formulario es válido, false si hay errores
   */
  const validate = useCallback((): boolean => {
    try {
      solicitudFormSchema.parse(formData)
      setErrors({})
      return true
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Partial<Record<keyof SolicitudFormData, string>> = {}
        error.issues.forEach((err) => {
          const field = err.path[0] as keyof SolicitudFormData
          if (field) {
            fieldErrors[field] = err.message
          }
        })
        setErrors(fieldErrors)
      }
      return false
    }
  }, [formData])

  /**
   * Resetea el formulario a sus valores iniciales
   */
  const resetForm = useCallback(() => {
    setFormData(initialFormData)
    setErrors({})
  }, [])

  return {
    formData,
    errors,
    handleChange,
    validate,
    resetForm,
    setFormData,
  }
}
