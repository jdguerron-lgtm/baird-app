import { describe, expect, it } from 'vitest'
import { normalizarTexto, partirSecciones, slugDe } from '@/components/admin/GuiaViewer'

const MD = `# Guía

> Intro de la guía.

## 1. Entrar al panel

Texto con **negrita** y \`código\`.

### 1.1 Cómo entrar

Pasos.

## 2. Repuestos

\`\`\`
## esto no es un heading, está en un bloque de código
\`\`\`

Más texto sobre Wompi.

## 2. Repuestos
`

describe('GuiaViewer — parser de secciones', () => {
  it('normaliza tildes, mayúsculas y símbolos', () => {
    expect(normalizarTexto('  Devolución por Wompi ↩️ (ADMIN) ')).toBe('devolucion por wompi admin')
    expect(slugDe('4.3 La lista de solicitudes')).toBe('4-3-la-lista-de-solicitudes')
  })

  it('separa intro y secciones por ## y subsecciones por ###', () => {
    const { intro, secciones } = partirSecciones(MD)
    expect(intro).toContain('Intro de la guía')
    expect(secciones.map((s) => s.titulo)).toEqual(['1. Entrar al panel', '2. Repuestos', '2. Repuestos'])
    expect(secciones[0].subsecciones).toEqual([{ id: '1-1-como-entrar', titulo: '1.1 Cómo entrar' }])
    expect(secciones[0].cuerpo).toContain('### 1.1 Cómo entrar')
  })

  it('ignora headings dentro de bloques de código y hace únicos los ids repetidos', () => {
    const { secciones } = partirSecciones(MD)
    expect(secciones[1].cuerpo).toContain('esto no es un heading')
    expect(secciones.map((s) => s.id)).toEqual(['1-entrar-al-panel', '2-repuestos', '2-repuestos-2'])
  })

  it('indexa título + cuerpo normalizados para el buscador', () => {
    const { secciones } = partirSecciones(MD)
    expect(secciones[1].indice).toContain('wompi')
    expect(secciones[0].indice).toContain('negrita')
    expect(secciones.filter((s) => s.indice.includes('wompi')).map((s) => s.titulo)).toEqual(['2. Repuestos'])
  })
})
