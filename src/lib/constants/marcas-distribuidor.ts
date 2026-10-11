/**
 * Marcas de las que Baird Service es distribuidor mayorista oficial
 * (2026-10-10). Se muestran en la home ("Distribuidores mayoristas oficiales ·
 * repuestos 100% originales") y enlazan a la tienda.
 *
 * Logos: poner el archivo en `public/img/marcas/<slug>.svg` (o .png / .webp).
 * `src/app/page.tsx` detecta en build/render si existe y lo usa; si no,
 * muestra el nombre de la marca como wordmark. Así no hace falta tocar código
 * para agregar un logo — solo soltar el archivo con el nombre exacto.
 */
export interface MarcaDistribuidor {
  slug: string
  nombre: string
  /** Texto corto bajo el logo (qué distribuimos de esa marca). */
  nota: string
}

export const MARCAS_DISTRIBUIDOR: MarcaDistribuidor[] = [
  { slug: 'mabe', nombre: 'MABE', nota: 'Repuestos originales y garantía' },
  { slug: 'whirlpool', nombre: 'Whirlpool', nota: 'Repuestos originales' },
  { slug: 'maytag', nombre: 'Maytag', nota: 'Repuestos originales' },
  { slug: 'kitchenaid', nombre: 'KitchenAid', nota: 'Repuestos originales' },
  { slug: 'affresh', nombre: 'Affresh', nota: 'Productos de limpieza' },
]

export const LOGO_EXTENSIONES = ['svg', 'png', 'webp', 'jpg'] as const
