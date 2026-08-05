/**
 * Los equipos que se muestran en la home (#equipos) con su icono y su landing.
 *
 * Vive aparte de SERVICIOS_SEO porque las dos listas NO son la misma: hay 8
 * equipos y 7 landings. Nevera y Nevecón comparten `reparacion-neveras-bogota`,
 * que ya cubre ambos en su copy ("tu nevera o nevecón"). Mapear una tarjeta a
 * una landing que no existe daría un 404, así que el slug se valida contra
 * SERVICIOS_SEO en tiempo de arranque (ver assert al final).
 */

import type { ComponentType } from 'react'
import {
  AireAcondicionadoIcon,
  EstufaIcon,
  HornoIcon,
  LavadoraIcon,
  LavavajillasIcon,
  NeveconIcon,
  NeveraIcon,
  SecadoraIcon,
} from '@/components/icons/equipos'
import { SERVICIOS_SEO } from './servicios-seo'

export interface EquipoHome {
  nombre: string
  Icon: ComponentType<{ className?: string }>
  /** Slug de la landing SEO a la que enlaza la tarjeta */
  slug: string
}

export const EQUIPOS_HOME: readonly EquipoHome[] = [
  { nombre: 'Lavadora', Icon: LavadoraIcon, slug: 'reparacion-lavadoras-bogota' },
  { nombre: 'Nevera', Icon: NeveraIcon, slug: 'reparacion-neveras-bogota' },
  { nombre: 'Nevecón', Icon: NeveconIcon, slug: 'reparacion-neveras-bogota' },
  { nombre: 'Horno', Icon: HornoIcon, slug: 'reparacion-hornos-bogota' },
  { nombre: 'Estufa', Icon: EstufaIcon, slug: 'reparacion-estufas-bogota' },
  { nombre: 'A/C', Icon: AireAcondicionadoIcon, slug: 'reparacion-aires-acondicionados-bogota' },
  { nombre: 'Secadora', Icon: SecadoraIcon, slug: 'reparacion-secadoras-bogota' },
  { nombre: 'Lavavajillas', Icon: LavavajillasIcon, slug: 'reparacion-lavavajillas-bogota' },
] as const

// Falla el build si alguien renombra un slug en SERVICIOS_SEO y olvida esta
// lista: es preferible romper aquí que servir tarjetas que llevan a un 404.
const slugsValidos = new Set(SERVICIOS_SEO.map((s) => s.slug))
for (const eq of EQUIPOS_HOME) {
  if (!slugsValidos.has(eq.slug)) {
    throw new Error(
      `EQUIPOS_HOME: "${eq.nombre}" apunta al slug "${eq.slug}", que no existe en SERVICIOS_SEO.`,
    )
  }
}

/** Icono por nombre de equipo, para reutilizar la misma silueta en /servicios. */
export const ICONO_POR_SLUG: Record<string, ComponentType<{ className?: string }>> = {
  'reparacion-lavadoras-bogota': LavadoraIcon,
  'reparacion-neveras-bogota': NeveraIcon,
  'reparacion-hornos-bogota': HornoIcon,
  'reparacion-estufas-bogota': EstufaIcon,
  'reparacion-aires-acondicionados-bogota': AireAcondicionadoIcon,
  'reparacion-secadoras-bogota': SecadoraIcon,
  'reparacion-lavavajillas-bogota': LavavajillasIcon,
}
