/**
 * Cola de subida en segundo plano para la evidencia del técnico (2026-10-29).
 *
 * Por qué existe: hasta hoy los formularios de Diagnóstico y Completar
 * comprimían y subían TODOS los archivos recién al tocar "Registrar" /
 * "Completar", así que el técnico llenaba el formulario, lo enviaba y recién
 * ahí esperaba 1–3 minutos mirando una barra (con 20 fotos + un video de 30 MB
 * en 4G es fácil pasar de los 2 minutos). Con la cola, cada archivo empieza a
 * comprimirse y subirse APENAS el técnico lo elige: mientras escribe el
 * diagnóstico, marca el checklist o firma, la evidencia ya viaja. Al enviar,
 * normalmente no queda nada por subir (o queda solo el último video).
 *
 * Qué hace:
 * - `agregar(files)`: encola; genera la vista previa (miniatura 320 px o
 *   'video') sin bloquear, y arranca la subida respetando `concurrencia`
 *   (3 por defecto, igual que `ejecutarConLimite`).
 * - Cada archivo pasa por preparando (compresión con tope de tiempo) →
 *   subiendo (XHR o TUS reanudable con progreso, corte por inactividad y
 *   reintentos, ver `subida-evidencia.ts`) → listo | error.
 * - Tres carriles independientes: **miniaturas de a 1**, **compresión de a 1**
 *   y **subidas de a 3**. Decodificar 10–20 fotos de galería a la vez (aunque
 *   sea para una miniatura) es lo que congelaba los Android: la CPU y la
 *   memoria de un celular se saturan con 2–3 decodificaciones simultáneas,
 *   mientras que la red aguanta varias subidas en paralelo. La compresión
 *   sigue adelantándose mientras las subidas usan la red.
 * - `quitar(id)`: lo saca de la cola. Si ya estaba subido queda huérfano en
 *   Storage (el bucket no tiene policy DELETE para el navegador); es barato y
 *   se limpia aparte. Si estaba en vuelo, la subida termina sola y se ignora.
 * - `reintentar(id)`: vuelve a encolar uno con error.
 * - `esperarTodo()`: promesa que resuelve cuando no queda nada en curso, con
 *   las URLs en el orden en que el técnico eligió los archivos y la lista de
 *   los que fallaron (el formulario decide si bloquea el envío).
 *
 * Sin React ni DOM: la clase es pura y las dependencias (preparar, subir,
 * miniatura) se inyectan, así `src/__tests__/utils/cola-subida.test.ts` la
 * cubre sin navegador. El hook `useColaSubida` la conecta a los formularios.
 */

import { comprimirConLimite, subirArchivoStorage, type ProgresoBytes } from '@/lib/utils/subida-evidencia'
import {
  crearMiniatura,
  tipoArchivoEvidencia,
  MAX_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_MB,
  MAX_VIDEO_SIZE_BYTES,
  MAX_VIDEO_SIZE_MB,
  type TipoArchivoEvidencia,
} from '@/lib/utils/media'

export type EstadoArchivoSubida = 'en_cola' | 'preparando' | 'subiendo' | 'listo' | 'error'

export interface ArchivoSubida {
  id: string
  /** Archivo original tal como lo eligió el técnico. */
  file: File
  tipo: TipoArchivoEvidencia
  /** Object URL de la miniatura, 'video' para videos, null mientras se genera. */
  preview: string | null
  estado: EstadoArchivoSubida
  /** 0–100 de la subida (la compresión cuenta como 0). */
  pct: number
  url: string | null
  path: string | null
  error: string | null
  intentos: number
  /** Archivo ya comprimido, a la espera de un cupo de subida (interno). */
  preparado?: File | null
}

export interface ResumenCola {
  total: number
  listos: number
  errores: number
  /** en_cola + preparando + subiendo */
  enCurso: number
  /** % global ponderado por tamaño (0–100). */
  pct: number
}

