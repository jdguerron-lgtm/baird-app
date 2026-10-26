import type { Metadata } from 'next'

/**
 * Metadata propia de /solicitar (2026-10-25). La página es 'use client' y no
 * puede exportar metadata, así que antes heredaba el título de la home. Es la
 * página de conversión de Google Ads: un título y una descripción que
 * coinciden con la búsqueda mejoran la experiencia de página de destino.
 */
const URL = 'https://lineablanca.bairdservice.com/solicitar'
// ≤ 60 caracteres para que Google no lo corte.
const TITULO = 'Solicitar Técnico a Domicilio en Bogotá | Baird Service'
const DESCRIPCION =
  'Pide en 2 minutos un técnico verificado para tu lavadora, nevera, secadora o estufa en Bogotá y la Sabana. Diagnóstico con precio fijo y coordinación por WhatsApp.'

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRIPCION,
  alternates: { canonical: URL },
  openGraph: {
    title: TITULO,
    description: DESCRIPCION,
    url: URL,
    siteName: 'Baird Service',
    locale: 'es_CO',
    type: 'website',
  },
}

export default function SolicitarLayout({ children }: { children: React.ReactNode }) {
  return children
}
