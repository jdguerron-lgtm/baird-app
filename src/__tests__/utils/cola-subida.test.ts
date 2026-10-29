import { describe, it, expect, vi } from 'vitest'
import {
  ColaSubida,
  porcentajePonderado,
  textoResumenCola,
  validarTamanoEvidencia,
  type OpcionesCola,
} from '@/lib/utils/cola-subida'
import { MAX_VIDEO_SIZE_BYTES, MAX_IMAGE_SIZE_BYTES } from '@/lib/utils/media'

// ── Helpers ──────────────────────────────────────────────────────────────────
const foto = (nombre = 'a.jpg', bytes = 1000) => new File([new Uint8Array(bytes)], nombre, { type: 'image/jpeg' })
const video = (nombre = 'v.mp4', bytes = 5000) => new File([new Uint8Array(bytes)], nombre, { type: 'video/mp4' })
const tick = () => new Promise<void>(r => setTimeout(r, 0))
const hasta = async (cond: () => boolean, max = 200) => {
  for (let i = 0; i < max && !cond(); i++) await tick()
  if (!cond()) throw new Error('condición no alcanzada')
}

/** Subida falsa controlable: resuelve/rechaza cuando el test lo pide. */
function subidorFalso() {
  const pendientes: Array<{ path: string; file: File; onProgreso: (p: { cargado: number; total: number }) => void; ok: (url: string) => void; falla: (e: Error) => void }> = []
  const subir: NonNullable<OpcionesCola['subir']> = (_bucket, path, file, onProgreso) =>
    new Promise((resolve, reject) => {
      pendientes.push({ path, file, onProgreso, ok: url => resolve({ publicUrl: url }), falla: reject })
    })
  return { subir, pendientes }
}

function cola(extra: Partial<OpcionesCola> = {}) {
  const { subir, pendientes } = subidorFalso()
  const opts: OpcionesCola = {
    bucket: 'evidencias-servicio',
    ruta: (file, n) => `sol/${n}_${file.name}`,
    preparar: async f => f,
    miniatura: async () => 'blob:mini',
    subir,
    ...extra,
  }
  return { c: new ColaSubida(opts), pendientes }
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe('ColaSubida — subida en segundo plano al elegir archivos', () => {
  it('agregar arranca la subida de inmediato y respeta la concurrencia (3)', async () => {
    const { c, pendientes } = cola()
    c.agregar([foto('1.jpg'), foto('2.jpg'), foto('3.jpg'), foto('4.jpg'), video('5.mp4')])
    await hasta(() => pendientes.length === 3)
    expect(c.snapshot().map(a => a.estado)).toEqual(['subiendo', 'subiendo', 'subiendo', 'en_cola', 'en_cola'])
    expect(c.resumen()).toMatchObject({ total: 5, listos: 0, errores: 0, enCurso: 5 })

    pendientes[0].ok('https://x/1')
    await hasta(() => pendientes.length === 4)
    expect(c.snapshot()[0]).toMatchObject({ estado: 'listo', url: 'https://x/1', pct: 100 })
    expect(c.snapshot()[3].estado).toBe('subiendo')
  })

  it('ignora archivos que no son evidencia (PDF, audio) y clasifica foto/video', () => {
    const { c } = cola()
    const creados = c.agregar([
      foto('a.jpg'),
      new File([new Uint8Array(10)], 'doc.pdf', { type: 'application/pdf' }),
      video('b.mp4'),
    ])
    expect(creados.map(a => a.tipo)).toEqual(['imagen', 'video'])
    expect(c.snapshot()[1].preview).toBe('video')
  })

  it('genera la miniatura sin bloquear y la asigna al ítem', async () => {
    const { c } = cola()
    c.agregar([foto()])
    expect(c.snapshot()[0].preview).toBeNull()
    await hasta(() => c.snapshot()[0].preview === 'blob:mini')
  })

  it('reporta el % por archivo y el % global ponderado por tamaño', async () => {
    const { c, pendientes } = cola()
    c.agregar([foto('chica.jpg', 1000), video('grande.mp4', 9000)])
    await hasta(() => pendientes.length === 2)
    pendientes[1].onProgreso({ cargado: 4500, total: 9000 })
    expect(c.snapshot()[1].pct).toBe(50)
    // 0 % de 1000 + 50 % de 9000 = 4500 / 10000 = 45 %
    expect(c.resumen().pct).toBe(45)
    pendientes[0].ok('u1')
    await hasta(() => c.snapshot()[0].estado === 'listo')
    expect(c.resumen().pct).toBe(55)
  })

  it('usa la ruta con consecutivo único y el nombre del archivo YA preparado (comprimido a .jpg)', async () => {
    const { c, pendientes } = cola({
      preparar: async f => new File([f], f.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }),
    })
    c.agregar([foto('IMG_1.heic'), foto('IMG_2.heic')])
    await hasta(() => pendientes.length === 2)
    expect(pendientes.map(p => p.path).sort()).toEqual(['sol/0_IMG_1.jpg', 'sol/1_IMG_2.jpg'])
    expect(c.snapshot()[0].path).toBe('sol/0_IMG_1.jpg')
  })

  it('un error deja el ítem en error con mensaje, y reintentar lo vuelve a encolar', async () => {
    const { c, pendientes } = cola()
    c.agregar([foto()])
    await hasta(() => pendientes.length === 1)
    pendientes[0].falla(new Error('La conexión se quedó sin avanzar.'))
    await hasta(() => c.snapshot()[0].estado === 'error')
    expect(c.snapshot()[0].error).toMatch(/conexión/)
    expect(c.resumen()).toMatchObject({ errores: 1, enCurso: 0 })

    c.reintentar(c.snapshot()[0].id)
    await hasta(() => pendientes.length === 2)
    expect(c.snapshot()[0]).toMatchObject({ estado: 'subiendo', error: null, intentos: 2 })
    pendientes[1].ok('u-ok')
    await hasta(() => c.snapshot()[0].estado === 'listo')
  })

  it('la validación tras preparar (video > tope) marca error sin llamar a subir', async () => {
    const { c, pendientes } = cola({ validar: (_f, tipo) => (tipo === 'video' ? 'El video excede el tope' : null) })
    c.agregar([video()])
    await hasta(() => c.snapshot()[0].estado === 'error')
    expect(pendientes).toHaveLength(0)
    expect(c.snapshot()[0].error).toBe('El video excede el tope')
  })

  it('quitar saca el ítem; si estaba en vuelo, la subida termina y se ignora', async () => {
    const { c, pendientes } = cola()
    c.agregar([foto('1.jpg'), foto('2.jpg')])
    await hasta(() => pendientes.length === 2)
    const id1 = c.snapshot()[0].id
    c.quitar(id1)
    expect(c.snapshot()).toHaveLength(1)
    pendientes[0].ok('u1') // la del archivo quitado
    pendientes[1].ok('u2')
    await hasta(() => c.snapshot()[0].estado === 'listo')
    expect(c.snapshot().map(a => a.url)).toEqual(['u2'])
  })

  it('esperarTodo resuelve de inmediato si no hay nada en curso y en orden de selección cuando termina', async () => {
    const { c, pendientes } = cola()
    expect(await c.esperarTodo()).toEqual({ urls: [], errores: [] })

    c.agregar([foto('1.jpg'), foto('2.jpg'), foto('3.jpg')])
    await hasta(() => pendientes.length === 3)
    let resuelto: { urls: string[]; errores: unknown[] } | null = null
    void c.esperarTodo().then(r => { resuelto = r })
    // termina en desorden: 3, 1, 2
    pendientes[2].ok('u3')
    await tick()
    expect(resuelto).toBeNull()
    pendientes[0].ok('u1')
    pendientes[1].ok('u2')
    await hasta(() => resuelto !== null)
    expect(resuelto!.urls).toEqual(['u1', 'u2', 'u3'])
    expect(resuelto!.errores).toEqual([])
  })

  it('esperarTodo devuelve los fallidos aparte (el formulario decide si bloquea)', async () => {
    const { c, pendientes } = cola()
    c.agregar([foto('ok.jpg'), foto('mal.jpg')])
    await hasta(() => pendientes.length === 2)
    pendientes[0].ok('u-ok')
    pendientes[1].falla(new Error('HTTP 500'))
    const r = await c.esperarTodo()
    expect(r.urls).toEqual(['u-ok'])
    expect(r.errores.map(e => e.file.name)).toEqual(['mal.jpg'])
  })

  it('notifica a los suscriptores en cada cambio y el snapshot cambia de referencia', async () => {
    const { c, pendientes } = cola()
    const fn = vi.fn()
    c.suscribir(fn)
    const antes = c.snapshot()
    c.agregar([foto()])
    expect(fn).toHaveBeenCalled()
    expect(c.snapshot()).not.toBe(antes)
    await hasta(() => pendientes.length === 1)
    const llamadas = fn.mock.calls.length
    pendientes[0].onProgreso({ cargado: 500, total: 1000 })
    expect(fn.mock.calls.length).toBeGreaterThan(llamadas)
  })
})