export interface OpcionesCola {
  bucket: string
  /**
   * Ruta destino dentro del bucket para un archivo YA preparado (comprimido).
   * `n` es un consecutivo único por cola y `lote` un sufijo aleatorio por
   * instancia (timestamp + random), para no colisionar nombres entre envíos.
   */
  ruta: (file: File, n: number, lote: string) => string
  concurrencia?: number
  /** Default: `comprimirConLimite` (solo actúa sobre imágenes). */
  preparar?: (file: File) => Promise<File>
  /** Default: `subirArchivoStorage`. */
  subir?: (
    bucket: string,
    path: string,
    file: File,
    onProgreso: (p: ProgresoBytes) => void,
  ) => Promise<{ publicUrl: string }>
  /** Default: `crearMiniatura` para imágenes; los videos usan 'video'. */
  miniatura?: (file: File) => Promise<string>
  /**
   * Validación tras preparar. Default: tope de video / foto de `media.ts`.
   * Devuelve el mensaje de error o null si pasa.
   */
  validar?: (filePreparado: File, tipo: TipoArchivoEvidencia) => string | null
}

export const COLA_CONCURRENCIA = 3

/** Validación por defecto: mismo tope que aplicaban los formularios tras comprimir. */
export function validarTamanoEvidencia(file: { size: number }, tipo: TipoArchivoEvidencia): string | null {
  if (tipo === 'video' && file.size > MAX_VIDEO_SIZE_BYTES) return `El video excede ${MAX_VIDEO_SIZE_MB} MB`
  if (tipo === 'imagen' && file.size > MAX_IMAGE_SIZE_BYTES) return `La foto excede ${MAX_IMAGE_SIZE_MB} MB tras comprimir`
  return null
}

/** % global ponderado por bytes: un video de 30 MB pesa más que una foto de 1 MB. */
export function porcentajePonderado(items: Array<{ pct: number; estado: EstadoArchivoSubida; file: { size: number } }>): number {
  let total = 0
  let hecho = 0
  for (const it of items) {
    const peso = Math.max(1, it.file.size)
    total += peso
    hecho += peso * (it.estado === 'listo' ? 100 : it.estado === 'subiendo' ? it.pct : 0) / 100
  }
  if (total <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((hecho / total) * 100)))
}

/** Resumen puro a partir de la lista (lo usa el hook con el snapshot). */
export function resumenDe(items: ArchivoSubida[]): ResumenCola {
  const total = items.length
  const listos = items.filter(i => i.estado === 'listo').length
  const errores = items.filter(i => i.estado === 'error').length
  return { total, listos, errores, enCurso: total - listos - errores, pct: porcentajePonderado(items) }
}

/** Texto corto para el pie de la galería: "3 de 5 subidos · subiendo 1 (42 %) · 1 con error". */
export function textoResumenCola(r: ResumenCola): string {
  if (r.total === 0) return ''
  const partes = [`${r.listos} de ${r.total} subido${r.total === 1 ? '' : 's'}`]
  if (r.enCurso > 0) partes.push(`subiendo ${r.enCurso} (${r.pct} %)`)
  if (r.errores > 0) partes.push(`${r.errores} con error`)
  return partes.join(' · ')
}

let contadorIds = 0
const nuevoId = () => `arch_${Date.now().toString(36)}_${(contadorIds++).toString(36)}_${Math.random().toString(36).slice(2, 6)}`

export class ColaSubida {
  private items: ArchivoSubida[] = []
  private enVuelo = 0
  private preparando = false
  private cadenaMiniaturas: Promise<void> = Promise.resolve()
  private consecutivo = 0
  /** Sufijo único de esta cola para los nombres en Storage. */
  readonly lote = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  private readonly listeners = new Set<() => void>()
  private esperas: Array<() => void> = []

  constructor(private readonly opts: OpcionesCola) {}

