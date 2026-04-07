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
 * Converts stored "countryCode|number" format to pure digits for WhatsApp API.
 * Strips non-digit characters from both parts for safety.
 * Always ensures Colombian country code 57 prefix.
 * Example: "57|3001234567" -> "573001234567"
 *          "3001234567"    -> "573001234567"
 *          "+573001234567" -> "573001234567"
 */
export function phoneToDigits(value: string): string {
  if (value.includes('|')) {
    const [code, num] = value.split('|', 2)
    const digits = `${code.replace(/\D/g, '')}${num.replace(/\D/g, '')}`
    // Ensure 57 prefix
    if (!digits.startsWith('57')) return `57${digits}`
    return digits
  }
  // Strip all non-digits (handles +57..., spaces, dashes, etc.)
  const digits = value.replace(/\D/g, '')
  // Already has country code
  if (digits.startsWith('57') && digits.length >= 12) return digits
  // Colombian mobile (10 digits starting with 3)
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`
  // Short number without country code — default to 57
  if (digits.length >= 7 && !digits.startsWith('57')) return `57${digits}`
  return digits
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
