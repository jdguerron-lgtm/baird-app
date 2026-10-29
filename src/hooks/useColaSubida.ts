'use client'

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
import { ColaSubida, resumenDe, type ArchivoSubida, type OpcionesCola, type ResumenCola } from '@/lib/utils/cola-subida'

export interface ColaSubidaApi {
  archivos: ArchivoSubida[]
  resumen: ResumenCola
  /** Encola y arranca la subida de inmediato. Devuelve los ítems creados. */
  agregar: (files: File[] | FileList | null) => ArchivoSubida[]
  quitar: (id: string) => void
  reintentar: (id: string) => void
  vaciar: () => void
  /** Resuelve cuando no queda nada en curso (ver `ColaSubida.esperarTodo`). */
  esperarTodo: () => Promise<{ urls: string[]; errores: ArchivoSubida[] }>
}

/**
 * Conecta una `ColaSubida` (subida en segundo plano de evidencia) a un
 * formulario del técnico. Las opciones se leen por ref en cada uso, así
 * `ruta` puede depender de estado que llega después (p. ej. `servicio.id`).
 *
 * Mientras haya archivos en curso avisa al salir de la página
 * (`beforeunload`): cerrar la pestaña a mitad de un video es la forma más
 * común de "perder" evidencia.
 */
export function useColaSubida(opts: OpcionesCola): ColaSubidaApi {
  const optsRef = useRef(opts)
  optsRef.current = opts

  const cola = useMemo(
    () =>
      new ColaSubida({
        bucket: opts.bucket,
        concurrencia: opts.concurrencia,
        ruta: (file, n, lote) => optsRef.current.ruta(file, n, lote),
        preparar: opts.preparar ? f => optsRef.current.preparar!(f) : undefined,
        subir: opts.subir ? (b, p, f, cb) => optsRef.current.subir!(b, p, f, cb) : undefined,
        miniatura: opts.miniatura ? f => optsRef.current.miniatura!(f) : undefined,
        validar: opts.validar ? (f, t) => optsRef.current.validar!(f, t) : undefined,
      }),
    // La cola vive toda la página; cambiar el bucket a mitad no tiene sentido.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [opts.bucket],
  )

  const suscribir = useCallback((fn: () => void) => cola.suscribir(fn), [cola])
  const snapshot = useCallback(() => cola.snapshot(), [cola])
  const archivos = useSyncExternalStore(suscribir, snapshot, snapshot)
  const resumen = useMemo(() => resumenDe(archivos), [archivos])

  useEffect(() => {
    if (resumen.enCurso === 0 || typeof window === 'undefined') return
    const aviso = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [resumen.enCurso])

  const agregar = useCallback(
    (files: File[] | FileList | null) => (files ? cola.agregar(Array.from(files)) : []),
    [cola],
  )
  const quitar = useCallback((id: string) => cola.quitar(id), [cola])
  const reintentar = useCallback((id: string) => cola.reintentar(id), [cola])
  const vaciar = useCallback(() => cola.vaciar(), [cola])
  const esperarTodo = useCallback(() => cola.esperarTodo(), [cola])

  return { archivos, resumen, agregar, quitar, reintentar, vaciar, esperarTodo }
}
