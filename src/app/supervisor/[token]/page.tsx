'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ESTADO_ESTILOS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'
import { PAGO_MINIMO_TECNICO_GARANTIA } from '@/lib/constants/tarifas/mabe'

interface Solicitud {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  ciudad_pueblo: string
  zona_servicio: string
  tipo_equipo: string
  marca_equipo: string
  estado: string
  pago_tecnico: number
  precio_cliente: number
  es_garantia: boolean
  created_at: string
  tecnico_nombre: string | null
  /** Diagnóstico del técnico, aplanado desde triaje_resultado por la API. */
  codigo_falla: string | null
  descripcion_falla: string | null
  complejidad_falla: string | null
}

interface SupervisorInfo {
  nombre: string
  ambito: 'todos' | 'garantia' | 'particular'
  marca: string | null
}

/** Parte requerida + el caso al que pertenece (de /api/supervisor/repuestos). */
interface Repuesto {
  id: string
  sku: string
  descripcion: string
  costo: number
  tiempo_estimado: string | null
  estado: string
  solicitado_at: string
  solicitud: {
    id: string
    cliente_nombre: string | null
    tipo_equipo: string | null
    marca_equipo: string | null
    ciudad_pueblo: string | null
    estado: string
    es_garantia: boolean
  }
}

const REPUESTO_ESTILOS: Record<string, string> = {
  pendiente: 'bg-amber-100 text-amber-800',
  recibido: 'bg-emerald-100 text-emerald-800',
  cancelado: 'bg-gray-100 text-gray-500',
}

const AMBITO_LABEL: Record<string, string> = {
  todos: 'Garantía y particular',
  garantia: 'Solo garantía',
  particular: 'Solo particular',
}

// Guía pública de capacitación (servida desde /public, con noindex).
// Es compartible: no contiene tokens ni datos de servicios.
const GUIA_SUPERVISOR_URL = 'https://lineablanca.bairdservice.com/guia-supervisores.html'

// El chip "Repuestos" agrupa los tres estados del ciclo de repuesto: es el
// tramo donde el supervisor actúa (gestiona el repuesto ante la marca y sube
// la guía de envío en esperando_repuesto).
const ESTADOS_REPUESTO = ['esperando_repuesto', 'repuesto_en_camino', 'repuesto_recibido']

const FILTROS = [
  { value: 'todos', label: 'Todos' },
  { value: 'pendiente_horario', label: 'Pendiente horario' },
  { value: 'notificada', label: 'Notificada' },
  { value: 'asignada', label: 'Asignada' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'repuestos', label: '📦 Repuestos' },
  { value: 'completada', label: 'Completada' },
  { value: 'cancelada', label: 'Cancelada' },
]

