import { useEffect, useState } from 'react'

/**
 * Franjas SIN cupo para la fecha dada (YYYY-MM-DD), vía
 * GET /api/disponibilidad-horario. La UI las desactiva; el guard real es
 * server-side (validarHorarioAgendable). Fail-open: ante error devuelve []
 * (no bloquea nada — la confirmación valida de verdad).
 *
 * El resultado se guarda junto con la fecha que lo produjo y se DERIVA en el
 * return: si el usuario cambia de fecha, vuelve a [] de inmediato sin
 * setState síncrono en el effect (regla react-hooks/set-state-in-effect) y
 * sin mostrar las franjas llenas de la fecha anterior mientras carga.
 *
 * Usado por HorarioSelector y ReprogramarSelector.
 */
export function useFranjasLlenas(fecha: string): string[] {
  const [resultado, setResultado] = useState<{ fecha: string; llenas: string[] }>({ fecha: '', llenas: [] })

  useEffect(() => {
    if (!fecha) return
    let cancelado = false
    fetch(`/api/disponibilidad-horario?fecha=${encodeURIComponent(fecha)}`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (cancelado) return
        setResultado({ fecha, llenas: Array.isArray(data?.franjas_llenas) ? data.franjas_llenas : [] })
      })
      .catch(() => {
        if (!cancelado) setResultado({ fecha, llenas: [] })
      })
    return () => {
      cancelado = true
    }
  }, [fecha])

  return resultado.fecha === fecha ? resultado.llenas : []
}