describe('helpers puros', () => {
  it('porcentajePonderado: solo cuenta subiendo (su %) y listo (100 %)', () => {
    const f = (size: number) => ({ size })
    expect(porcentajePonderado([])).toBe(0)
    expect(porcentajePonderado([
      { pct: 0, estado: 'preparando', file: f(100) },
      { pct: 50, estado: 'subiendo', file: f(100) },
      { pct: 100, estado: 'listo', file: f(100) },
      { pct: 80, estado: 'error', file: f(100) },
    ])).toBe(38) // (0 + 50 + 100 + 0) / 400
  })

  it('textoResumenCola', () => {
    expect(textoResumenCola({ total: 0, listos: 0, errores: 0, enCurso: 0, pct: 0 })).toBe('')
    expect(textoResumenCola({ total: 1, listos: 1, errores: 0, enCurso: 0, pct: 100 })).toBe('1 de 1 subido')
    expect(textoResumenCola({ total: 5, listos: 3, errores: 1, enCurso: 1, pct: 42 })).toBe('3 de 5 subidos · subiendo 1 (42 %) · 1 con error')
  })

  it('validarTamanoEvidencia usa los topes de media.ts', () => {
    expect(validarTamanoEvidencia({ size: MAX_VIDEO_SIZE_BYTES }, 'video')).toBeNull()
    expect(validarTamanoEvidencia({ size: MAX_VIDEO_SIZE_BYTES + 1 }, 'video')).toMatch(/video excede/)
    expect(validarTamanoEvidencia({ size: MAX_IMAGE_SIZE_BYTES + 1 }, 'imagen')).toMatch(/foto excede/)
    expect(validarTamanoEvidencia({ size: 10 }, 'imagen')).toBeNull()
  })
})
