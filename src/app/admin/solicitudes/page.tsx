'use client'

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { ESTADO_ESTILOS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'
import { PAGO_MINIMO_TECNICO_GARANTIA } from '@/lib/constants/tarifas/mabe'
import { precioClienteServicio } from '@/types/solicitud'
import AgendaCalendario from '@/components/admin/AgendaCalendario'
import BadgePagoCliente from '@/components/ui/BadgePagoCliente'
import { FACTURACION_ESTADO_LABEL, type FacturacionEstado } from '@/types/solicitud'

interface Solicitud {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  ciudad_pueblo: string
  zona_servicio: string
  tipo_equipo: string
  marca_equipo: string
  tipo_solicitud: string
  estado: string
  pago_tecnico: number          // NETO al técnico (catálogo ÷ 1.3447 × 0.8, $35k fijo diagnóstico, o costo cotizado)
  precio_cliente: number        // lo que paga el cliente (catálogo / total cotizado, IVA incl.)
  es_garantia: boolean
  numero_serie_factura: string | null   // N° orden/garantía MABE
  created_at: string
  tecnico_asignado_id: string | null
  tecnico_nombre?: string
  // Capa paralela de pago (solo particular) — ver lib/constants/pago-cliente.ts
  anticipo_pagado_at: string | null
  abono_pagado_at: string | null
  saldo_pagado_at: string | null
  monto_pagado_online: number | null
  ultimo_pago_at: string | null
  cotizacion: unknown
  recargo_weekend_aplicado: number | null
  // Repuesto(s) que espera el servicio (solo en estados de repuesto) — ver
  // cargarRepuestosPendientes. Vacío si no hay ninguno especificado.
  repuestos_pendientes?: RepuestoPendienteResumen[]
  // Seguimiento de facturación (2026-10-22): solo tiene sentido en completadas.
  facturacion_estado: FacturacionEstado | null
  factura_numero: string | null
}

interface RepuestoPendienteResumen {
  sku: string | null
  descripcion: string | null
  cantidad: number | null
  estado: string | null
}

interface TecnicoOpcion {
  id: string
  nombre_completo: string
}

/** Refresco silencioso del listado (pagos y estados casi en vivo). */
const REFRESCO_LISTADO_MS = 30_000

interface ResultadoReenvio {
  id: string
  nombre: string
  ok: boolean
  mensaje: string
  notificados?: number
  matched?: number
  accion?: 'tecnicos' | 'cliente_horario'
}

// Filtro virtual (no es un estado): ofertadas a técnicos que nadie ha tomado.
// Es el conjunto que se re-oferta masivamente con "Reenviar a técnicos".
const FILTRO_SIN_TECNICO = 'sin_tecnico'

// Filtro virtual (2026-10-20): servicios detenidos por un repuesto, en
// cualquiera de los tres estados del ciclo (esperando → en camino → recibido).
// La fila muestra el repuesto que esperan (repuestos_pendientes, con fallback
// a cotizacion.productos_necesarios).
const FILTRO_PENDIENTE_REPUESTO = 'pendiente_repuesto'
const ESTADOS_REPUESTO = ['esperando_repuesto', 'repuesto_en_camino', 'repuesto_recibido'] as const

// Filtro virtual (2026-10-22): servicios completados que contabilidad aún no
// facturó (`facturacion_estado = 'pendiente'`). Se marca desde la ficha
// (bloque "🧾 Facturación"); el dashboard enlaza aquí con ?filtro=sin_facturar.
const FILTRO_SIN_FACTURAR = 'sin_facturar'

// Selector "Facturación" (2026-10-22): '' = todas. Convive con el chip de
// estado y el selector de técnico (los tres se aplican en la query).
const FACTURACION_OPCIONES: Array<{ value: '' | FacturacionEstado; label: string }> = [
  { value: '', label: '🧾 Facturación: todas' },
  { value: 'pendiente', label: '🧾 Sin facturar' },
  { value: 'facturada', label: '🧾 Facturadas' },
  { value: 'no_aplica', label: '🧾 No aplica' },
]

/**
 * Repuestos que espera un servicio, para pintarlos en el listado. Fuente
 * principal: `repuestos_pendientes` (SKU + descripción, sin cancelados).
 * Fallback: `cotizacion.productos_necesarios` (diagnósticos previos a la tabla
 * o cuando el técnico solo lo describió en la cotización). Solo se consulta
 * para las solicitudes en estado de repuesto — el resto no lo necesita.
 */
async function cargarRepuestosPendientes(
  solicitudes: Array<{ id: string; estado: string; cotizacion: unknown }>,
): Promise<Map<string, RepuestoPendienteResumen[]>> {
  const mapa = new Map<string, RepuestoPendienteResumen[]>()
  const enRepuesto = solicitudes.filter(s => (ESTADOS_REPUESTO as readonly string[]).includes(s.estado))
  if (enRepuesto.length === 0) return mapa

  const { data } = await supabase
    .from('repuestos_pendientes')
    .select('solicitud_id, sku, descripcion, cantidad, estado')
    .in('solicitud_id', enRepuesto.map(s => s.id))
    .neq('estado', 'cancelado')
    .order('solicitado_at', { ascending: true })

  for (const r of data ?? []) {
    const lista = mapa.get(r.solicitud_id) ?? []
    lista.push({ sku: r.sku, descripcion: r.descripcion, cantidad: r.cantidad, estado: r.estado })
    mapa.set(r.solicitud_id, lista)
  }

  // Fallback: lo que el técnico listó en la cotización (JSONB).
  for (const s of enRepuesto) {
    if (mapa.has(s.id)) continue
    const productos = (s.cotizacion as { productos_necesarios?: Array<{ sku?: string; descripcion?: string; cantidad?: number }> } | null)
      ?.productos_necesarios
    if (Array.isArray(productos) && productos.length > 0) {
      mapa.set(s.id, productos.map(p => ({
        sku: p.sku ?? null,
        descripcion: p.descripcion ?? null,
        cantidad: typeof p.cantidad === 'number' ? p.cantidad : null,
        estado: null,
      })))
    }
  }
  return mapa
}

const ESTADOS = [
  { value: 'todos', label: 'Todos', color: 'bg-gray-100 text-gray-700' },
  { value: FILTRO_SIN_TECNICO, label: '📣 Sin técnico', color: 'bg-orange-100 text-orange-800' },
  { value: FILTRO_PENDIENTE_REPUESTO, label: '🔩 Pendientes por repuesto', color: 'bg-fuchsia-100 text-fuchsia-800' },
  { value: FILTRO_SIN_FACTURAR, label: '🧾 Sin facturar', color: 'bg-amber-100 text-amber-800' },
  { value: 'pendiente_horario', label: 'Pendiente horario', color: 'bg-yellow-100 text-yellow-800' },
  { value: 'notificada', label: 'Notificada', color: 'bg-blue-100 text-blue-800' },
  { value: 'asignada', label: 'Asignada', color: 'bg-green-100 text-green-800' },
  { value: 'completada', label: 'Completada', color: 'bg-emerald-100 text-emerald-800' },
  { value: 'cancelada', label: 'Cancelada', color: 'bg-red-100 text-red-800' },
]

export default function SolicitudesAdmin() {
  const searchParams = useSearchParams()
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([])
  const [vista, setVista] = useState<'lista' | 'calendario'>('lista')
  // ?filtro= permite llegar con un chip activo (p. ej. el KPI "Sin facturar"
  // del dashboard enlaza a ?filtro=sin_facturar).
  const [filtro, setFiltro] = useState(() => {
    const inicial = searchParams.get('filtro')
    return inicial && ESTADOS.some(e => e.value === inicial) ? inicial : 'todos'
  })
  // Filtro por técnico asignado (2026-10-20): '' = todos. Convive con el
  // filtro de estado (ambos se aplican en la query).
  const [tecnicoFiltro, setTecnicoFiltro] = useState('')
  // Selector de facturación (2026-10-22): '' = todas.
  const [facturacionFiltro, setFacturacionFiltro] = useState<'' | FacturacionEstado>('')
  const [tecnicosOpciones, setTecnicosOpciones] = useState<TecnicoOpcion[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cargando, setCargando] = useState(true)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [eliminando, setEliminando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [exportando, setExportando] = useState(false)
  const [errorExport, setErrorExport] = useState<string | null>(null)
  // Reenvío masivo de la oferta a técnicos (POST /api/whatsapp/notify por solicitud)
  const [reenviando, setReenviando] = useState(false)
  const [progresoReenvio, setProgresoReenvio] = useState<{ hecho: number; total: number } | null>(null)
  const [resultadosReenvio, setResultadosReenvio] = useState<ResultadoReenvio[] | null>(null)
  // Refresco periódico (2026-10-11): cada 30 s, solo con la pestaña visible,
  // se recarga el listado SIN el spinner — así un pago que entra por Wompi
  // (redirect / cron de conciliación) aparece en el badge sin recargar.
  const [refresco, setRefresco] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') setRefresco(n => n + 1)
    }, REFRESCO_LISTADO_MS)
    return () => clearInterval(id)
  }, [])

  // Lista de técnicos para el selector (una sola vez).
  useEffect(() => {
    let activo = true
    supabase
      .from('tecnicos')
      .select('id, nombre_completo')
      .order('nombre_completo', { ascending: true })
      .then(({ data }) => {
        if (activo && data) setTecnicosOpciones(data as TecnicoOpcion[])
      })
    return () => { activo = false }
  }, [])

  useEffect(() => {
    const silencioso = refresco > 0
    const cargar = async () => {
      if (!silencioso) setCargando(true)

      try {
        let query = supabase
          .from('solicitudes_servicio')
          .select('id, cliente_nombre, cliente_telefono, ciudad_pueblo, zona_servicio, tipo_equipo, marca_equipo, tipo_solicitud, estado, pago_tecnico, cotizacion, es_garantia, numero_serie_factura, created_at, tecnico_asignado_id, recargo_weekend_aplicado, anticipo_pagado_at, abono_pagado_at, saldo_pagado_at, monto_pagado_online, ultimo_pago_at, facturacion_estado, factura_numero')
          .order('created_at', { ascending: false })

        if (filtro === FILTRO_SIN_TECNICO) {
          // Ofertadas sin que ningún técnico haya aceptado
          query = query.eq('estado', 'notificada').is('tecnico_asignado_id', null)
        } else if (filtro === FILTRO_PENDIENTE_REPUESTO) {
          query = query.in('estado', [...ESTADOS_REPUESTO])
        } else if (filtro === FILTRO_SIN_FACTURAR) {
          // Completadas que contabilidad aún no facturó
          query = query.eq('estado', 'completada').eq('facturacion_estado', 'pendiente')
        } else if (filtro !== 'todos') {
          query = query.eq('estado', filtro)
        }

        if (tecnicoFiltro) {
          query = query.eq('tecnico_asignado_id', tecnicoFiltro)
        }

        if (facturacionFiltro) {
          query = query.eq('facturacion_estado', facturacionFiltro)
        }

        const { data: solData, error } = await query

        if (error) {
          console.error('Error loading solicitudes:', error)
          // En un refresco silencioso conservamos lo que ya se ve.
          if (!silencioso) setSolicitudes([])
          setCargando(false)
          return
        }

        if (!solData) {
          setSolicitudes([])
          setCargando(false)
          return
        }

        // Load assigned técnico names
        const tecnicoIds = [...new Set(solData.filter(s => s.tecnico_asignado_id).map(s => s.tecnico_asignado_id!))]
        const tecnicoMap = new Map<string, string>()

        if (tecnicoIds.length > 0) {
          const { data: tecnicos } = await supabase
            .from('tecnicos')
            .select('id, nombre_completo')
            .in('id', tecnicoIds)

          tecnicos?.forEach((t: { id: string; nombre_completo: string }) => {
            tecnicoMap.set(t.id, t.nombre_completo)
          })
        }

        // Repuesto que esperan los servicios en estado de repuesto (una query).
        const repuestosMap = await cargarRepuestosPendientes(
          solData.map(s => ({ id: s.id, estado: s.estado ?? 'pendiente', cotizacion: s.cotizacion })),
        )

        const resultado: Solicitud[] = solData.map(s => ({
          ...s,
          estado: s.estado ?? 'pendiente',
          pago_tecnico: s.pago_tecnico ?? 0,
          precio_cliente: precioClienteServicio(s.tipo_equipo, s.tipo_solicitud, s.es_garantia, s.cotizacion, s.recargo_weekend_aplicado),
          tecnico_nombre: s.tecnico_asignado_id ? tecnicoMap.get(s.tecnico_asignado_id) : undefined,
          repuestos_pendientes: repuestosMap.get(s.id) ?? [],
          facturacion_estado: (s.facturacion_estado as FacturacionEstado | null) ?? null,
          factura_numero: s.factura_numero ?? null,
        }))

        setSolicitudes(resultado)
      } catch (e) {
        console.error('Error loading solicitudes:', e)
        if (!silencioso) setSolicitudes([])
      }
      setCargando(false)
    }

    cargar()
  }, [filtro, tecnicoFiltro, facturacionFiltro, refresco])

  const toggleSeleccion = (id: string) => {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleTodos = () => {
    if (seleccionados.size === filtradas.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(filtradas.map(s => s.id)))
    }
  }

  const handleExport = async (idsParaExportar?: string[]) => {
    setErrorExport(null)
    setExportando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setErrorExport('Sesión expirada. Inicia sesión de nuevo.')
        setExportando(false)
        return
      }

      const res = await fetch('/api/admin/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(idsParaExportar && idsParaExportar.length > 0 ? { ids: idsParaExportar } : {}),
      })

      if (!res.ok) {
        const text = await res.text()
        let msg = `Error ${res.status}`
        try {
          const j = JSON.parse(text)
          if (j?.error) msg = j.error
        } catch { /* respuesta no es JSON */ }
        setErrorExport(msg)
        setExportando(false)
        return
      }

      const blob = await res.blob()
      // Extraer filename del header si viene
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `baird-resumen-${Date.now()}.xlsx`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e) {
      setErrorExport(e instanceof Error ? e.message : 'Error desconocido')
    }
    setExportando(false)
  }

  const handleEliminar = async () => {
    if (seleccionados.size === 0) return
    setEliminando(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setEliminando(false); return }

      const res = await fetch('/api/carga-masiva', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ ids: [...seleccionados] }),
      })
      const data = await res.json()
      if (data.success) {
        setSolicitudes(prev => prev.filter(s => !seleccionados.has(s.id)))
        setSeleccionados(new Set())
        setConfirmDelete(false)
      }
    } catch (e) {
      console.error('Error eliminando:', e)
    }
    setEliminando(false)
  }

  /**
   * Reenvía la oferta a técnicos para cada solicitud seleccionada, una por
   * una (secuencial para no saturar Meta ni Vercel). Reusa el endpoint
   * existente, que ya decide por estado: `notificada` → re-notifica técnicos
   * compatibles; `pendiente_horario`/`sin_agendar` → reenvía al cliente la
   * selección de horario; con técnico asignado o estado terminal → 409 y se
   * reporta como omitida. No cambia nada de la lógica de matching.
   */
  const handleReenviarTecnicos = async () => {
    if (seleccionados.size === 0 || reenviando) return
    setReenviando(true)
    setResultadosReenvio(null)
    const ids = [...seleccionados]
    setProgresoReenvio({ hecho: 0, total: ids.length })
    const resultados: ResultadoReenvio[] = []
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setResultadosReenvio([{ id: '', nombre: '', ok: false, mensaje: 'Sesión expirada. Inicia sesión de nuevo.' }])
        setReenviando(false)
        setProgresoReenvio(null)
        return
      }
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]
        const sol = solicitudes.find(s => s.id === id)
        const nombre = sol?.cliente_nombre ?? id.slice(0, 8)
        try {
          const res = await fetch('/api/whatsapp/notify', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ solicitudId: id }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) {
            resultados.push({ id, nombre, ok: false, mensaje: data?.error ?? `Error ${res.status}` })
          } else {
            resultados.push({
              id,
              nombre,
              ok: data?.success !== false,
              mensaje: data?.mensaje ?? 'Sin detalle',
              notificados: typeof data?.notificados === 'number' ? data.notificados : undefined,
              matched: typeof data?.matched === 'number' ? data.matched : undefined,
              accion: data?.accion,
            })
          }
        } catch (e) {
          resultados.push({ id, nombre, ok: false, mensaje: e instanceof Error ? e.message : 'Error de red' })
        }
        setProgresoReenvio({ hecho: i + 1, total: ids.length })
      }
    } finally {
      setResultadosReenvio(resultados)
      setReenviando(false)
      setProgresoReenvio(null)
    }
  }

  // useDeferredValue (2026-10-22): el input de búsqueda se pinta de inmediato
  // y la tabla filtrada se recalcula en una prioridad más baja — así teclear
  // no espera a re-renderizar todas las filas (queja de lentitud al escribir).
  const busquedaDiferida = useDeferredValue(busqueda)
  const filtradas = useMemo(() => busquedaDiferida
    ? solicitudes.filter(s => {
        const q = busquedaDiferida.toLowerCase()
        // Solo-dígitos para matchear teléfonos sin importar +57/espacios
        const qDigits = q.replace(/\D/g, '')
        return (
          (s.cliente_nombre ?? '').toLowerCase().includes(q) ||
          (s.ciudad_pueblo ?? '').toLowerCase().includes(q) ||
          (s.tipo_equipo ?? '').toLowerCase().includes(q) ||
          (s.marca_equipo ?? '').toLowerCase().includes(q) ||
          (s.numero_serie_factura ?? '').toLowerCase().includes(q) ||
          (qDigits.length >= 4 && (s.cliente_telefono ?? '').replace(/\D/g, '').includes(qDigits)) ||
          s.id.includes(busquedaDiferida)
        )
      })
    : solicitudes, [busquedaDiferida, solicitudes])

  return (
    <div className="p-6 lg:p-8 max-w-6xl">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Solicitudes</h1>
          <p className="text-sm text-gray-500 mt-1">
            {solicitudes.length} solicitud{solicitudes.length !== 1 ? 'es' : ''} registrada{solicitudes.length !== 1 ? 's' : ''}
          </p>
        </div>
        <button
          onClick={() => handleExport()}
          disabled={exportando || solicitudes.length === 0}
          className="px-4 py-2 bg-emerald-600 text-white text-sm font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Exporta TODAS las solicitudes con cliente, técnico, evidencias, fotos, eventos y GPS en un solo Excel"
        >
          {exportando ? 'Generando…' : '📥 Descargar resumen Excel'}
        </button>
      </div>

      {/* Toggle de vista: lista vs calendario de agenda */}
      <div className="mb-5 flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {([['lista', '📋 Lista'], ['calendario', '🗓️ Calendario']] as const).map(([v, label]) => (
          <button
            key={v}
            onClick={() => setVista(v)}
            className={`px-4 py-1.5 text-sm font-semibold rounded-md transition-colors ${
              vista === v ? 'bg-white text-slate-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {errorExport && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {errorExport}
        </div>
      )}

      {vista === 'calendario' && <AgendaCalendario />}

      {vista === 'lista' && (
        <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-2 flex-wrap">
          {ESTADOS.map(({ value, label, color }) => (
            <button
              key={value}
              onClick={() => setFiltro(value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full transition-all ${
                filtro === value
                  ? `${color} ring-2 ring-offset-1 ring-gray-300`
                  : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="sm:w-56">
          <select
            value={tecnicoFiltro}
            onChange={(e) => setTecnicoFiltro(e.target.value)}
            title="Filtrar por técnico asignado"
            className={`w-full border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent ${
              tecnicoFiltro ? 'border-green-300 bg-green-50 text-green-900 font-medium' : 'border-gray-200 text-gray-600'
            }`}
          >
            <option value="">👷 Todos los técnicos</option>
            {tecnicosOpciones.map(t => (
              <option key={t.id} value={t.id}>{t.nombre_completo}</option>
            ))}
          </select>
        </div>
        <div className="sm:w-48">
          <select
            value={facturacionFiltro}
            onChange={(e) => setFacturacionFiltro(e.target.value as '' | FacturacionEstado)}
            title="Filtrar por seguimiento de facturación (se marca en la ficha de cada servicio completado)"
            className={`w-full border rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent ${
              facturacionFiltro ? 'border-amber-300 bg-amber-50 text-amber-900 font-medium' : 'border-gray-200 text-gray-600'
            }`}
          >
            {FACTURACION_OPCIONES.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 sm:max-w-xs">
          <input
            type="text"
            placeholder="Buscar por cliente, teléfono, orden, ciudad, equipo o ID..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
          />
        </div>
      </div>

      {/* Selection action bar */}
      {seleccionados.size > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
          <span className="text-sm font-semibold text-red-800">
            {seleccionados.size} seleccionada{seleccionados.size !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => handleExport([...seleccionados])}
            disabled={exportando}
            className="px-4 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {exportando ? 'Generando…' : '📥 Descargar selección'}
          </button>
          <button
            onClick={handleReenviarTecnicos}
            disabled={reenviando}
            title="Vuelve a enviar la oferta por WhatsApp a los técnicos compatibles de cada solicitud seleccionada. Las que ya tienen técnico o están cerradas se omiten."
            className="px-4 py-1.5 bg-orange-600 text-white text-xs font-semibold rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {reenviando && progresoReenvio
              ? `Reenviando ${progresoReenvio.hecho}/${progresoReenvio.total}…`
              : '📣 Reenviar a técnicos'}
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="px-4 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
              Eliminar
            </button>
          ) : (
            <>
              <button
                onClick={handleEliminar}
                disabled={eliminando}
                className="px-4 py-1.5 bg-red-700 text-white text-xs font-semibold rounded-lg hover:bg-red-800 disabled:opacity-50 transition-colors"
              >
                {eliminando ? 'Eliminando...' : 'Confirmar eliminacion'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="px-4 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancelar
              </button>
            </>
          )}
          <button
            onClick={() => { setSeleccionados(new Set()); setConfirmDelete(false) }}
            className="ml-auto text-xs text-gray-500 hover:text-gray-700"
          >
            Deseleccionar todo
          </button>
        </div>
      )}

      {/* Resultado del reenvío masivo a técnicos */}
      {resultadosReenvio && (
        <div className="mb-4 bg-white border border-orange-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-orange-800 uppercase tracking-wider">
              Reenvío a técnicos — {resultadosReenvio.filter(r => r.ok).length}/{resultadosReenvio.length} OK
            </h3>
            <button
              onClick={() => setResultadosReenvio(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cerrar
            </button>
          </div>
          <ul className="space-y-1">
            {resultadosReenvio.map((r, i) => (
              <li key={`${r.id}-${i}`} className={`text-xs rounded px-2 py-1 ${r.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
                <span className="font-semibold">{r.nombre}</span>
                {r.accion === 'tecnicos' && typeof r.notificados === 'number' && (
                  <span className="ml-2 font-mono">{r.notificados}/{r.matched ?? '?'} técnicos</span>
                )}
                {r.accion === 'cliente_horario' && <span className="ml-2 italic">→ selección de horario al cliente</span>}
                <span className="ml-2">{r.mensaje}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {cargando ? (
          <div className="p-8 text-center">
            <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full mx-auto" />
          </div>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-gray-400 p-8 text-center">No se encontraron solicitudes</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={filtradas.length > 0 && seleccionados.size === filtradas.length}
                      onChange={toggleTodos}
                      className="w-4 h-4 rounded border-gray-300"
                    />
                  </th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Cliente</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Equipo</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Ciudad</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Valor</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Estado</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Asignado a</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide px-5 py-3">Fecha</th>
                  <th className="px-5 py-3 sticky right-0 bg-gray-50" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtradas.map((s) => (
                  <tr key={s.id} className={`transition-colors ${seleccionados.has(s.id) ? 'bg-red-50/50' : 'hover:bg-gray-50/50'}`}>
                    <td className="px-3 py-3">
                      <input
                        type="checkbox"
                        checked={seleccionados.has(s.id)}
                        onChange={() => toggleSeleccion(s.id)}
                        className="w-4 h-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm font-semibold text-slate-900">{s.cliente_nombre}</p>
                      <p className="text-xs text-gray-400">{s.cliente_telefono}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{s.tipo_equipo ?? '—'}</p>
                      <p className="text-xs text-gray-400">{s.marca_equipo ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-gray-700">{s.ciudad_pueblo ?? '—'}</p>
                      <p className="text-xs text-gray-400">{s.zona_servicio ?? '—'}</p>
                    </td>
                    <td className="px-5 py-3">
                      {s.es_garantia ? (
                        (!s.pago_tecnico || s.pago_tecnico === 0) ? (
                          <p className="text-sm font-medium text-gray-700">
                            <span className="text-xs text-gray-400 mr-1">desde</span>
                            ${formatCOP(PAGO_MINIMO_TECNICO_GARANTIA)}
                          </p>
                        ) : (
                          <p className="text-sm font-medium text-gray-700">
                            ${formatCOP(s.pago_tecnico)}
                          </p>
                        )
                      ) : (
                        // Particular: el "Valor" es lo que paga el cliente (no el neto del técnico).
                        <>
                          <p className="text-sm font-medium text-gray-700">
                            ${formatCOP(s.precio_cliente)}
                          </p>
                          <div className="mt-1">
                            <BadgePagoCliente solicitud={s} />
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ESTADO_ESTILOS[s.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                        {s.estado}
                      </span>
                      {s.estado === 'completada' && s.facturacion_estado === 'facturada' && (
                        <p
                          className="mt-1.5 text-[11px] leading-snug text-emerald-800"
                          title={`Facturada en Siigo${s.factura_numero ? ` — ${s.factura_numero}` : ''}`}
                        >
                          🧾 <span className="font-mono font-semibold">{s.factura_numero ?? FACTURACION_ESTADO_LABEL.facturada}</span>
                        </p>
                      )}
                      {s.estado === 'completada' && s.facturacion_estado === 'no_aplica' && (
                        <p className="mt-1.5 text-[11px] leading-snug text-gray-400" title="Este servicio no genera factura">
                          🧾 {FACTURACION_ESTADO_LABEL.no_aplica}
                        </p>
                      )}
                      {(ESTADOS_REPUESTO as readonly string[]).includes(s.estado) && (
                        <div className="mt-1.5 space-y-0.5" title="Repuesto que espera este servicio">
                          {s.repuestos_pendientes && s.repuestos_pendientes.length > 0 ? (
                            s.repuestos_pendientes.map((r, i) => (
                              <p key={`${s.id}-rep-${i}`} className="text-[11px] leading-snug text-fuchsia-800 max-w-[220px]">
                                🔩 {r.sku ? <span className="font-mono font-semibold">{r.sku}</span> : null}
                                {r.sku && r.descripcion ? ' · ' : ''}
                                {r.descripcion ?? (r.sku ? '' : 'Sin descripción')}
                                {r.cantidad && r.cantidad > 1 ? ` ×${r.cantidad}` : ''}
                                {r.estado === 'recibido' ? <span className="ml-1 text-lime-700">(recibido)</span> : null}
                              </p>
                            ))
                          ) : (
                            <p className="text-[11px] text-gray-400 italic">🔩 Sin repuesto especificado</p>
                          )}
                        </div>
                      )}
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
                        href={`/admin/solicitudes/${s.id}`}
                        className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors whitespace-nowrap"
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
