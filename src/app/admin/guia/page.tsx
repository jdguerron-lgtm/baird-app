import { readFile } from 'node:fs/promises'
import path from 'node:path'
import GuiaViewer from '@/components/admin/GuiaViewer'

/**
 * /admin/guia — Guía de operación para los operadores del panel (logística y
 * admin). Server Component: lee `docs/GUIA-OPERACION-LOGISTICA.md` del repo en
 * build/render (única fuente de verdad: el mismo archivo que se lee en GitHub)
 * y se lo pasa al visor client-side (índice lateral + buscador).
 *
 * Visible para admin y rol lectura: el guard de sesión es el del layout
 * `/admin`. El archivo se incluye en el bundle serverless de Vercel vía
 * `outputFileTracingIncludes` en `next.config.ts`.
 */

export const metadata = { title: 'Guía de operación — Baird Service' }

const RUTA_GUIA_MD = path.join(process.cwd(), 'docs', 'GUIA-OPERACION-LOGISTICA.md')

export default async function GuiaPage() {
  let markdown: string
  try {
    markdown = await readFile(RUTA_GUIA_MD, 'utf8')
  } catch {
    markdown = [
      '# Guía de operación',
      '',
      'No se encontró `docs/GUIA-OPERACION-LOGISTICA.md` en este despliegue.',
      'Revisa que el archivo exista en el repositorio y que `outputFileTracingIncludes` en `next.config.ts` lo incluya.',
    ].join('\n')
  }
  return <GuiaViewer markdown={markdown} />
}
