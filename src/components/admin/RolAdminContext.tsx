'use client'

import { createContext, useContext } from 'react'
import type { RolAdmin } from '@/lib/auth/adminEmails'

/**
 * Rol de la sesión que está usando el shell `/admin/*` — 2026-10-13.
 *
 * Lo provee `src/app/admin/layout.tsx` una vez validada la sesión. Las páginas
 * lo leen con `useRolAdmin()` para ocultar controles de edición cuando el rol
 * es `lectura` (logística). Ocultar es cosmético: el bloqueo real lo hacen el
 * server (`verificarAdmin`) y el guard de `src/lib/auth/soloLectura.ts`.
 */
export interface RolAdminContextValue {
  rol: RolAdmin
  email: string | null
  /** Atajo: `rol === 'lectura'`. */
  soloLectura: boolean
}

const RolAdminContext = createContext<RolAdminContextValue>({
  rol: 'admin',
  email: null,
  soloLectura: false,
})

export const RolAdminProvider = RolAdminContext.Provider

export function useRolAdmin(): RolAdminContextValue {
  return useContext(RolAdminContext)
}
