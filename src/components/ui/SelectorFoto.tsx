'use client'

import { useId, useRef } from 'react'

/**
 * SelectorFoto — par de disparadores "Tomar foto" (cámara en vivo) y
 * "Cargar guardada" (galería / archivos) sobre dos <input type="file"> ocultos.
 *
 * Por qué dos inputs (2026-10-09, pedido: cámara en vivo + fotos guardadas en
 * TODOS los puntos de subida):
 *  - `capture="user"|"environment"` hace que el celular abra la cámara
 *    directamente (frontal / trasera). Pero en iOS ese atributo OCULTA la
 *    opción "Fototeca", y en varios Android también salta el selector.
 *  - Sin `capture`, el navegador muestra la galería/el explorador de archivos.
 *  Un solo input no puede ofrecer bien las dos cosas → dos inputs, un handler.
 *
 * El value se resetea tras cada selección para que el técnico pueda volver a
 * elegir el mismo archivo si la primera vez falló (p.ej. foto rechazada).
 */
export interface SelectorFotoProps {
  /** Recibe los archivos elegidos (de cualquiera de los dos inputs). */
  onFiles: (files: FileList) => void
  /** Cámara: frontal (`user`, selfies/perfil) o trasera (`environment`). Default trasera. */
  capture?: 'user' | 'environment'
  /** `accept` del input de cámara. Default `image/*`. */
  acceptCamara?: string
  /** `accept` del input de galería/archivos. Default = `image/*`; aquí se puede sumar PDF. */
  acceptGaleria?: string
  multiple?: boolean
  disabled?: boolean
  labelCamara?: string
  labelGaleria?: string
  /**
   * - `buttons`: dos botones pill (default).
   * - `links`: dos enlaces subrayados chicos (estado "Cambiar").
   * - `tiles`: dos tarjetas grandes con ícono (zonas de carga vacías).
   */
  variant?: 'buttons' | 'links' | 'tiles'
  /** Archivo ya elegido pero aún no subido (flujos con botón "Subir" aparte): se muestra el nombre. */
  archivoSeleccionado?: File | null
  className?: string
}

export default function SelectorFoto({
  onFiles,
  capture = 'environment',
  acceptCamara = 'image/*',
  acceptGaleria = 'image/*',
  multiple = false,
  disabled = false,
  labelCamara = '📷 Tomar foto',
  labelGaleria = '🖼️ Cargar guardada',
  variant = 'buttons',
  archivoSeleccionado,
  className = '',
}: SelectorFotoProps) {
  const camaraRef = useRef<HTMLInputElement>(null)
  const galeriaRef = useRef<HTMLInputElement>(null)
  const id = useId()

  const handle = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files.length > 0) onFiles(files)
    e.target.value = ''
  }

  const estilos = {
    buttons: {
      wrap: 'flex flex-wrap items-center gap-2',
      camara: 'inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed',
      galeria: 'inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed',
    },
    links: {
      wrap: 'flex flex-wrap items-center gap-3',
      camara: 'text-xs font-semibold text-blue-700 underline disabled:opacity-50',
      galeria: 'text-xs font-semibold text-blue-700 underline disabled:opacity-50',
    },
    tiles: {
      wrap: 'grid grid-cols-2 gap-2 w-full',
      camara: 'rounded-xl border-2 border-dashed border-blue-300 bg-white py-4 flex flex-col items-center justify-center text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50',
      galeria: 'rounded-xl border-2 border-dashed border-gray-300 bg-white py-4 flex flex-col items-center justify-center text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50',
    },
  }[variant]

  return (
    <div className={className}>
      <div className={estilos.wrap}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => camaraRef.current?.click()}
          className={estilos.camara}
          aria-describedby={`${id}-hint`}
        >
          {labelCamara}
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => galeriaRef.current?.click()}
          className={estilos.galeria}
        >
          {labelGaleria}
        </button>
      </div>
      {archivoSeleccionado && (
        <p className="mt-1.5 text-xs text-gray-600 truncate" title={archivoSeleccionado.name}>
          📎 {archivoSeleccionado.name} · {(archivoSeleccionado.size / 1024 / 1024).toFixed(1)} MB
        </p>
      )}
      <span id={`${id}-hint`} className="sr-only">
        Tomar foto abre la cámara del dispositivo; cargar guardada abre la galería o el explorador de archivos.
      </span>
      {/* Cámara: capture abre la cámara en vivo (frontal o trasera). */}
      <input
        ref={camaraRef}
        type="file"
        accept={acceptCamara}
        capture={capture}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={handle}
      />
      {/* Galería / archivos: SIN capture para que iOS/Android muestren la biblioteca. */}
      <input
        ref={galeriaRef}
        type="file"
        accept={acceptGaleria}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={handle}
      />
    </div>
  )
}