  // ── Suscripción (useSyncExternalStore) ────────────────────────────────
  suscribir(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Array inmutable: cambia de referencia en cada mutación. */
  snapshot(): ArchivoSubida[] {
    return this.items
  }

  resumen(): ResumenCola {
    return resumenDe(this.items)
  }

  // ── Mutaciones ────────────────────────────────────────────────────────
  /**
   * Encola los archivos (los que no son evidencia — PDF, audio — se ignoran) y
   * arranca la subida. Devuelve los ítems creados. La miniatura se genera
   * aparte, sin bloquear el retorno.
   */
  agregar(files: File[]): ArchivoSubida[] {
    const nuevos: ArchivoSubida[] = []
    for (const file of files) {
      const tipo = tipoArchivoEvidencia(file)
      if (!tipo) continue
      nuevos.push({
        id: nuevoId(),
        file,
        tipo,
        preview: tipo === 'video' ? 'video' : null,
        estado: 'en_cola',
        pct: 0,
        url: null,
        path: null,
        error: null,
        intentos: 0,
      })
    }
    if (nuevos.length === 0) return []
    this.items = [...this.items, ...nuevos]
    this.emitir()
    // Miniaturas en serie (un decode a la vez), sin bloquear el retorno.
    for (const it of nuevos) {
      if (it.tipo === 'imagen') {
        this.cadenaMiniaturas = this.cadenaMiniaturas.then(() => this.generarMiniatura(it.id, it.file))
      }
    }
    this.programar()
    return nuevos
  }

  quitar(id: string): void {
    const it = this.items.find(i => i.id === id)
    if (!it) return
    if (it.preview && it.preview !== 'video') {
      try { URL.revokeObjectURL(it.preview) } catch { /* jsdom / ya revocada */ }
    }
    this.items = this.items.filter(i => i.id !== id)
    this.emitir()
    this.revisarEsperas()
  }

  reintentar(id: string): void {
    const it = this.items.find(i => i.id === id)
    if (!it || it.estado !== 'error') return
    // Si ya estaba comprimido se reusa; si falló al preparar, se vuelve a intentar.
    this.actualizar(id, { estado: 'en_cola', error: null, pct: 0 })
    this.programar()
  }

  /** Quita todos (para "limpiar" en el formulario). */
  vaciar(): void {
    for (const it of this.items) {
      if (it.preview && it.preview !== 'video') {
        try { URL.revokeObjectURL(it.preview) } catch { /* noop */ }
      }
    }
    this.items = []
    this.emitir()
    this.revisarEsperas()
  }

  /**
   * Resuelve cuando no queda nada en curso. `urls` conserva el orden en que
   * se eligieron los archivos (solo los que quedaron listos).
   */
  esperarTodo(): Promise<{ urls: string[]; errores: ArchivoSubida[] }> {
    return new Promise(resolve => {
      const revisar = () => {
        if (this.resumen().enCurso > 0) return false
        resolve({
          urls: this.items.filter(i => i.estado === 'listo' && i.url).map(i => i.url as string),
          errores: this.items.filter(i => i.estado === 'error'),
        })
        return true
      }
      if (revisar()) return
      this.esperas.push(() => { revisar() })
    })
  }

  // ── Interno ───────────────────────────────────────────────────────────
  private emitir(): void {
    for (const fn of this.listeners) fn()
  }

  private actualizar(id: string, cambios: Partial<ArchivoSubida>): void {
    let tocado = false
    this.items = this.items.map(i => {
      if (i.id !== id) return i
      tocado = true
      return { ...i, ...cambios }
    })
    if (tocado) this.emitir()
  }

  private revisarEsperas(): void {
    if (this.esperas.length === 0 || this.resumen().enCurso > 0) return
    const pendientes = this.esperas
    this.esperas = []
    for (const fn of pendientes) fn()
  }

  private async generarMiniatura(id: string, file: File): Promise<void> {
    try {
      const mini = await (this.opts.miniatura ?? crearMiniatura)(file)
      // Si lo quitaron mientras se generaba, liberar la URL.
      if (!this.items.some(i => i.id === id)) {
        try { URL.revokeObjectURL(mini) } catch { /* noop */ }
        return
      }
      this.actualizar(id, { preview: mini })
    } catch {
      /* sin miniatura: el tile muestra el ícono genérico */
    }
  }

  /** Arranca lo que quepa en los dos carriles (compresión de a 1, subida de a N). */
  private programar(): void {
    this.programarPreparacion()
    this.programarSubida()
  }

  private programarPreparacion(): void {
    if (this.preparando) return
    const siguiente = this.items.find(i => i.estado === 'en_cola' && !i.preparado)
    if (!siguiente) return
    this.preparando = true
    this.actualizar(siguiente.id, { estado: 'preparando' })
    void this.preparar(siguiente.id).finally(() => {
      this.preparando = false
      this.programar()
      this.revisarEsperas()
    })
  }

  private programarSubida(): void {
    const limite = Math.max(1, this.opts.concurrencia ?? COLA_CONCURRENCIA)
    while (this.enVuelo < limite) {
      const siguiente = this.items.find(i => i.estado === 'en_cola' && i.preparado)
      if (!siguiente) break
      this.enVuelo++
      void this.subir(siguiente.id).finally(() => {
        this.enVuelo--
        this.programar()
        this.revisarEsperas()
      })
    }
  }

  private vivo(id: string): ArchivoSubida | undefined {
    return this.items.find(i => i.id === id)
  }

  /** Carril de compresión: deja el archivo listo en `preparado` (o en error). */
  private async preparar(id: string): Promise<void> {
    const it = this.vivo(id)
    if (!it) return
    try {
      const preparado = await (this.opts.preparar ?? comprimirConLimite)(it.file)
      if (!this.vivo(id)) return
      const motivo = (this.opts.validar ?? validarTamanoEvidencia)(preparado, it.tipo)
      if (motivo) {
        this.actualizar(id, { estado: 'error', error: motivo, pct: 0, preparado: null })
        return
      }
      this.actualizar(id, { estado: 'en_cola', preparado })
    } catch (e) {
      if (!this.vivo(id)) return
      const mensaje = e instanceof Error ? e.message : 'No se pudo preparar el archivo.'
      console.error('[ColaSubida] preparar falló:', mensaje)
      this.actualizar(id, { estado: 'error', error: mensaje, preparado: null })
    }
  }

  /** Carril de subida: toma `preparado` y lo manda a Storage. */
  private async subir(id: string): Promise<void> {
    const it = this.vivo(id)
    if (!it || !it.preparado) return
    const preparado = it.preparado
    try {
      const n = this.consecutivo++
      const path = this.opts.ruta(preparado, n, this.lote)
      this.actualizar(id, { estado: 'subiendo', path, pct: 0, intentos: it.intentos + 1 })
      const subir = this.opts.subir
        ?? ((b, p, f, onProgreso) => subirArchivoStorage(b, p, f, { onProgreso }))
      const { publicUrl } = await subir(this.opts.bucket, path, preparado, p => {
        if (!this.vivo(id)) return
        const pct = p.total > 0 ? Math.round((p.cargado / p.total) * 100) : 0
        this.actualizar(id, { pct: Math.max(0, Math.min(99, pct)) })
      })
      if (!this.vivo(id)) return
      this.actualizar(id, { estado: 'listo', url: publicUrl, pct: 100, error: null, preparado: null })
    } catch (e) {
      if (!this.vivo(id)) return
      const mensaje = e instanceof Error ? e.message : 'No se pudo subir el archivo.'
      console.error('[ColaSubida] archivo falló:', mensaje)
      // Se conserva `preparado` para que reintentar no vuelva a comprimir.
      this.actualizar(id, { estado: 'error', error: mensaje })
    }
  }
}
