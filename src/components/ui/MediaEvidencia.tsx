'use client'

import Image from 'next/image'
import { esUrlPdf, esUrlVideo } from '@/lib/utils/media'

/**
 * Tile de galería para una URL de evidencia (2026-10-20). Decide por la
 * extensión si es foto, video o PDF:
 *  - foto  → next/image dentro de un <a> que abre el original.
 *  - video → <video controls> inline (antes pasaba por next/image y salía
 *            como imagen rota en admin/supervisor/cotización) + link "Abrir".
 *  - PDF   → tile con ícono que abre el archivo.
 */
interface Props {
  url: string
  alt: string
  /** Clase de ring al hacer hover (p.ej. `hover:ring-purple-400`). */
  ring?: string
  className?: string
}

export default function MediaEvidencia({ url, alt, ring = 'hover:ring-gray-400', className = '' }: Props) {
  const base = `relative aspect-square rounded-lg overflow-hidden bg-gray-100 ${className}`

  if (esUrlVideo(url)) {
    return (
      <div className={`${base} bg-black`}>
        <video
          src={url}
          controls
          preload="metadata"
          playsInline
          className="w-full h-full object-contain"
          aria-label={alt}
        />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-black/80"
        >
          🎬 Abrir
        </a>
      </div>
    )
  }

  if (esUrlPdf(url)) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} flex flex-col items-center justify-center bg-red-50 text-red-700 hover:ring-2 ${ring} transition-all`}
        title={alt}
      >
        <span className="text-3xl">📄</span>
        <span className="text-[10px] font-semibold mt-1">PDF</span>
      </a>
    )
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${base} hover:ring-2 ${ring} transition-all`}
    >
      <Image src={url} alt={alt} fill className="object-cover" />
    </a>
  )
}
