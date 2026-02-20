import { z } from 'zod'
import { TIPOS_EQUIPO, TIPOS_SOLICITUD } from '@/types/solicitud'

// Validaciones personalizadas
const colombianPhone = z
  .string()
  .min(1, 'El teléfono es requerido')
  .regex(
    /^(\+57)?[3][0-9]{9}$/,
    'Debe ser un número de celular colombiano válido (ej: +573001234567 o 3001234567)'
  )

const nonEmptyString = (fieldName: string) =>
  z.string()
    .min(1, `${fieldName} es requerido`)
    .trim()

// Schema principal del formulario
export const solicitudFormSchema = z.object({
  cliente_nombre: nonEmptyString('El nombre')
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),

  cliente_telefono: colombianPhone,

  direccion: nonEmptyString('La dirección')
    .min(5, 'La dirección debe ser más específica'),

  ciudad_pueblo: nonEmptyString('La ciudad'),

  zona_servicio: nonEmptyString('La zona o barrio'),

  marca_equipo: nonEmptyString('La marca del equipo'),

  tipo_equipo: z.enum(TIPOS_EQUIPO, {
    message: 'Selecciona un tipo de equipo válido'
  }),

  tipo_solicitud: z.enum(TIPOS_SOLICITUD, {
    message: 'Selecciona un tipo de servicio válido'
  }),

  novedades_equipo: nonEmptyString('La descripción del problema')
    .min(20, 'Por favor describe el problema con más detalle (mínimo 20 caracteres)')
    .max(1000, 'La descripción no puede exceder 1000 caracteres'),

  es_garantia: z.boolean(),

  numero_serie_factura: z.string().optional(),

  // Campos de WhatsApp y coordinación de visita
  pago_tecnico: z
    .number({ invalid_type_error: 'Ingresa un valor numérico válido' })
    .int('El valor debe ser un número entero')
    .min(20000, 'El pago mínimo es $20.000 COP')
    .max(10000000, 'El pago máximo es $10.000.000 COP'),

  horario_visita_1: nonEmptyString('El primer horario de visita')
    .max(100, 'El horario no puede exceder 100 caracteres'),

  horario_visita_2: nonEmptyString('El segundo horario de visita')
    .max(100, 'El horario no puede exceder 100 caracteres'),
})
// Refinamiento condicional: si es garantía, requiere número de serie
.refine(
  (data) => {
    if (data.es_garantia) {
      return data.numero_serie_factura && data.numero_serie_factura.trim().length > 0
    }
    return true
  },
  {
    message: 'El número de serie o factura es requerido para servicios de garantía',
    path: ['numero_serie_factura']
  }
)

export type SolicitudFormInput = z.infer<typeof solicitudFormSchema>
