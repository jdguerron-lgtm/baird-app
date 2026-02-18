import { useState, useEffect } from 'react'

/**
 * Hook que retrasa la actualización de un valor hasta que haya pasado
 * un período de tiempo sin cambios
 * @param value - El valor a "debounce"
 * @param delay - El delay en milisegundos (default: 500ms)
 * @returns El valor debounced
 */
export function useDebounce<T>(value: T, delay: number = 500): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    // Set up the timeout
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    // Cleanup function para cancelar el timeout si el valor cambia
    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
