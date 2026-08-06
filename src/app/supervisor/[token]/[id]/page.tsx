'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useParams } from 'next/navigation'
import { ESTADO_ESTILOS, ESTADO_LABELS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'
import type { ChecklistServicio } from '@/types/solicitud'

interface Solicitud {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  direccion: string | null
  ciudad_pueblo: string | null
  zona_servicio: string | null
  marca_equipo: string | null
  tipo_equipo: string | null
  tipo_solicitud: string | null
  novedades_equipo: string | null
  es_garantia: boolean | null
  ai_pre_diagnostico: string | null
  ai_repuesto_sugerido: string | null
  estado: string
  created_at: string
  numero_serie_factura: string | null
  pago_tecnico: number | null
  precio_cliente: number
  horario_visita_1: string | null
  horario_visita_2: string | null
  horario_confirmado: string | null
  siguiente_paso: string | null
  siguiente_paso_detalle: string | null
  cotizacion: Record<string, unknown> | null
  triaje_resultado: Record<string, unknown> | null
  diagnosticado_at: string | null
  fecha_visita_at: string | null
  repuesto_recibido_at: string | null
  guia_envio_url: string | null
  guia_envio_numero: string | null
  guia_envio_at: string | null
  guia_envio_por: string | null
  cancelado_at: string | null
  motivo_cancelacion: string | null
}

interface RepuestoSolicitado {
  sku: string
  descripcion: string
  cantidad?: number
}

interface Tecnico {
  nombre_completo: string
  whatsapp: string | null
  ciudad_pueblo: string | null
}

interface Evento {
  tipo: string | null
  estado_previo: string | null
  estado_nuevo: string | null
  actor: string | null
  motivo: string | null
  ocurrido_at: string | null
}

interface Evidencia {
  id: string
  fotos: string[]
  checklist: ChecklistServicio
  firma_url: string | null
  gps_lat: number | null
  gps_lng: number | null
  completado_at: string
  confirmado: boolean | null
  confirmado_at: string | null
  cliente_comentario: string | null
  oath_firma: string | null
  oath_firmado_at: string | null
}

function fechaHora(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm text-slate-800 mt-0.5">{children}</p>
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-sm font-bold text-slate-900 mb-4">{titulo}</h2>
      {children}
    </div>
  )
}

