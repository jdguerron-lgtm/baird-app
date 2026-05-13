/**
 * Shared phone utilities for the "countryCode|number" pipe format.
 * Used by: PhoneInput (client), Zod schema (shared), WhatsApp service (server).
 */

/**
 * Parses a stored phone value like "57|3001234567" into parts.
 * Falls back to "57" prefix for legacy raw-digit values.
 */
export function parsePhone(value: string): { countryCode: string; number: string } {
  if (value.includes('|')) {
    const [countryCode, number] = value.split('|', 2)
    return { countryCode, number }
  }
  // Legacy: try to detect Colombian code from raw digits
  const digits = value.replace(/\D/g, '')
  if (digits.startsWith('57') && digits.length >= 12) {
    return { countryCode: '57', number: digits.slice(2) }
  }
  if (digits.length === 10 && digits.startsWith('3')) {
    return { countryCode: '57', number: digits }
  }
  return { countryCode: '57', number: digits }
}

/**
 * Converts any stored phone format to pure digits for WhatsApp API.
 *
 * Acepta TODOS los formatos en los que los datos pueden estar guardados o
 * tipeados:
 *   "57|3001234567"     pipe (formato actual del PhoneInput)
 *   "573001234567"      dígitos puros con código (formato deseable)
 *   "3001234567"        móvil colombiano sin código (se prefija 57)
 *   "+573001234567"     con + (de copy-paste, registro manual)
 *   "+57 300 123 4567"  con espacios (formato visual)
 *   "+57|3001234567"    pipe con + (legacy bug)
 *   "300-123-4567"      con guiones
 *
 * Strip de todos los caracteres no-dígito y luego asegura el prefijo 57
 * para móviles colombianos.
 *
 * IMPORTANTE: la BD también tiene un trigger `normalizar_telefono_co()`
 * (mig 20260513) que aplica la misma lógica en tecnicos.whatsapp y
 * solicitudes_servicio.cliente_telefono. Si cambias este algoritmo,
 * mantén la migración SQL en sync.
 */
export function phoneToDigits(value: string): string {
  if (!value) return ''

  // Strip TODO lo que no es dígito de toda la cadena de una vez.
  // Esto cubre: +, espacios, guiones, paréntesis, pipe `|`, etc.
  const digits = value.replace(/\D/g, '')
  if (digits.length === 0) return ''

  // Ya viene con código país 57 + 10 dígitos móvil (formato deseado)
  if (digits.length === 12 && digits.startsWith('57')) return digits

  // 10 dígitos arrancando con 3 = móvil colombiano sin código país
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`

  // Mayor a 12 con 57 al inicio: probable duplicación (57|57...). Recortar.
  if (digits.length > 12 && digits.startsWith('5757')) return digits.slice(2, 14)

  // Mayor a 12 con 57: dejar tal cual (puede ser fijo o número extranjero)
  if (digits.startsWith('57')) return digits

  // Cualquier otro caso (números extranjeros sin 57, fijos, etc.):
  // retornamos los dígitos sin prefijo. NO forzamos 57 ciegamente porque
  // rompería técnicos/clientes con código de otro país (US +1, MX +52).
  // Si necesitamos rechazar, isValidPhone() lo detecta upstream.
  return digits
}

/**
 * Verifica que un teléfono normalizado parezca un móvil colombiano válido.
 * Formato esperado: `573XXXXXXXXX` (12 dígitos, código 57 + móvil 3XX).
 *
 * Útil para detectar datos inconsistentes en BD (`+57 ...`, fijos, etc.)
 * antes de intentar enviar por WhatsApp. NO se usa en la validación del
 * formulario — el form usa `isValidPhone` (más permisivo).
 */
export function isMobileColombiano(digits: string): boolean {
  return /^573\d{9}$/.test(digits)
}

/**
 * Validates a phone value is well-formed.
 * Accepts "code|number" format or raw digits (10+).
 */
export function isValidPhone(value: string): boolean {
  if (value.includes('|')) {
    const [code, num] = value.split('|', 2)
    return code.length >= 1 && num.length >= 7
  }
  const digits = value.replace(/\D/g, '')
  return digits.length >= 10
}
