/**
 * Calcula distancia entre dos coordenadas GPS usando Haversine formula.
 * Devuelve distancia en metros.
 */
export function distanceMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6371000 // Radio de la Tierra en metros
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return R * c
}

// Distancia umbral (metros): si el técnico sigue dentro de este radio
// del sitio del cliente 30 min después de marcar completado → flag para admin.
export const FLAG_DISTANCE_METERS = 100

// Tiempo de espera tras marcar completado para verificar GPS post-visita
export const POST_VISIT_DELAY_MINUTES = 30