export default function SupervisorSolicitudes() {
  const params = useParams<{ token: string }>()
  const token = params.token

  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [supervisor, setSupervisor] = useState<SupervisorInfo | null>(null)
  const [cargando, setCargando] = useState(true)
  const [errorAcceso, setErrorAcceso] = useState(false)
  const [filtro, setFiltro] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [generandoPdf, setGenerandoPdf] = useState(false)
  // Vista Repuestos: todas las partes requeridas del alcance, con su caso.
  // Se cargan perezosamente la primera vez que se abre la pestaña.
  const [vista, setVista] = useState<'servicios' | 'repuestos'>('servicios')
  const [repuestos, setRepuestos] = useState<Repuesto[] | null>(null)
  const [cargandoRepuestos, setCargandoRepuestos] = useState(false)
  const [filtroRepuesto, setFiltroRepuesto] = useState<'pendiente' | 'recibido' | 'todos'>('pendiente')

  const abrirRepuestos = async () => {
    setVista('repuestos')
    if (repuestos !== null || cargandoRepuestos) return
    setCargandoRepuestos(true)
    try {
      const res = await fetch(`/api/supervisor/repuestos?token=${encodeURIComponent(token)}`)
      if (res.ok) {
        const data = await res.json()
        setRepuestos(data.repuestos ?? [])
      } else {
        setRepuestos([])
      }
    } catch {
      setRepuestos([])
    }
    setCargandoRepuestos(false)
  }

  // Descarga TODO el alcance (ignora filtro/búsqueda de la UI). jsPDF se carga
  // con dynamic import para no engordar el bundle inicial del portal.
  const descargarPdf = async () => {
    if (!supervisor || solicitudes.length === 0 || generandoPdf) return
    setGenerandoPdf(true)
    try {
      const { generarPdfListadoSupervisor } = await import('@/lib/pdf/supervisorPdf')
      generarPdfListadoSupervisor(supervisor, solicitudes)
    } catch {
      alert('No se pudo generar el PDF. Intenta de nuevo.')
    }
    setGenerandoPdf(false)
  }

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)
      try {
        const res = await fetch(`/api/supervisor/solicitudes?token=${encodeURIComponent(token)}`)
        if (!res.ok) {
          setErrorAcceso(true)
          setCargando(false)
          return
        }
        const data = await res.json()
        setSupervisor(data.supervisor)
        setSolicitudes(data.solicitudes ?? [])
      } catch {
        setErrorAcceso(true)
      }
      setCargando(false)
    }
    cargar()
  }, [token])

  if (errorAcceso) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
        <p className="text-3xl mb-3">🔒</p>
        <h1 className="text-lg font-bold text-slate-900">Acceso no válido</h1>
        <p className="text-sm text-gray-500 mt-1">
          Este enlace no es válido o fue desactivado. Pídele al administrador que te reenvíe tu acceso.
        </p>
      </div>
    )
  }

  const porEstado =
    filtro === 'todos'
      ? solicitudes
      : filtro === 'repuestos'
        ? solicitudes.filter(s => ESTADOS_REPUESTO.includes(s.estado))
        : solicitudes.filter(s => s.estado === filtro)
  const filtradas = busqueda
    ? porEstado.filter(s => {
        const q = busqueda.toLowerCase()
        return (
          (s.cliente_nombre ?? '').toLowerCase().includes(q) ||
          (s.ciudad_pueblo ?? '').toLowerCase().includes(q) ||
          (s.tipo_equipo ?? '').toLowerCase().includes(q) ||
          (s.codigo_falla ?? '').toLowerCase().includes(q) ||
          (s.descripcion_falla ?? '').toLowerCase().includes(q) ||
          s.id.includes(busqueda)
        )
      })
    : porEstado

  return (
    <div>
      {/* Encabezado con alcance */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {supervisor ? `Hola, ${supervisor.nombre.split(' ')[0]}` : 'Solicitudes'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {cargando
              ? 'Cargando…'
              : `${solicitudes.length} solicitud${solicitudes.length !== 1 ? 'es' : ''} en tu alcance`}
            {supervisor && (
              <span className="text-gray-400">
                {' · '}
                {AMBITO_LABEL[supervisor.ambito] ?? supervisor.ambito}
                {supervisor.marca ? ` · ${supervisor.marca}` : ''}
              </span>
            )}
          </p>
        </div>
        {/* Guías — consulta y compartir (link público, sin token) */}
        <div className="flex items-center gap-2">
          <button
            onClick={descargarPdf}
            disabled={cargando || solicitudes.length === 0 || generandoPdf}
            className="text-xs font-semibold text-slate-700 border border-slate-200 bg-slate-50 rounded-lg px-3 py-2 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generandoPdf ? 'Generando…' : '⬇️ Descargar PDF'}
          </button>
          <a
            href={GUIA_SUPERVISOR_URL}
            target="_blank"
            rel="noopener"
            className="text-xs font-semibold text-blue-700 border border-blue-200 bg-blue-50 rounded-lg px-3 py-2 hover:bg-blue-100"
          >
            📖 Guía del supervisor
          </a>
          <a
            href={`https://wa.me/?text=${encodeURIComponent(`📖 Guía del Supervisor de Baird Service — las etapas de cada servicio y qué significa cada etiqueta:\n${GUIA_SUPERVISOR_URL}`)}`}
            target="_blank"
            rel="noopener"
            className="text-xs font-semibold text-emerald-700 border border-emerald-200 bg-emerald-50 rounded-lg px-3 py-2 hover:bg-emerald-100"
          >
            Compartir
          </a>
        </div>
      </div>

      {/* Toggle de vista: servicios vs partes requeridas */}
      <div className="mb-5 flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        <button
          onClick={() => setVista('servicios')}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
            vista === 'servicios' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📋 Servicios
        </button>
        <button
          onClick={abrirRepuestos}
          className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
            vista === 'repuestos' ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📦 Partes requeridas
        </button>
      </div>

      {vista === 'repuestos' && (
        <VistaRepuestos
          token={token}
          repuestos={repuestos}
          cargando={cargandoRepuestos}
          filtro={filtroRepuesto}
          setFiltro={setFiltroRepuesto}
        />
      )}

      {vista === 'servicios' && (
        <>
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {FILTROS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setFiltro(value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                filtro === value
                  ? 'bg-slate-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="Buscar por cliente, ciudad, equipo o falla…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
          </div>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-gray-400 p-8 text-center">No hay solicitudes que mostrar</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Cliente</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Equipo</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Falla</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Ciudad</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Valor</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Asignado a</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Fecha</th>
                  <th className="px-5 py-3 sticky right-0 bg-gray-50" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-900">{s.cliente_nombre}</p>
                      <p className="text-xs text-gray-400">{s.cliente_telefono}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{s.tipo_equipo ?? '—'}</p>
                      <p className="text-xs text-gray-400">{s.marca_equipo ?? '—'}</p>
                    </td>
                    {/* Código de falla del diagnóstico — el dato con el que la
                        marca clasifica el servicio. Vacío hasta que el técnico
                        diagnostica. */}
                    <td className="px-5 py-3">
                      {s.codigo_falla ? (
                        <>
                          <span className="inline-block text-xs font-extrabold text-purple-700 bg-purple-50 border border-purple-100 rounded-md px-2 py-0.5">
                            {s.codigo_falla}
                          </span>
                          {s.descripcion_falla && (
                            <p className="text-xs text-gray-400 mt-1 max-w-[180px]">{s.descripcion_falla}</p>
                          )}
                        </>
                      ) : (
                        <span className="text-xs text-gray-300">Sin diagnóstico</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{s.ciudad_pueblo ?? '—'}</p>
                      <p className="text-xs text-gray-400">{s.zona_servicio ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      {s.es_garantia ? (
                        !s.pago_tecnico || s.pago_tecnico === 0 ? (
                          <p className="text-sm font-medium text-gray-700">
                            <span className="text-xs text-gray-400 mr-1">desde</span>
                            ${formatCOP(PAGO_MINIMO_TECNICO_GARANTIA)}
                          </p>
                        ) : (
                          <p className="text-sm font-medium text-gray-700">${formatCOP(s.pago_tecnico)}</p>
                        )
                      ) : (
                        <p className="text-sm font-medium text-gray-700">${formatCOP(s.precio_cliente)}</p>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ESTADO_ESTILOS[s.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.estado}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {s.tecnico_nombre ? (
                        <p className="text-sm text-green-700 font-medium">{s.tecnico_nombre}</p>
                      ) : (
                        <span className="text-xs text-gray-300">Sin asignar</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-xs text-gray-400">
                        {new Date(s.created_at).toLocaleDateString('es-CO')}
                      </span>
                    </td>
                    {/* Sticky: el acceso al detalle siempre visible aunque la tabla scrollee */}
                    <td className="px-5 py-3 sticky right-0 bg-white shadow-[-6px_0_8px_-6px_rgba(0,0,0,0.08)]">
                      <Link
                        href={`/supervisor/${token}/${s.id}`}
                        // Sin prefetch: con N filas visibles Next.js dispararía N
                        // requests al detalle que cuentan contra el rate limit
                        // del middleware (429 visto en prod 2026-07-17).
                        prefetch={false}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Ver detalle →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}
    </div>
  )
}

// ── Vista Repuestos: todas las partes requeridas del alcance ──────────
// Cada tarjeta muestra la parte (SKU, descripción, estado del ciclo) y el
// caso al que pertenece con su estado actual + link al detalle.
function VistaRepuestos({
  token, repuestos, cargando, filtro, setFiltro,
}: {
  token: string
  repuestos: Repuesto[] | null
  cargando: boolean
  filtro: 'pendiente' | 'recibido' | 'todos'
  setFiltro: (f: 'pendiente' | 'recibido' | 'todos') => void
}) {
  const [busqueda, setBusqueda] = useState('')

  const filtrados = (repuestos ?? [])
    .filter(r => filtro === 'todos' || r.estado === filtro)
    .filter(r => {
      if (!busqueda.trim()) return true
      const q = busqueda.toLowerCase()
      return (
        r.sku.toLowerCase().includes(q) ||
        r.descripcion.toLowerCase().includes(q) ||
        (r.solicitud.cliente_nombre ?? '').toLowerCase().includes(q) ||
        (r.solicitud.tipo_equipo ?? '').toLowerCase().includes(q) ||
        (r.solicitud.marca_equipo ?? '').toLowerCase().includes(q) ||
        (r.solicitud.ciudad_pueblo ?? '').toLowerCase().includes(q) ||
        r.solicitud.id.includes(busqueda)
      )
    })

  return (
    <div>
      {/* Filtros por estado del repuesto + búsqueda */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {([
            ['pendiente', 'Pendientes'],
            ['recibido', 'Recibidos'],
            ['todos', 'Todos'],
          ] as const).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFiltro(value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                filtro === value
                  ? 'bg-slate-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="Buscar por SKU, parte, cliente o equipo…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </div>
      </div>

      {cargando || repuestos === null ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center">
          <p className="text-3xl mb-2">📭</p>
          <p className="text-sm text-gray-400">
            No hay partes {filtro === 'todos' ? 'requeridas' : filtro === 'pendiente' ? 'pendientes' : 'recibidas'} en tu alcance
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filtrados.map(r => (
            <div key={r.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-mono text-sm font-bold text-fuchsia-700 bg-fuchsia-50 px-2 py-0.5 rounded">
                      {r.sku}
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${REPUESTO_ESTILOS[r.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {r.estado}
                    </span>
                    {r.solicitud.es_garantia && (
                      <span className="text-xs font-medium bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">
                        🛡️ Garantía
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-slate-900">{r.descripcion}</p>
                  {/* El caso dueño de la parte y su estado actual */}
                  <p className="text-xs text-gray-500 mt-1">
                    {[r.solicitud.cliente_nombre, [r.solicitud.tipo_equipo, r.solicitud.marca_equipo].filter(Boolean).join(' '), r.solicitud.ciudad_pueblo]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs text-gray-400">
                    <span>Caso #{r.solicitud.id.slice(0, 8)}</span>
                    <span className={`font-semibold px-2 py-0.5 rounded-full ${ESTADO_ESTILOS[r.solicitud.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                      {r.solicitud.estado}
                    </span>
                    {r.tiempo_estimado && <span>⏱ {r.tiempo_estimado}</span>}
                    {r.costo > 0 && <span>💰 ${formatCOP(r.costo)}</span>}
                    <span>📅 {new Date(r.solicitado_at).toLocaleDateString('es-CO')}</span>
                  </div>
                </div>
                <Link
                  href={`/supervisor/${token}/${r.solicitud.id}`}
                  prefetch={false}
                  className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors"
                >
                  Ver caso →
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