export default function SupervisorDetalle() {
  const params = useParams<{ token: string; id: string }>()
  const { token, id } = params

  const [sol, setSol] = useState<Solicitud | null>(null)
  const [tecnico, setTecnico] = useState<Tecnico | null>(null)
  const [eventos, setEventos] = useState<Evento[]>([])
  const [evidencia, setEvidencia] = useState<Evidencia | null>(null)
  // nombre de archivo en storage → fecha de subida (la imprime el PDF).
  const [archivosAt, setArchivosAt] = useState<Record<string, string>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generandoPdf, setGenerandoPdf] = useState(false)

  // Ficha completa en PDF (jsPDF con dynamic import, igual que en el listado).
  // Es async porque descarga y reescala las fotos/firmas antes de armar el PDF.
  const descargarPdf = async () => {
    if (!sol || generandoPdf) return
    setGenerandoPdf(true)
    try {
      const { generarPdfDetalleSolicitud } = await import('@/lib/pdf/supervisorPdf')
      await generarPdfDetalleSolicitud(sol, tecnico, eventos, evidencia, archivosAt)
    } catch {
      alert('No se pudo generar el PDF. Intenta de nuevo.')
    }
    setGenerandoPdf(false)
  }

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      try {
        const res = await fetch(
          `/api/supervisor/solicitud?token=${encodeURIComponent(token)}&id=${encodeURIComponent(id)}`,
        )
        if (!res.ok) {
          setError(
            res.status === 403
              ? 'Esta solicitud está fuera de tu alcance.'
              : res.status === 401
                ? 'Tu acceso no es válido.'
                : 'No se pudo cargar la solicitud.',
          )
          setCargando(false)
          return
        }
        const data = await res.json()
        setSol(data.solicitud)
        setTecnico(data.tecnico)
        setEventos(data.eventos ?? [])
        setEvidencia(data.evidencia ?? null)
        setArchivosAt(data.archivos_at ?? {})
      } catch {
        setError('No se pudo cargar la solicitud.')
      }
      setCargando(false)
    }
    cargar()
  }, [token, id])

  if (cargando) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
      </div>
    )
  }

  if (error || !sol) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <h1 className="text-lg font-bold text-slate-900">{error ?? 'No encontrada'}</h1>
        <Link
          href={`/supervisor/${token}`}
          className="inline-block mt-4 text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          ← Volver a la lista
        </Link>
      </div>
    )
  }

  const cotizacionTotal =
    sol.cotizacion && typeof sol.cotizacion.total === 'number' ? (sol.cotizacion.total as number) : null

  return (
    <div>
      {/* Volver + estado */}
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <Link
          href={`/supervisor/${token}`}
          className="text-sm font-semibold text-blue-600 hover:text-blue-800"
        >
          ← Volver
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={descargarPdf}
            disabled={generandoPdf}
            className="text-xs font-semibold text-slate-700 border border-slate-200 bg-slate-50 rounded-lg px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generandoPdf ? 'Generando…' : '⬇️ Descargar PDF'}
          </button>
          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${ESTADO_ESTILOS[sol.estado] ?? 'bg-gray-100 text-gray-600'}`}>
            {ESTADO_LABELS[sol.estado] ?? sol.estado}
          </span>
        </div>
      </div>

      <h1 className="text-2xl font-bold text-slate-900 mb-1">
        {sol.tipo_equipo ?? 'Equipo'} {sol.marca_equipo ?? ''}
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        {sol.es_garantia ? '🛡️ Garantía' : '🧾 Particular'}
        {sol.numero_serie_factura ? ` · N° ${sol.numero_serie_factura}` : ''}
        {' · Creada '}
        {fechaHora(sol.created_at)}
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Seccion titulo="Cliente">
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Nombre">{sol.cliente_nombre}</Campo>
            <Campo label="Teléfono">{sol.cliente_telefono}</Campo>
            <Campo label="Ciudad">{sol.ciudad_pueblo ?? '—'}</Campo>
            <Campo label="Zona">{sol.zona_servicio ?? '—'}</Campo>
            <div className="col-span-2">
              <Campo label="Dirección">{sol.direccion ?? '—'}</Campo>
            </div>
          </div>
        </Seccion>

        <Seccion titulo="Equipo y servicio">
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Tipo de equipo">{sol.tipo_equipo ?? '—'}</Campo>
            <Campo label="Marca">{sol.marca_equipo ?? '—'}</Campo>
            <Campo label="Tipo de solicitud">{sol.tipo_solicitud ?? '—'}</Campo>
            <Campo label="Flujo">{sol.es_garantia ? 'Garantía' : 'Particular'}</Campo>
            <div className="col-span-2">
              <Campo label="Novedad reportada">{sol.novedades_equipo ?? '—'}</Campo>
            </div>
            {sol.ai_pre_diagnostico && (
              <div className="col-span-2">
                <Campo label="Pre-diagnóstico">{sol.ai_pre_diagnostico}</Campo>
              </div>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Agenda y valores">
          <div className="grid grid-cols-2 gap-4">
            <Campo label="Horario confirmado">{sol.horario_confirmado ?? '—'}</Campo>
            <Campo label="Fecha de visita">{fechaHora(sol.fecha_visita_at)}</Campo>
            <Campo label="Opción 1">{sol.horario_visita_1 ?? '—'}</Campo>
            <Campo label="Opción 2">{sol.horario_visita_2 ?? '—'}</Campo>
            {sol.es_garantia ? (
              <Campo label="Pago técnico">
                {sol.pago_tecnico ? `$${formatCOP(sol.pago_tecnico)}` : '—'}
              </Campo>
            ) : (
              <Campo label="Valor al cliente">
                {sol.precio_cliente ? `$${formatCOP(sol.precio_cliente)}` : '—'}
              </Campo>
            )}
            {cotizacionTotal !== null && (
              <Campo label="Total cotización">${formatCOP(cotizacionTotal)}</Campo>
            )}
          </div>
        </Seccion>

        <Seccion titulo="Técnico asignado">
          {tecnico ? (
            <div className="grid grid-cols-2 gap-4">
              <Campo label="Nombre">{tecnico.nombre_completo}</Campo>
              <Campo label="WhatsApp">{tecnico.whatsapp ?? '—'}</Campo>
              <Campo label="Ciudad">{tecnico.ciudad_pueblo ?? '—'}</Campo>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sin técnico asignado todavía.</p>
          )}
        </Seccion>
      </div>

      {/* Diagnóstico del técnico: código de falla reportado + texto del
          diagnóstico. Mismo dato que ve el admin (triaje_resultado). */}
      {(() => {
        const triaje = sol.triaje_resultado
        if (!triaje?.codigo_falla && !triaje?.diagnostico_tecnico) return null
        return (
          <div className="mt-4">
            <Seccion titulo="🔧 Diagnóstico del técnico">
              {!!triaje.codigo_falla && (
                <div className="flex items-center gap-4 mb-4 bg-purple-50 rounded-xl p-4 border border-purple-100">
                  <div className="w-14 h-14 rounded-xl bg-purple-600 text-white flex flex-col items-center justify-center shrink-0">
                    <span className="text-[8px] uppercase font-semibold opacity-80">Falla</span>
                    <span className="text-lg font-extrabold leading-none">{String(triaje.codigo_falla)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{String(triaje.descripcion_falla ?? '')}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {!!triaje.familia_falla && (
                        <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{String(triaje.familia_falla)}</span>
                      )}
                      {!!triaje.sistema_falla && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{String(triaje.sistema_falla)}</span>
                      )}
                      {!!triaje.componente_falla && (
                        <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">{String(triaje.componente_falla)}</span>
                      )}
                      {!!triaje.complejidad_falla && (
                        <span className="text-[10px] bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-medium">{String(triaje.complejidad_falla)}</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {!!triaje.diagnostico_tecnico && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Diagnóstico</p>
                  <p className="text-sm text-slate-800 mt-0.5 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{String(triaje.diagnostico_tecnico)}</p>
                </div>
              )}
            </Seccion>
          </div>
        )
      })()}

      {/* Repuesto requerido + guía de envío. La subida de la guía es la ÚNICA
          acción de escritura del portal (2026-08-02): dispara la transición
          esperando_repuesto → repuesto_en_camino y avisa a cliente y técnico
          para agendar la visita de finalización. */}
      <GuiaEnvioSeccion sol={sol} token={token} />

      {/* Galería completa — fotos de diagnóstico (triaje/cotización) +
          fotos de completación + firmas, igual que en el detalle admin. */}
      {(() => {
        const diagFotosTriaje = (sol.triaje_resultado?.evidencias_diagnostico as string[] | undefined) ?? []
        const diagFotosCot = (sol.cotizacion?.evidencias_diagnostico as string[] | undefined) ?? []
        const diagFotos = Array.from(new Set([...diagFotosTriaje, ...diagFotosCot]))
        const compFotos = evidencia?.fotos ?? []
        const total = diagFotos.length + compFotos.length + (evidencia?.oath_firma ? 1 : 0) + (evidencia?.firma_url ? 1 : 0)
        if (total === 0) return null

        return (
          <div className="mt-4">
            <Seccion titulo={`Galería del servicio (${total})`}>
              {diagFotos.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1.5">
                    <span>🔍 Diagnóstico</span>
                    <span className="text-gray-400 font-normal">({diagFotos.length})</span>
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {diagFotos.map((url, i) => (
                      <a key={`diag-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-purple-400 transition-all">
                        <Image src={url} alt={`Diagnóstico ${i + 1}`} fill className="object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {compFotos.length > 0 && (
                <div className="mb-5">
                  <h3 className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1.5">
                    <span>✅ Completación</span>
                    <span className="text-gray-400 font-normal">({compFotos.length})</span>
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                    {compFotos.map((url, i) => (
                      <a key={`comp-${i}`} href={url} target="_blank" rel="noopener noreferrer" className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 hover:ring-2 hover:ring-green-400 transition-all">
                        <Image src={url} alt={`Completación ${i + 1}`} fill className="object-cover" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {(evidencia?.oath_firma || evidencia?.firma_url) && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 mb-2">Firmas</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {evidencia?.oath_firma && (
                      <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                        <p className="text-[10px] text-purple-700 font-semibold uppercase tracking-wide mb-1">Oath técnico</p>
                        <div className="relative h-20 bg-white rounded">
                          <Image src={evidencia.oath_firma} alt="Oath técnico" fill className="object-contain" />
                        </div>
                        {evidencia.oath_firmado_at && (
                          <p className="text-[10px] text-gray-400 mt-1">{fechaHora(evidencia.oath_firmado_at)}</p>
                        )}
                      </div>
                    )}
                    {evidencia?.firma_url && (
                      <div className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                        <p className="text-[10px] text-green-700 font-semibold uppercase tracking-wide mb-1">Firma cliente</p>
                        <div className="relative h-20 bg-white rounded">
                          <Image src={evidencia.firma_url} alt="Firma cliente" fill className="object-contain" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </Seccion>
          </div>
        )
      })()}

      {/* Evidencia del servicio completado (checklist + confirmación del cliente) */}
      {evidencia && (
        <div className="mt-4">
          <Seccion titulo="Evidencia del servicio">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div>
                <h3 className="text-xs font-semibold text-gray-500 mb-2">Checklist</h3>
                <div className="space-y-1.5">
                  {([
                    { key: 'diagnostico_realizado', label: 'Diagnóstico realizado' },
                    { key: 'pieza_reemplazada', label: 'Pieza reemplazada' },
                    { key: 'prueba_encendido', label: 'Prueba de encendido' },
                    { key: 'prueba_ciclo_completo', label: 'Prueba de ciclo completo' },
                    { key: 'limpieza_area', label: 'Limpieza del área' },
                    { key: 'explicacion_cliente', label: 'Explicación al cliente' },
                  ] as const).map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span>{evidencia.checklist[key] ? '✅' : '⬜'}</span>
                      <span className={evidencia.checklist[key] ? 'text-gray-700' : 'text-gray-400'}>{label}</span>
                    </div>
                  ))}
                  {evidencia.checklist.pieza_detalle && (
                    <p className="text-xs text-gray-500 ml-6">Pieza: {evidencia.checklist.pieza_detalle}</p>
                  )}
                  {evidencia.checklist.notas_tecnico && (
                    <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded-lg p-2">
                      <span className="font-semibold">Notas:</span> {evidencia.checklist.notas_tecnico}
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="text-xs text-gray-400 space-y-1">
                  <p>Completado: {fechaHora(evidencia.completado_at)}</p>
                  {evidencia.gps_lat && evidencia.gps_lng && (
                    <p>GPS: {evidencia.gps_lat.toFixed(5)}, {evidencia.gps_lng.toFixed(5)}</p>
                  )}
                </div>

                <div className={`rounded-lg p-3 ${
                  evidencia.confirmado === true ? 'bg-green-50 border border-green-200' :
                  evidencia.confirmado === false ? 'bg-orange-50 border border-orange-200' :
                  'bg-yellow-50 border border-yellow-200'
                }`}>
                  <p className={`text-sm font-semibold ${
                    evidencia.confirmado === true ? 'text-green-800' :
                    evidencia.confirmado === false ? 'text-orange-800' :
                    'text-yellow-800'
                  }`}>
                    {evidencia.confirmado === true ? '✅ Cliente confirmó satisfacción' :
                     evidencia.confirmado === false ? '⚠️ Cliente reportó un problema' :
                     '⏳ Esperando confirmación del cliente'}
                  </p>
                  {evidencia.confirmado_at && (
                    <p className="text-xs text-gray-500 mt-1">{fechaHora(evidencia.confirmado_at)}</p>
                  )}
                  {evidencia.cliente_comentario && (
                    <p className="text-xs mt-2 bg-white rounded p-2 text-gray-700">{evidencia.cliente_comentario}</p>
                  )}
                </div>
              </div>
            </div>
          </Seccion>
        </div>
      )}

      {sol.cancelado_at && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-800">Cancelada · {fechaHora(sol.cancelado_at)}</p>
          {sol.motivo_cancelacion && <p className="text-sm text-red-700 mt-1">{sol.motivo_cancelacion}</p>}
        </div>
      )}

      {/* Línea de tiempo */}
      <div className="mt-4">
        <Seccion titulo="Historial">
          {eventos.length === 0 ? (
            <p className="text-sm text-gray-400">Sin eventos registrados.</p>
          ) : (
            <ol className="space-y-3">
              {eventos.map((e, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="text-gray-300 mt-0.5">•</span>
                  <div>
                    <p className="text-slate-800">
                      {e.estado_previo && e.estado_nuevo ? (
                        <>
                          <span className="text-gray-500">{ESTADO_LABELS[e.estado_previo] ?? e.estado_previo}</span>
                          {' → '}
                          <span className="font-medium">{ESTADO_LABELS[e.estado_nuevo] ?? e.estado_nuevo}</span>
                        </>
                      ) : (
                        <span className="font-medium">{e.tipo ?? 'evento'}</span>
                      )}
                    </p>
                    {e.motivo && <p className="text-xs text-gray-500 mt-0.5">{e.motivo}</p>}
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      {fechaHora(e.ocurrido_at)}
                      {e.actor ? ` · ${e.actor}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Seccion>
      </div>
    </div>
  )
}

/**
 * Repuesto requerido + guía de envío.
 *
 * - Muestra el requerimiento exacto (SKU, descripción, cantidad) desde
 *   triaje_resultado/cotizacion.productos_necesarios.
 * - Si el estado es `esperando_repuesto`, habilita subir la guía de envío
 *   (foto o PDF + número opcional) → POST /api/supervisor/guia-envio. El
 *   servidor valida token + alcance, transiciona a `repuesto_en_camino` y
 *   notifica a cliente (agendar visita de finalización) y técnico.
 * - Si la guía ya fue subida, muestra número, fecha, quién y link al archivo.
 */
function GuiaEnvioSeccion({ sol, token }: { sol: Solicitud; token: string }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [numeroGuia, setNumeroGuia] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const repuestos: RepuestoSolicitado[] = (() => {
    const deTriaje = (sol.triaje_resultado?.productos_necesarios as RepuestoSolicitado[] | undefined) ?? []
    const deCotizacion = (sol.cotizacion?.productos_necesarios as RepuestoSolicitado[] | undefined) ?? []
    const lista = deTriaje.length > 0 ? deTriaje : deCotizacion
    return lista.filter(p => p && p.sku)
  })()

  const puedeSubir = sol.estado === 'esperando_repuesto'
  const guiaSubida = !!sol.guia_envio_url || !!sol.guia_envio_at

  if (!puedeSubir && !guiaSubida && repuestos.length === 0) return null

  const subir = async () => {
    if (!archivo || enviando) return
    setEnviando(true)
    setMsg(null)
    try {
      const form = new FormData()
      form.append('token', token)
      form.append('id', sol.id)
      form.append('archivo', archivo)
      if (numeroGuia.trim()) form.append('numeroGuia', numeroGuia.trim())
      const res = await fetch('/api/supervisor/guia-envio', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setMsg({ tipo: 'error', texto: data.error ?? 'No se pudo subir la guía.' })
        setEnviando(false)
        return
      }
      setMsg({
        tipo: 'ok',
        texto: `Guía subida. Cliente ${data.cliente_notificado ? 'notificado para agendar la visita de finalización' : 'NO notificado (revisar en admin)'} · técnico ${data.tecnico_notificado ? 'notificado' : 'NO notificado'}.`,
      })
      // Refrescar el detalle para reflejar el nuevo estado (repuesto_en_camino).
      setTimeout(() => window.location.reload(), 2500)
    } catch {
      setMsg({ tipo: 'error', texto: 'Error de conexión. Intenta de nuevo.' })
      setEnviando(false)
    }
  }

  return (
    <div className="mt-4">
      <Seccion titulo="📦 Repuesto y guía de envío">
        {repuestos.length > 0 && (
          <div className="mb-4">
            <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
              Repuesto(s) requerido(s)
            </p>
            <div className="space-y-1.5">
              {repuestos.map((p, i) => (
                <div key={i} className="flex items-center gap-2 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  <span className="font-mono text-xs font-bold text-slate-800">{p.sku}</span>
                  <span className="text-gray-600 flex-1 truncate">{p.descripcion}</span>
                  <span className="text-xs text-gray-500 shrink-0">x{p.cantidad ?? 1}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {guiaSubida && (
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-3 mb-2">
            <p className="text-sm font-semibold text-sky-900">🚚 Guía de envío subida</p>
            <p className="text-xs text-sky-800 mt-1">
              {sol.guia_envio_numero ? `N° ${sol.guia_envio_numero} · ` : ''}
              {fechaHora(sol.guia_envio_at)}
              {sol.guia_envio_por ? ` · por ${sol.guia_envio_por}` : ''}
            </p>
            {sol.guia_envio_url && (
              <a
                href={sol.guia_envio_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-2 text-xs font-semibold text-sky-700 underline hover:text-sky-900"
              >
                Ver guía adjunta
              </a>
            )}
          </div>
        )}

        {puedeSubir && (
          <div className="border-2 border-dashed border-sky-300 bg-sky-50/50 rounded-xl p-4">
            <p className="text-sm font-semibold text-slate-900 mb-1">Subir guía de envío del repuesto</p>
            <p className="text-xs text-gray-500 mb-3">
              Al subirla se notifica al cliente (para agendar la visita de finalización) y al
              técnico de que el producto va en camino.
            </p>
            <input
              type="file"
              accept="image/*,application/pdf"
              onChange={e => setArchivo(e.target.files?.[0] ?? null)}
              className="block w-full text-xs text-gray-600 mb-2 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-sky-700"
            />
            <input
              type="text"
              value={numeroGuia}
              onChange={e => setNumeroGuia(e.target.value)}
              placeholder="N° de guía / transportadora (opcional)"
              maxLength={120}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
            {msg && (
              <p
                className={`text-xs rounded-lg px-3 py-2 mb-3 ${
                  msg.tipo === 'ok'
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-700'
                }`}
              >
                {msg.texto}
              </p>
            )}
            <button
              onClick={subir}
              disabled={!archivo || enviando}
              className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-gray-300"
            >
              {enviando ? 'Subiendo…' : '🚚 Subir guía y notificar'}
            </button>
          </div>
        )}
      </Seccion>
    </div>
  )
}
