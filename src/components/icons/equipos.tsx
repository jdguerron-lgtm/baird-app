/**
 * Iconos de los equipos de línea blanca.
 *
 * Reemplazan a los emoji que se usaban en la home y en /servicios, que no
 * dejaban reconocer el aparato: Nevera y Nevecón compartían 🧊 (idénticos entre
 * sí), Estufa era un sartén 🍳, Lavadora unas burbujas 🫧 y Lavavajillas 🫗.
 *
 * Cada silueta se distingue de las demás por su rasgo real: la nevera divide
 * horizontal (congelador arriba) y el nevecón vertical (side-by-side); la
 * lavadora tiene tambor liso y la secadora tambor con aspas; el horno lleva
 * ventana y la estufa quemadores.
 *
 * Mismo contrato que `src/components/icons/index.tsx`: trazo `currentColor`,
 * viewBox 24×24, tamaño por `className`.
 */

interface IconProps {
  className?: string
}

const base = {
  fill: 'none',
  stroke: 'currentColor',
  viewBox: '0 0 24 24',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export const LavadoraIcon = ({ className = 'w-6 h-6' }: IconProps) => (
  <svg className={className} {...base} aria-hidden="true">
    <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
    <line x1="4" y1="7" x2="20" y2="7" />
    <circle cx="8" cy="4.75" r="0.9" />
    <circle cx="11.5" cy="4.75" r="0.9" />
    <circle cx="12" cy="14.5" r="4.5" />
    <circle cx="12" cy="14.5" r="1.6" />
  </svg>
)

export const SecadoraIcon = ({ className = 'w-6 h-6' }: IconProps) => (
  <svg className={className} {...base} aria-hidden="true">
    <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
    <line x1="4" y1="7" x2="20" y2="7" />
    <circle cx="8" cy="4.75" r="0.9" />
    <circle cx="11.5" cy="4.75" r="0.9" />
    <circle cx="12" cy="14.5" r="4.5" />
    {/* aspas del tambor: lo que diferencia una secadora de una lavadora */}
    <path d="M12 10.4v2.1M12 16.5v2.1M9 12.9l1.8 1M13.2 15.1l1.8 1M9 16.1l1.8-1M13.2 13.9l1.8-1" />
  </svg>
)

export const NeveraIcon = ({ className = 'w-6 h-6' }: IconProps) => (
  <svg className={className} {...base} aria-hidden="true">
    <rect x="5.5" y="2" width="13" height="20" rx="2.5" />
    {/* congelador arriba: división horizontal */}
    <line x1="5.5" y1="8.5" x2="18.5" y2="8.5" />
    <line x1="8.5" y1="5" x2="8.5" y2="7" />
    <line x1="8.5" y1="10.5" x2="8.5" y2="13.5" />
  </svg>
)

export const NeveconIcon = ({ className = 'w-6 h-6' }: IconProps) => (
  <svg className={className} {...base} aria-hidden="true">
    <rect x="4" y="2" width="16" height="20" rx="2.5" />
    {/* side-by-side: división vertical, con manija a cada lado */}
    <line x1="12" y1="2" x2="12" y2="22" />
    <line x1="10" y1="9" x2="10" y2="12.5" />
    <line x1="14" y1="9" x2="14" y2="12.5" />
  </svg>
)

export const HornoIcon = ({ className = 'w-6 h-6' }: IconProps) => (
  <svg className={className} {...base} aria-hidden="true">
    <rect x="3.5" y="3" width="17" height="18" rx="2.5" />
    <line x1="3.5" y1="8" x2="20.5" y2="8" />
    <circle cx="7" cy="5.5" r="0.9" />
    <circle cx="10.5" cy="5.5" r="0.9" />
    {/* ventana del horno */}
    <rect x="6.5" y="11" width="11" height="7" rx="1.2" />
  </svg>
)

export const EstufaIcon = ({ className = 'w-6 h-6' }: IconProps) => (
  <svg className={className} {...base} aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    {/* cuatro quemadores vistos desde arriba */}
    <circle cx="8.5" cy="9.5" r="2.2" />
    <circle cx="15.5" cy="9.5" r="2.2" />
    <circle cx="8.5" cy="16" r="1.6" />
    <circle cx="15.5" cy="16" r="1.6" />
  </svg>
)

export const AireAcondicionadoIcon = ({ className = 'w-6 h-6' }: IconProps) => (
  <svg className={className} {...base} aria-hidden="true">
    <rect x="2.5" y="4" width="19" height="8" rx="2.2" />
    <line x1="5.5" y1="9.5" x2="18.5" y2="9.5" />
    {/* flujo de aire saliendo de la unidad */}
    <path d="M7 15c0 1.5 1.5 1.5 1.5 3" />
    <path d="M12 15c0 1.5 1.5 1.5 1.5 3" />
    <path d="M17 15c0 1.5-1.5 1.5-1.5 3" />
  </svg>
)

export const LavavajillasIcon = ({ className = 'w-6 h-6' }: IconProps) => (
  <svg className={className} {...base} aria-hidden="true">
    <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="7" y1="4.75" x2="13" y2="4.75" />
    {/* platos en la canasta: la silueta que lo separa de una lavadora */}
    <line x1="8" y1="11" x2="8" y2="18" />
    <line x1="12" y1="11" x2="12" y2="18" />
    <line x1="16" y1="11" x2="16" y2="18" />
  </svg>
)
