import { z } from 'zod'
import { TIPOS_EQUIPO, TIPOS_SOLICITUD } from '@/types/solicitud'
import { isValidPhone } from '@/lib/utils/phone'

const phoneWithCode = z
  .string()
  .min(1, 'El telefono es requerido')
  .refine(isValidPhone, 'Ingresa un celular valido: 10 digitos empezando por 3 (ej: 3001234567)')

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

  // Opcional — cédula o NIT para la factura electrónica. Vacío = consumidor
  // final. Solo dígitos (sin puntos ni dígito de verificación).
  cliente_cedula: z.string()
    .trim()
    .max(15, 'La cédula no puede exceder 15 dígitos')
    .refine(
      (v) => v === '' || /^\d{5,15}$/.test(v),
      'Ingresa solo números, sin puntos ni guiones (mínimo 5 dígitos)',
    )
    .optional(),

  direccion: nonEmptyString('La direccion', true)
    .min(5, 'La direccion debe ser mas especifica')
    .max(200, 'La direccion no puede exceder 200 caracteres'),

  // Opcionales, solo particular — el servidor los anexa a `direccion` al
  // insertar (no son columnas propias en BD).
  edificio_conjunto: z.string()
    .trim()
    .max(100, 'El nombre del edificio o conjunto no puede exceder 100 caracteres')
    .optional(),

  apto_casa: z.string()
    .trim()
    .max(50, 'El apartamento o casa no puede exceder 50 caracteres')
    .optional(),

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

  // Calculado automáticamente por calcularPagoTecnico() — el cliente NO lo ingresa.
  // Garantía → 0 (lo cubre la marca). Particular → tarifa fija de catálogo.
  // El servidor lo recalcula igualmente para evitar manipulación desde el cliente.
  pago_tecnico: z
    .number({ error: 'Valor del servicio inválido' })
    .int('El valor debe ser un número entero')
    .min(0, 'El pago no puede ser negativo')
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
