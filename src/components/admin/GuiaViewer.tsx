'use client'

import { useMemo, useState, type ReactNode } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Visor de la guía de operación (`/admin/guia`). Recibe el markdown ya leído
 * en el servidor y lo parte en secciones por `## `: índice lateral con anclas
 * (h2 + h3), buscador client-side que filtra secciones por texto (sin tildes
 * ni mayúsculas) y render con react-markdown + GFM (tablas, checklists).
 */

interface Seccion {
  id: string
  titulo: string
  cuerpo: string
  subsecciones: { id: string; titulo: string }[]
  /** Texto normalizado (título + cuerpo) para el buscador. */
  indice: string
}

/** Quita tildes, emojis, puntuación y mayúsculas para comparar texto. */
export function normalizarTexto(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Slug estable para anclas: "4.3 La lista de solicitudes" → "4-3-la-lista-de-solicitudes". */
export function slugDe(titulo: string): string {
  return normalizarTexto(titulo).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
}

/** Texto plano de un heading de markdown (sin `código`, **negritas**, etc.). */
function tituloPlano(linea: string): string {
  return linea.replace(/^#+\s*/, '').replace(/[`*_]/g, '').trim()
}

/** Parte el markdown en intro (antes del primer `## `) + secciones. */
export function partirSecciones(markdown: string): { intro: string; secciones: Seccion[] } {
  const lineas = markdown.split(/\r?\n/)
  const secciones: Seccion[] = []
  const intro: string[] = []
  let actual: Seccion | null = null
  const usados = new Set<string>()
  let enCodigo = false

  const idUnico = (base: string) => {
    let id = base || 'seccion'
    let n = 2
    while (usados.has(id)) id = `${base}-${n++}`
    usados.add(id)
    return id
  }

  for (const linea of lineas) {
    if (linea.startsWith('```')) enCodigo = !enCodigo
    if (!enCodigo && linea.startsWith('## ')) {
      const titulo = tituloPlano(linea)
      actual = { id: idUnico(slugDe(titulo)), titulo, cuerpo: '', subsecciones: [], indice: '' }
      secciones.push(actual)
      continue
    }
    if (!enCodigo && linea.startsWith('### ') && actual) {
      const titulo = tituloPlano(linea)
      actual.subsecciones.push({ id: idUnico(slugDe(titulo)), titulo })
    }
    if (actual) actual.cuerpo += linea + '\n'
    else intro.push(linea)
  }

  for (const s of secciones) s.indice = normalizarTexto(`${s.titulo} ${s.cuerpo}`)
  return { intro: intro.join('\n'), secciones }
}

/** Texto plano de los children de un heading renderizado por react-markdown. */
function textoDe(children: ReactNode): string {
  if (typeof children === 'string' || typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(textoDe).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    const props = (children as { props?: { children?: ReactNode } }).props
    return textoDe(props?.children)
  }
  return ''
}

/**
 * Componentes de react-markdown con estilos Tailwind (no hay plugin
 * typography en el proyecto). Los h2/h3 llevan `id` = slug del texto, el
 * mismo que usa el índice lateral.
 */
const componentes: Components = {
  h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mb-3">{children}</h1>,
  h2: ({ children }) => (
    <h2 id={slugDe(textoDe(children))} className="text-xl font-bold text-slate-900 mt-10 mb-3 pt-6 border-t border-gray-200 scroll-mt-24">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 id={slugDe(textoDe(children))} className="text-base font-semibold text-slate-800 mt-6 mb-2 scroll-mt-24">
      {children}
    </h3>
  ),
  h4: ({ children }) => <h4 className="text-sm font-semibold text-slate-800 mt-4 mb-1">{children}</h4>,
  p: ({ children }) => <p className="text-sm text-slate-700 leading-relaxed mb-3">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-sm text-slate-700">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-sm text-slate-700">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ href, children }) => (
    <a href={href} className="text-blue-600 underline hover:text-blue-800" target={href?.startsWith('http') ? '_blank' : undefined} rel="noopener">
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  code: ({ children, className }) =>
    className ? (
      <code className="font-mono text-xs">{children}</code>
    ) : (
      <code className="font-mono text-[12px] bg-slate-100 text-slate-800 rounded px-1 py-0.5">{children}</code>
    ),
  pre: ({ children }) => (
    <pre className="bg-slate-900 text-slate-100 text-xs rounded-lg p-4 mb-4 overflow-x-auto whitespace-pre">{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-amber-300 bg-amber-50 text-amber-900 rounded-r-lg px-4 py-2 mb-4 [&_p]:text-amber-900 [&_p]:mb-1">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-6 border-gray-200" />,
  table: ({ children }) => (
    <div className="overflow-x-auto mb-4 rounded-lg border border-gray-200">
      <table className="w-full text-sm">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
  th: ({ children }) => <th className="text-left text-xs font-semibold text-gray-600 uppercase tracking-wide px-3 py-2 border-b border-gray-200 align-top">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border-b border-gray-100 text-slate-700 align-top leading-relaxed">{children}</td>,
  input: ({ checked }) => (
    <input type="checkbox" checked={!!checked} readOnly className="mr-2 align-middle accent-slate-900" aria-label={checked ? 'hecho' : 'pendiente'} />
  ),
}

export default function GuiaViewer({ markdown }: { markdown: string }) {
  const [busqueda, setBusqueda] = useState('')
  const { intro, secciones } = useMemo(() => partirSecciones(markdown), [markdown])

  const q = normalizarTexto(busqueda)
  const visibles = q ? secciones.filter((s) => s.indice.includes(q)) : secciones

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">📘 Guía de operación</h1>
          <p className="text-sm text-gray-500 mt-1">
            Cómo se opera el panel, paso a paso. Fuente: <code className="font-mono text-xs bg-slate-100 rounded px-1">docs/GUIA-OPERACION-LOGISTICA.md</code>
          </p>
        </div>
        <div className="w-full sm:w-80">
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="🔍 Buscar en la guía (p. ej. repuesto, Wompi, quincena)"
            aria-label="Buscar en la guía"
            className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
          {q && (
            <p className="text-xs text-gray-500 mt-1">
              {visibles.length === 0
                ? 'Ninguna sección coincide.'
                : `${visibles.length} de ${secciones.length} secciones coinciden.`}{' '}
              <button type="button" onClick={() => setBusqueda('')} className="text-blue-600 hover:underline">
                Limpiar
              </button>
            </p>
          )}
        </div>
      </div>

      <div className="flex gap-8 items-start">
        {/* Índice lateral */}
        <aside className="hidden lg:block w-64 shrink-0 sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contenido</p>
          <nav aria-label="Índice de la guía">
            <ol className="space-y-1">
              {visibles.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block text-sm text-slate-700 hover:text-slate-900 hover:bg-slate-50 rounded px-2 py-1 leading-snug">
                    {s.titulo}
                  </a>
                  {!q && s.subsecciones.length > 0 && (
                    <ul className="ml-3 border-l border-gray-100 pl-2 mt-0.5 space-y-0.5">
                      {s.subsecciones.map((sub) => (
                        <li key={sub.id}>
                          <a href={`#${sub.id}`} className="block text-xs text-slate-500 hover:text-slate-900 rounded px-2 py-0.5 leading-snug">
                            {sub.titulo}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        </aside>

        {/* Contenido */}
        <article className="flex-1 min-w-0 bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5 lg:px-8">
          {!q && intro && (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
              {intro}
            </ReactMarkdown>
          )}
          {visibles.length === 0 ? (
            <p className="text-sm text-gray-400 py-10 text-center">
              Ninguna sección contiene «{busqueda}». Prueba con otra palabra.
            </p>
          ) : (
            visibles.map((s) => (
              <section key={s.id} id={`sec-${s.id}`}>
                <ReactMarkdown remarkPlugins={[remarkGfm]} components={componentes}>
                  {`## ${s.titulo}\n${s.cuerpo}`}
                </ReactMarkdown>
              </section>
            ))
          )}
        </article>
      </div>
    </div>
  )
}
