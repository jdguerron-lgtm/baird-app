'use client'

import { useCallback } from 'react'

export interface GpsPosition {
  lat: number
  lng: number
}

/**
 * Hook para capturar coordenadas GPS del navegador del técnico.
 * Returns una función `capturar()` que devuelve la posición actual o null si falla.
 */
export function useGps() {
  const capturar = useCallback((): Promise<GpsPosition | null> => {
    return new Promise((resolve) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        resolve(null)
        return
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      )
    })
  }, [])

  const enviarPing = useCallback(
    async (solicitudId: string, fase: 'llegada' | 'diagnostico' | 'completado' | 'post_visita') => {
      const pos = await capturar()
      if (!pos) return null
      try {
        await fetch('/api/gps-ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ solicitudId, fase, lat: pos.lat, lng: pos.lng }),
        })
        return pos
      } catch {
        return null
      }
    },
    [capturar]
  )

  return { capturar, enviarPing }
}
