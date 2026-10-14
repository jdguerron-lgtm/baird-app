'use client'

import { useEffect } from 'react'

/**
 * Si un correo de Supabase Auth (fallback sin Resend) trae a la persona al
 * Site URL con `#access_token=…&type=recovery|invite`, la reenvía a
 * /admin/establecer-clave conservando el hash para que supabase-js lo consuma
 * allí. Sin dependencias ni UI; no importa el cliente de Supabase a propósito
 * (no suma bundle a la home). — 2026-10-13
 */
export default function RedireccionRecuperacion() {
  useEffect(() => {
    const { hash, pathname } = window.location
    if (!hash || pathname.startsWith('/admin/establecer-clave')) return
    const p = new URLSearchParams(hash.slice(1))
    const tipo = p.get('type')
    if (p.get('access_token') && (tipo === 'recovery' || tipo === 'invite')) {
      window.location.replace(`/admin/establecer-clave${hash}`)
    }
  }, [])
  return null
}
