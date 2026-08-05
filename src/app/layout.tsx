import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import BotonWhatsAppFlotante from '@/components/BotonWhatsAppFlotante'
import { GOOGLE_ADS_ID } from '@/lib/analytics/googleAds'
import { GA_MEASUREMENT_ID } from '@/lib/analytics/googleAnalytics'
import { HERO_ASSIGN_SCRIPT } from '@/lib/analytics/experimentoHero'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || 'https://lineablanca.bairdservice.com',
  ),
  title: 'Baird Service — Técnicos verificados en Colombia',
  description:
    'Conectamos clientes con técnicos certificados de electrodomésticos. Diagnóstico inteligente, coordinación por WhatsApp y pago acordado antes de la visita.',
  keywords: 'técnico electrodomésticos, reparación nevera, reparación lavadora, técnico bogotá, técnico verificado',
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/manifest.json',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // suppressHydrationWarning va por el `data-hero` que el script del
  // experimento escribe en el <html> antes de hidratar: el servidor no lo emite
  // y React lo reporta como desajuste. Solo silencia atributos de ESTE nodo, no
  // del árbol.
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Asigna la variante del experimento del hero antes del primer paint.
            Va con `beforeInteractive` y no como <Script> normal porque si
            corriera después de hidratar se vería el hero de la variante `a`
            durante un instante. Ver src/lib/analytics/experimentoHero.ts */}
        <Script
          id="hero-experimento"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: HERO_ASSIGN_SCRIPT }}
        />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
        <BotonWhatsAppFlotante />

        {/* Google tag (gtag.js) — un solo loader para Google Ads (conversiones)
            y Google Analytics 4 (tráfico + eventos). Ambos config comparten
            window.gtag; el loader se carga con el ID de Ads pero sirve igual
            para los dos destinos. */}
        <Script
          src={`https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`}
          strategy="afterInteractive"
        />
        <Script id="google-gtag" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GOOGLE_ADS_ID}');
            gtag('config', '${GA_MEASUREMENT_ID}');
          `}
        </Script>
      </body>
    </html>
  )
}
