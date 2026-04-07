import { z } from 'zod'
import { TIPOS_EQUIPO, TIPOS_SOLICITUD } from '@/types/solicitud'
import { isValidPhone } from '@/lib/utils/phone'

const phoneWithCode = z
  .string()
  .min(1, 'El telefono es requerido')
  .refine(isValidPhone, 'Ingresa un numero de telefono valido (minimo 7 digitos)')

const nonEmptyString = (fieldName: string, feminine = false) =>
  z.string()
    .min(1, `${fieldName} es ${feminine ? 'requerida' : 'requerido'}`)
    .trim()

// Schema principal del formulario
export const solicitudFormSchema = z.object({
  cliente_nombre: nonEmptyString('El nombre')
    .min(3, 'El nombre debe tener al menos 3 caracteres')
    .max(100, 'El nombre no puede exceder 100 caracteres'),

  cliente_telefono: phoneWithCode,

  direccion: nonEmptyString('La direccion', true)
    .min(5, 'La direccion debe ser mas especifica')
    .max(200, 'La direccion no puede exceder 200 caracteres'),

  ciudad_pueblo: nonEmptyString('La ciudad', true)
    .max(100, 'La ciudad no puede exceder 100 caracteres'),

  zona_servicio: nonEmptyString('La zona o barrio', true)
    .max(100, 'La zona no puede exceder 100 caracteres'),

  marca_equipo: nonEmptyString('La marca del equipo', true)
    .max(100, 'La marca no puede exceder 100 caracteres'),

  tipo_equipo: z.enum(TIPOS_EQUIPO, {
    message: 'Selecciona un tipo de equipo válido'
  }),

  tipo_solicitud: z.enum(TIPOS_SOLICITUD, {
    message: 'Selecciona un tipo de servicio válido'
  }),

  novedades_equipo: nonEmptyString('La descripción del problema', true)
    .min(20, 'Por favor describe el problema con más detalle (mínimo 20 caracteres)')
    .max(1000, 'La descripción no puede exceder 1000 caracteres'),

  es_garantia: z.boolean(),

  numero_serie_factura: z.string().optional(),

  // Campos de WhatsApp y coordinación de visita
  pago_tecnico: z
    .number({ error: 'Ingresa un valor numérico válido' })
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
