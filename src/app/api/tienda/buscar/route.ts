import { NextRequest, NextResponse } from 'next/server'
import { TIENDA_URL } from '@/lib/constants/tienda'

/**
 * GET /api/tienda/buscar?q=2611
 *
 * Proxy de la búsqueda predictiva pública de la tienda Shopify
 * (tienda.bairdservice.com/search/suggest.json). Se proxea server-side
 * porque Shopify no expone CORS para llamadas cross-origin desde el
 * navegador, y así normalizamos el shape a lo mínimo que necesita la UI.
 *
 * Usado por ProductosNecesariosForm (diagnóstico del técnico): al escribir
 * el SKU/descripción de un repuesto (p.ej. "2611") le mostramos los
 * productos de la tienda que matchean, con precio y botón "Usar" que llena
 * la fila directamente (sin buscar aparte en la tienda).
 *
 * El SKU real no viene en suggest.json — se completa con un fetch paralelo
 * al endpoint público /products/{handle}.js (variants[].sku). Si falla,
 * sku queda null y la UI conserva lo que el técnico escribió.
 *
 * Respuesta: { productos: [{ titulo, sku, precio, disponible, url, imagen }] }
 * Ante cualquier falla upstream responde { productos: [] } (fail-open:
 * la búsqueda es informativa, nunca bloquea el diagnóstico).
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 3 || q.length > 60) {
    return NextResponse.json({ productos: [] })
  }

  try {
    const url =
      `${TIENDA_URL}/search/suggest.json?q=${encodeURIComponent(q)}` +
      '&resources[type]=product&resources[limit]=6'
    // Cache de 5 min por query — los precios de la tienda no cambian minuto
    // a minuto y evita golpear Shopify por cada tecla del técnico.
    const res = await fetch(url, { next: { revalidate: 300 } })
    if (!res.ok) {
      return NextResponse.json({ productos: [] })
    }

    const data = await res.json()
    interface ProductoShopify {
      title?: string
      handle?: string
      price?: string
      available?: boolean
      url?: string
      image?: string
      featured_image?: { url?: string }
    }
    const crudos: ProductoShopify[] = data?.resources?.results?.products ?? []

    // SKU real por producto vía /products/{handle}.js (público). Paralelo y
    // tolerante a fallas — cada .js también queda cacheado 5 min.
    const skus = await Promise.all(
      crudos.map(async p => {
        if (!p.handle) return null
        try {
          const r = await fetch(`${TIENDA_URL}/products/${p.handle}.js`, {
            next: { revalidate: 300 },
          })
          if (!r.ok) return null
          const prod = await r.json()
          const variantes: { sku?: string | null; available?: boolean }[] = prod?.variants ?? []
          const variante = variantes.find(v => v.available && v.sku) ?? variantes.find(v => v.sku)
          return variante?.sku?.trim() || null
        } catch {
          return null
        }
      })
    )

    const productos = crudos.map((p, i) => {
      const precio = Number.parseFloat(p.price ?? '')
      return {
        titulo: p.title ?? '',
        sku: skus[i],
        precio: Number.isFinite(precio) ? Math.round(precio) : null,
        disponible: p.available !== false,
        url: p.url?.startsWith('http') ? p.url : `${TIENDA_URL}${p.url ?? ''}`,
        imagen: p.featured_image?.url ?? p.image ?? null,
      }
    }).filter(p => p.titulo && p.url)

    return NextResponse.json({ productos })
  } catch (err) {
    console.error('[/api/tienda/buscar] Error consultando la tienda:', err)
    return NextResponse.json({ productos: [] })
  }
}
