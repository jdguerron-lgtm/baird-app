import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Baird Service — Técnicos verificados en Colombia',
  description:
    'Conectamos clientes con técnicos certificados de electrodomésticos. Diagnóstico inteligente, coordinación por WhatsApp y pago acordado antes de la visita.',
  keywords: 'técnico electrodomésticos, reparación nevera, reparación lavadora, técnico bogotá, técnico verificado',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  )
}
