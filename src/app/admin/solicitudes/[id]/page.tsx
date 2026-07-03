'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { TIPO_A_ESPECIALIDAD } from '@/lib/constants/especialidades'
import { ESTADO_ESTILOS, ESTADO_LABELS, NOTIF_ESTILOS, ESTADOS_VALIDOS } from '@/lib/constants/estados'
import { formatCOP } from '@/lib/utils/format'
import { PAGO_MINIMO_TECNICO_GARANTIA } from '@/lib/constants/tarifas/mabe'
import { escapeLikePattern } from '@/lib/utils/format'
import { TIPOS_EQUIPO, precioClienteServicio, type ChecklistServicio } from '@/types/solicitud'
import { FRANJAS_HORARIO } from '@/lib/constants/franjas'
import { fechaColombiaYMD } from '@/lib/utils/fecha-visita'
import { useFranjasLlenas } from '@/hooks/useFranjasLlenas'

interface Solicitud {
  id: string
  cliente_nombre: string
  cliente_telefono: string
  direccion: string
  ciudad_pueblo: string
  zona_servicio: string
  tipo_equipo: string
  marca_equipo: string
  tipo_solicitud: string
  novedades_equipo: string
  es_garantia: boolean
  numero_serie_factura: string
  pago_tecnico: number
  horario_visita_1: string
  horario_visita_2: string
  horario_confirmado: string | null
  estado: string
  tecnico_asignado_id: string | null
  created_at: string
  cliente_token: string | null
  horario_confirmado_at: string | null
  reagendamientos_count: number | null
  ultimo_reagendado_at: string | null
}

interface Tecnico {
  id: string
  nombre_completo: string
  whatsapp: string
  ciudad_pueblo: string
  estado_verificacion: string
  especialidades: string[]
}

interface Notificacion {
  id: string
  tecnico_id: string
  estado: string
  enviado_at: string
  respondido_at: string | null
  tecnico_nombre?: string
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

interface MatchDiagnostic {
  step: string
  status: 'pass' | 'fail' | 'warn'
  detail: string
}

// Fila de solicitud_eventos (audit log append-only). Se parte en dos vistas:
//   - Notas (tipo='nota_admin'): payload.origen='nota_manual' → nota escrita
//     por el admin; payload.campos_modificados → audit de edición de campos;
//     actor='sistema' → avisos automáticos (p.ej. 0 técnicos notificados).
//   - Historial de estados (resto de tipos con estado_previo ≠ estado_nuevo):
//     'cambio_estado' (flujo, actor inferido), 'cambio_estado_admin' (manual),
//     'cancelacion', 'reagendamiento*', etc.
interface EventoSolicitud {
  id: number
  tipo: string
  estado_previo: string | null
  estado_nuevo: string | null
  actor: string | null
  motivo: string | null
  payload: Record<string, unknown> | null
  ocurrido_at: string
}

// Badge de actor para el historial de estados. Valores fuera del mapa
// (p.ej. el email del admin en notas) se muestran como admin con ese texto.
const ACTOR_BADGES: Record<string, { label: string; clase: string }> = {
  cliente: { label: '👤 Cliente', clase: 'bg-blue-50 text-blue-700 border-blue-200' },
  tecnico: { label: '🔧 Técnico', clase: 'bg-green-50 text-green-700 border-green-200' },
  admin: { label: '🛡️ Admin', clase: 'bg-purple-50 text-purple-700 border-purple-200' },
  sistema: { label: '⚙️ Sistema', clase: 'bg-gray-100 text-gray-600 border-gray-200' },
}

function actorBadge(actor: string | null): { label: string; clase: string } {
  if (!actor) return ACTOR_BADGES.sistema
  return ACTOR_BADGES[actor] ?? { label: `🛡️ ${actor}`, clase: ACTOR_BADGES.admin.clase }
}

/** "lunes, 6 de mayo" para preview del calendario (YYYY-MM-DD). Solo display. */
function formatFechaLargaLocal(ymd: string): string {
  if (!ymd) return ''
  const d = new Date(ymd + 'T12:00:00')
  return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function SolicitudDetalle() {
  const params = useParams()
  const id = params.id as string

  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [tecnicoAsignado, setTecnicoAsignado] = useState<Tecnico | null>(null)
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [diagnostics, setDiagnostics] = useState<MatchDiagnostic[]>([])
  const [candidatos, setCandidatos] = useState<Tecnico[]>([])
  const [evidencia, setEvidencia] = useState<Evidencia | null>(null)
  const [cargando, setCargando] = useState(true)
  const [reenvioResult, setReenvioResult] = useState<Record<string, unknown> | null>(null)
  const [reenviando, setReenviando] = useState(false)
  const [editando, setEditando] = useState(false)
  const [edicionDireccion, setEdicionDireccion] = useState('')
  const [edicionCiudad, setEdicionCiudad] = useState('')
  const [edicionZona, setEdicionZona] = useState('')
  const [edicionTipoEquipo, setEdicionTipoEquipo] = useState('')
  const [edicionMotivo, setEdicionMotivo] = useState('')
  const [guardandoEdicion, setGuardandoEdicion] = useState(false)
  const [errorEdicion, setErrorEdicion] = useState<string | null>(null)
  const [exportando, setExportando] = useState(false)
  const [errorExport, setErrorExport] = useState<string | null>(null)
  const [reenviandoUltimo, setReenviandoUltimo] = useState(false)
  const [ultimoResult, setUltimoResult] = useState<Record<string, unknown> | null>(null)
  const [estadoSeleccionado, setEstadoSeleccionado] = useState('')
  const [motivoEstado, setMotivoEstado] = useState('')
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [resultadoEstado, setResultadoEstado] = useState<{ ok: boolean; mensaje: string } | null>(null)
  const [nuevoValorInput, setNuevoValorInput] = useState('')
  const [motivoValor, setMotivoValor] = useState('')
  const [actualizandoValor, setActualizandoValor] = useState(false)
  const [resultadoValor, setResultadoValor] = useState<{ ok: boolean; mensaje: string } | null>(null)
  const [pidiendoRepuesto, setPidiendoRepuesto] = useState(false)
  const [resultadoRepuesto, setResultadoRepuesto] = useState<{ ok: boolean; mensaje: string } | null>(null)
  const [notas, setNotas] = useState<EventoSolicitud[]>([])
  const [historial, setHistorial] = useState<EventoSolicitud[]>([])
  const [nuevaNota, setNuevaNota] = useState('')
  const [guardandoNota, setGuardandoNota] = useState(false)
  const [errorNota, setErrorNota] = useState<string | null>(null)
  // Cambiar fecha de servicio (calendario + franja → /api/admin/reagendar-solicitud)
  const [fechaReagenda, setFechaReagenda] = useState('')
  const [franjaReagenda, setFranjaReagenda] = useState('')
  const [motivoReagenda, setMotivoReagenda] = useState('')
  const [reagendando, setReagendando] = useState(false)
  const [resultadoReagenda, setResultadoReagenda] = useState<{ ok: boolean; mensaje: string } | null>(null)
  // Franjas sin cupo para la fecha elegida — se MUESTRAN como aviso pero NO se
  // bloquean (el admin puede forzar). El guard real (no bloqueante) está en el route.
  const franjasLlenasReagenda = useFranjasLlenas(fechaReagenda)

  const handleDescargarResumen = async () => {
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
        body: JSON.stringify({ ids: [id] }),
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
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename="([^"]+)"/)
      const filename = match?.[1] ?? `baird-solicitud-${id.slice(0, 8)}.xlsx`
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

  const abrirEdicion = () => {
    if (!solicitud) return
    setEdicionDireccion(solicitud.direccion ?? '')
    setEdicionCiudad(solicitud.ciudad_pueblo ?? '')
    setEdicionZona(solicitud.zona_servicio ?? '')
    setEdicionTipoEquipo(solicitud.tipo_equipo ?? '')
    setEdicionMotivo('')
    setErrorEdicion(null)
    setEditando(true)
  }

  const guardarEdicion = async () => {
    if (!solicitud) return
    setGuardandoEdicion(true)
    setErrorEdicion(null)

    const cambios: Record<string, string> = {}
    if (edicionDireccion.trim() && edicionDireccion.trim() !== solicitud.direccion) {
      cambios.direccion = edicionDireccion.trim()
    }
    if (edicionCiudad.trim() && edicionCiudad.trim() !== solicitud.ciudad_pueblo) {
      cambios.ciudad_pueblo = edicionCiudad.trim()
    }
    if (edicionZona.trim() && edicionZona.trim() !== solicitud.zona_servicio) {
      cambios.zona_servicio = edicionZona.trim()
    }
    if (edicionTipoEquipo.trim() && edicionTipoEquipo.trim() !== solicitud.tipo_equipo) {
      cambios.tipo_equipo = edicionTipoEquipo.trim()
    }

    if (Object.keys(cambios).length === 0) {
      setErrorEdicion('No hay cambios que guardar')
      setGuardandoEdicion(false)
      return
    }

    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setErrorEdicion('Sesión expirada — vuelve a iniciar sesión')
        setGuardandoEdicion(false)
        return
      }
      const res = await fetch('/api/admin/editar-solicitud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: solicitud.id,
          cambios,
          motivo: edicionMotivo.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorEdicion(data.error || 'No se pudo guardar')
        setGuardandoEdicion(false)
        return
      }
      // Actualizar la solicitud en memoria con los cambios aplicados
      setSolicitud(prev => prev ? { ...prev, ...cambios } : prev)
      setEditando(false)
    } catch (e) {
      setErrorEdicion(e instanceof Error ? e.message : 'Error de conexión')
    }
    setGuardandoEdicion(false)
  }

  async function handleReagendar() {
    if (!solicitud) return
    if (!fechaReagenda) { setResultadoReagenda({ ok: false, mensaje: 'Elegí una fecha.' }); return }
    if (!franjaReagenda) { setResultadoReagenda({ ok: false, mensaje: 'Elegí una franja horaria.' }); return }

    const llena = franjasLlenasReagenda.includes(franjaReagenda)
    const confirmado = window.confirm(
      `¿Reprogramar el servicio para ${formatFechaLargaLocal(fechaReagenda)} · ${franjaReagenda}?\n\n` +
      (llena ? '⚠️ Esa franja ya está llena para ese día — la estás forzando.\n\n' : '') +
      'Se le avisará por WhatsApp al cliente, al técnico asignado y a los supervisores con visibilidad del servicio.',
    )
    if (!confirmado) return

    setReagendando(true)
    setResultadoReagenda(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setResultadoReagenda({ ok: false, mensaje: 'Sesión expirada — vuelve a iniciar sesión.' })
        setReagendando(false)
        return
      }
      const res = await fetch('/api/admin/reagendar-solicitud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: solicitud.id,
          fecha: fechaReagenda,
          franja: franjaReagenda,
          motivo: motivoReagenda.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResultadoReagenda({ ok: false, mensaje: data.error || 'No se pudo reprogramar.' })
        setReagendando(false)
        return
      }

      // Reflejar en memoria para que el card "Horario confirmado" muestre la
      // nueva fecha sin recargar (el polling también la traería en ≤10s).
      const nowIso = new Date().toISOString()
      setSolicitud(prev => prev ? {
        ...prev,
        horario_confirmado: data.horario,
        horario_confirmado_at: nowIso,
        ultimo_reagendado_at: nowIso,
        reagendamientos_count: (prev.reagendamientos_count ?? 0) + 1,
      } : prev)

      const partes: string[] = [`Cliente ${data.cliente_notificado ? '✅' : '⚠️'}`]
      if (data.tenia_tecnico) partes.push(`Técnico ${data.tecnico_notificado ? '✅' : '⚠️'}`)
      const sup = data.supervisores as { enviados: number; total: number } | undefined
      if (sup && sup.total > 0) partes.push(`Supervisores ${sup.enviados}/${sup.total}`)
      const avisos = Array.isArray(data.avisos) && data.avisos.length > 0 ? ` · ${data.avisos.join(' ')}` : ''
      setResultadoReagenda({ ok: true, mensaje: `Fecha reprogramada a ${data.horario}. ${partes.join(' · ')}.${avisos}` })
      setFechaReagenda(''); setFranjaReagenda(''); setMotivoReagenda('')
    } catch (e) {
      setResultadoReagenda({ ok: false, mensaje: e instanceof Error ? e.message : 'Error de conexión.' })
    }
    setReagendando(false)
  }

  const handleAgregarNota = async () => {
    if (!solicitud) return
    const texto = nuevaNota.trim()
    if (!texto) {
      setErrorNota('Escribe la nota antes de guardar.')
      return
    }
    setGuardandoNota(true)
    setErrorNota(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setErrorNota('Sesión expirada — vuelve a iniciar sesión.')
        setGuardandoNota(false)
        return
      }
      const res = await fetch('/api/admin/notas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ solicitudId: solicitud.id, texto }),
      })
      const data = await res.json()
      if (!res.ok) {
        setErrorNota(data.error || 'No se pudo guardar la nota.')
        setGuardandoNota(false)
        return
      }
      setNotas(prev => [data.nota as EventoSolicitud, ...prev])
      setNuevaNota('')
    } catch (e) {
      setErrorNota(e instanceof Error ? e.message : 'Error de conexión.')
    } finally {
      setGuardandoNota(false)
    }
  }

  const handleCambiarEstado = async () => {
    if (!solicitud) return
    const destino = estadoSeleccionado || solicitud.estado
    if (destino === solicitud.estado) {
      setResultadoEstado({ ok: false, mensaje: 'Seleccioná un estado distinto al actual.' })
      return
    }
    const confirmado = window.confirm(
      `¿Forzar el cambio de estado?\n\n` +
      `${ESTADO_LABELS[solicitud.estado] ?? solicitud.estado}  →  ${ESTADO_LABELS[destino] ?? destino}\n\n` +
      `Esto NO envía WhatsApp y queda registrado en el audit log.`,
    )
    if (!confirmado) return

    setCambiandoEstado(true)
    setResultadoEstado(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setResultadoEstado({ ok: false, mensaje: 'Sesión expirada — vuelve a iniciar sesión.' })
        setCambiandoEstado(false)
        return
      }
      const res = await fetch('/api/admin/cambiar-estado', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: solicitud.id,
          nuevoEstado: destino,
          motivo: motivoEstado.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResultadoEstado({ ok: false, mensaje: data.error || 'No se pudo cambiar el estado.' })
        setCambiandoEstado(false)
        return
      }
      setSolicitud(prev => (prev ? { ...prev, estado: destino } : prev))
      setMotivoEstado('')
      setResultadoEstado({ ok: true, mensaje: `Estado cambiado a "${ESTADO_LABELS[destino] ?? destino}".` })
    } catch (e) {
      setResultadoEstado({ ok: false, mensaje: e instanceof Error ? e.message : 'Error de conexión.' })
    }
    setCambiandoEstado(false)
  }

  async function handleActualizarValor() {
    if (!solicitud) return
    const valor = Math.round(Number(nuevoValorInput.replace(/[^\d]/g, '')))
    if (!Number.isFinite(valor) || valor < 1000) {
      setResultadoValor({ ok: false, mensaje: 'Ingresá un valor válido (mínimo $1.000).' })
      return
    }
    const confirmado = window.confirm(
      `¿Actualizar el valor del servicio a $${valor.toLocaleString('es-CO')} COP?\n\n` +
      `Esto reabre la aprobación (estado → Cotización enviada) y le avisa al cliente por WhatsApp.`,
    )
    if (!confirmado) return

    setActualizandoValor(true)
    setResultadoValor(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        setResultadoValor({ ok: false, mensaje: 'Sesión expirada — vuelve a iniciar sesión.' })
        setActualizandoValor(false)
        return
      }
      const res = await fetch('/api/admin/actualizar-valor', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          id: solicitud.id,
          nuevoValor: valor,
          motivo: motivoValor.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setResultadoValor({ ok: false, mensaje: data.error || 'No se pudo actualizar el valor.' })
        setActualizandoValor(false)
        return
      }
      setSolicitud(prev => {
        if (!prev) return prev
        const rec = prev as unknown as Record<string, unknown>
        const prevCot = (rec.cotizacion ?? {}) as Record<string, unknown>
        return {
          ...rec,
          estado: 'cotizacion_enviada',
          cotizacion: { ...prevCot, total: valor, mano_obra: 0, repuestos: 0 },
        } as unknown as Solicitud
      })
      setNuevoValorInput('')
      setMotivoValor('')
      setResultadoValor({
        ok: true,
        mensaje: data.whatsapp_enviado
          ? `Valor actualizado a $${valor.toLocaleString('es-CO')}. Cliente notificado por WhatsApp.`
          : `Valor actualizado a $${valor.toLocaleString('es-CO')}, pero el WhatsApp no salió${data.whatsapp_error ? ` (${data.whatsapp_error})` : ''}.`,
      })
    } catch (e) {
      setResultadoValor({ ok: false, mensaje: e instanceof Error ? e.message : 'Error de conexión.' })
    }
    setActualizandoValor(false)
  }

  async function runDiagnostics(sol: Solicitud) {
    const steps: MatchDiagnostic[] = []

    // Step 1: Especialidad mapping
    const especialidadBuscada = TIPO_A_ESPECIALIDAD[sol.tipo_equipo] ?? sol.tipo_equipo
    const mapped = !!TIPO_A_ESPECIALIDAD[sol.tipo_equipo]
    steps.push({
      step: 'Mapeo de especialidad',
      status: mapped ? 'pass' : 'warn',
      detail: mapped
        ? `"${sol.tipo_equipo}" se mapea a "${especialidadBuscada}"`
        : `"${sol.tipo_equipo}" NO tiene mapeo definido, se busca textualmente "${especialidadBuscada}"`,
    })

    // Step 2: Find técnicos with that especialidad
    const { data: especialidades } = await supabase
      .from('especialidades_tecnico')
      .select('tecnico_id, especialidad')
      .eq('especialidad', especialidadBuscada)

    if (!especialidades || especialidades.length === 0) {
      steps.push({
        step: 'Buscar especialidad en BD',
        status: 'fail',
        detail: `No hay ningun tecnico con especialidad "${especialidadBuscada}" en la tabla especialidades_tecnico`,
      })

      // Show what especialidades DO exist
      const { data: allEsp } = await supabase
        .from('especialidades_tecnico')
        .select('especialidad')

      const unique = [...new Set(allEsp?.map((e: { especialidad: string }) => e.especialidad) ?? [])]
      steps.push({
        step: 'Especialidades existentes en BD',
        status: 'warn',
        detail: unique.length > 0
          ? `Especialidades registradas: ${unique.map(e => `"${e}"`).join(', ')}`
          : 'No hay ninguna especialidad registrada en la BD',
      })

      setDiagnostics(steps)
      return
    }

    const tecnicoIds = especialidades.map((e: { tecnico_id: string }) => e.tecnico_id)
    steps.push({
      step: 'Buscar especialidad en BD',
      status: 'pass',
      detail: `${tecnicoIds.length} tecnico(s) tienen especialidad "${especialidadBuscada}"`,
    })

    // Step 3: Filter by verificado
    const { data: verificados } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo, whatsapp, ciudad_pueblo, estado_verificacion')
      .in('id', tecnicoIds)
      .eq('estado_verificacion', 'verificado')

    if (!verificados || verificados.length === 0) {
      // Show what their actual status is
      const { data: allTecs } = await supabase
        .from('tecnicos')
        .select('id, nombre_completo, estado_verificacion')
        .in('id', tecnicoIds)

      steps.push({
        step: 'Filtro: verificados',
        status: 'fail',
        detail: `Ninguno de los ${tecnicoIds.length} tecnico(s) con esa especialidad esta verificado. Estados actuales: ${
          allTecs?.map((t: { nombre_completo: string; estado_verificacion: string }) => `${t.nombre_completo} (${t.estado_verificacion})`).join(', ') ?? 'N/A'
        }`,
      })
      setDiagnostics(steps)
      return
    }

    steps.push({
      step: 'Filtro: verificados',
      status: 'pass',
      detail: `${verificados.length} tecnico(s) verificado(s): ${verificados.map((t: { nombre_completo: string }) => t.nombre_completo).join(', ')}`,
    })

    // Step 4: Filter by city
    const { data: enCiudad } = await supabase
      .from('tecnicos')
      .select('id, nombre_completo, whatsapp, ciudad_pueblo, estado_verificacion')
      .in('id', verificados.map((t: { id: string }) => t.id))
      .ilike('ciudad_pueblo', `%${escapeLikePattern(sol.ciudad_pueblo)}%`)

    if (!enCiudad || enCiudad.length === 0) {
      steps.push({
        step: 'Filtro: ciudad',
        status: 'fail',
        detail: `Ninguno de los verificados esta en "${sol.ciudad_pueblo}". Ciudades de los verificados: ${
          verificados.map((t: { nombre_completo: string; ciudad_pueblo: string }) => `${t.nombre_completo} → "${t.ciudad_pueblo}"`).join(', ')
        }`,
      })
      setDiagnostics(steps)

      // Save all verificados as candidates for reference
      const espAll = await supabase
        .from('especialidades_tecnico')
        .select('tecnico_id, especialidad')
        .in('tecnico_id', verificados.map((v: { id: string }) => v.id))

      const espMap = new Map<string, string[]>()
      espAll.data?.forEach((e: { tecnico_id: string; especialidad: string }) => {
        const arr = espMap.get(e.tecnico_id) ?? []
        espMap.set(e.tecnico_id, [...arr, e.especialidad])
      })

      setCandidatos(verificados.map((t: { id: string; nombre_completo: string; whatsapp: string; ciudad_pueblo: string; estado_verificacion: string }) => ({
        ...t,
        especialidades: espMap.get(t.id) ?? [],
      })))
      return
    }

    steps.push({
      step: 'Filtro: ciudad',
      status: 'pass',
      detail: `${enCiudad.length} tecnico(s) en "${sol.ciudad_pueblo}": ${enCiudad.map((t: { nombre_completo: string }) => t.nombre_completo).join(', ')}`,
    })

    // Load especialidades for candidates
    const espData = await supabase
      .from('especialidades_tecnico')
      .select('tecnico_id, especialidad')
      .in('tecnico_id', enCiudad.map((t: { id: string }) => t.id))

    const espMap = new Map<string, string[]>()
    espData.data?.forEach((e: { tecnico_id: string; especialidad: string }) => {
      const arr = espMap.get(e.tecnico_id) ?? []
      espMap.set(e.tecnico_id, [...arr, e.especialidad])
    })

    setCandidatos(enCiudad.map((t: { id: string; nombre_completo: string; whatsapp: string; ciudad_pueblo: string; estado_verificacion: string }) => ({
      ...t,
      especialidades: espMap.get(t.id) ?? [],
    })))

    setDiagnostics(steps)
  }

  useEffect(() => {
    const cargar = async () => {
      setCargando(true)

      // 1. Fetch solicitud
      const { data: sol } = await supabase
        .from('solicitudes_servicio')
        .select('*')
        .eq('id', id)
        .single()

      if (!sol) {
        setCargando(false)
        return
      }

      setSolicitud({ ...sol, estado: sol.estado ?? 'pendiente' })

      // 2. Fetch assigned técnico if any
      if (sol.tecnico_asignado_id) {
        const { data: tec } = await supabase
          .from('tecnicos')
          .select('id, nombre_completo, whatsapp, ciudad_pueblo, estado_verificacion')
          .eq('id', sol.tecnico_asignado_id)
          .single()

        if (tec) {
          const { data: esp } = await supabase
            .from('especialidades_tecnico')
            .select('especialidad')
            .eq('tecnico_id', tec.id)

          setTecnicoAsignado({
            ...tec,
            especialidades: esp?.map((e: { especialidad: string }) => e.especialidad) ?? [],
          })
        }
      }

      // 3. Fetch notifications
      const { data: notifs } = await supabase
        .from('notificaciones_whatsapp')
        .select('id, tecnico_id, estado, enviado_at, respondido_at')
        .eq('solicitud_id', id)
        .order('enviado_at', { ascending: false })

      if (notifs && notifs.length > 0) {
        const tecIds = [...new Set(notifs.map((n: { tecnico_id: string }) => n.tecnico_id))]
        const { data: tecs } = await supabase
          .from('tecnicos')
          .select('id, nombre_completo')
          .in('id', tecIds)

        const nameMap = new Map<string, string>()
        tecs?.forEach((t: { id: string; nombre_completo: string }) => nameMap.set(t.id, t.nombre_completo))

        setNotificaciones(notifs.map((n: Notificacion) => ({
          ...n,
          tecnico_nombre: nameMap.get(n.tecnico_id),
        })))
      }

      // 4. Fetch evidence if exists
      const { data: evData } = await supabase
        .from('evidencias_servicio')
        .select('id, fotos, checklist, firma_url, gps_lat, gps_lng, completado_at, confirmado, confirmado_at, cliente_comentario, oath_firma, oath_firmado_at')
        .eq('solicitud_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (evData) setEvidencia(evData)

      // 5. Eventos del audit log: notas (tipo nota_admin) + historial de
      //    cambios de estado (resto de tipos con transición real).
      const { data: eventosData } = await supabase
        .from('solicitud_eventos')
        .select('id, tipo, estado_previo, estado_nuevo, actor, motivo, payload, ocurrido_at')
        .eq('solicitud_id', id)
        .order('ocurrido_at', { ascending: false })
      const eventos: EventoSolicitud[] = eventosData ?? []
      setNotas(eventos.filter(e => e.tipo === 'nota_admin'))
      setHistorial(eventos.filter(e => e.tipo !== 'nota_admin' && e.estado_previo !== e.estado_nuevo))

      // 6. Run matching diagnostics
      await runDiagnostics(sol)

      setCargando(false)
    }

    cargar()
  }, [id])

  // Polling mientras esperamos acción del cliente: si la solicitud está en
  // pendiente_horario (o sin_agendar tras timeout) y admin tiene la página
  // abierta, refrescamos cada 10s para que el botón "Selección de horario
  // al cliente" pase a "Notificar técnicos" en cuanto el cliente confirme
  // su horario en el webview — sin necesidad de F5.
  //
  // Nota: solo refrescamos los campos que afectan el botón (estado +
  // horario_confirmado_at + tecnico_asignado_id + reagendamientos_count), no
  // toda la página. Pollea mientras el servicio esté ACTIVO (no terminal):
  // así si el cliente reagenda desde /servicio/{cliente_token} el admin lo ve
  // sin recargar manualmente. Antes solo polleaba en pendiente_horario/
  // sin_agendar y por eso al reagendar en estado notificada/asignada/etc el
  // admin se quedaba con el horario viejo en pantalla.
  useEffect(() => {
    if (!solicitud) return
    const estadosTerminales = new Set([
      'completada', 'en_disputa', 'cancelada', 'cancelada_cliente',
      'finalizado_sin_reparacion', 'cotizacion_rechazada', 'sin_agendar',
      'no_show_cliente',
    ])
    if (estadosTerminales.has(solicitud.estado)) return

    const intervalo = setInterval(async () => {
      const { data: fresca } = await supabase
        .from('solicitudes_servicio')
        .select('estado, horario_confirmado, horario_confirmado_at, tecnico_asignado_id, reagendamientos_count, ultimo_reagendado_at')
        .eq('id', id)
        .single()

      if (!fresca) return

      const cambio =
        fresca.estado !== solicitud.estado ||
        fresca.horario_confirmado !== solicitud.horario_confirmado ||
        fresca.horario_confirmado_at !== solicitud.horario_confirmado_at ||
        fresca.tecnico_asignado_id !== solicitud.tecnico_asignado_id ||
        (fresca.reagendamientos_count ?? 0) !== (solicitud.reagendamientos_count ?? 0)

      if (cambio) {
        setSolicitud(prev => (prev ? { ...prev, ...fresca } : prev))
      }
    }, 10000)

    return () => clearInterval(intervalo)
  }, [id, solicitud])

  if (cargando) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (!solicitud) {
    return (
      <div className="p-8">
        <p className="text-gray-500">Solicitud no encontrada</p>
        <Link href="/admin/solicitudes" className="text-blue-600 text-sm mt-2 inline-block">← Volver</Link>
      </div>
    )
  }

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      {/* Breadcrumb */}
      <Link href="/admin/solicitudes" className="text-sm text-gray-500 hover:text-gray-700 transition-colors mb-4 inline-block">
        ← Solicitudes
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Solicitud #{solicitud.id.slice(0, 8)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Creada el {new Date(solicitud.created_at).toLocaleString('es-CO')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDescargarResumen}
            disabled={exportando}
            className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Descarga un Excel con cliente, técnico, evidencias, fotos, eventos y GPS de esta solicitud"
          >
            {exportando ? 'Generando…' : '📥 Descargar resumen'}
          </button>
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${ESTADO_ESTILOS[solicitud.estado] ?? 'bg-gray-100 text-gray-600'}`}>
            {ESTADO_LABELS[solicitud.estado] ?? solicitud.estado}
          </span>
        </div>
      </div>

      {errorExport && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
          {errorExport}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Client info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Datos del cliente</h2>
            <button
              type="button"
              onClick={abrirEdicion}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50"
              title="Editar horario, dirección, ciudad o zona. Queda registrado en el audit."
            >
              ✏️ Editar
            </button>
          </div>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-gray-500">Nombre</dt>
              <dd className="text-sm font-medium text-slate-900">{solicitud.cliente_nombre}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">WhatsApp</dt>
              <dd className="text-sm font-medium text-slate-900">{solicitud.cliente_telefono}</dd>
            </div>
            {solicitud.cliente_token && (
              <div>
                <dt className="text-xs text-gray-500">Portal cliente (cancelar/reagendar)</dt>
                <dd className="text-xs font-mono text-slate-700 bg-gray-50 p-2 rounded-lg break-all">
                  /servicio/{solicitud.cliente_token}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-gray-500">Direccion</dt>
              <dd className="text-sm text-slate-900">{solicitud.direccion}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-gray-500">Ciudad</dt>
                <dd className="text-sm font-medium text-slate-900">{solicitud.ciudad_pueblo}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Zona</dt>
                <dd className="text-sm text-slate-900">{solicitud.zona_servicio}</dd>
              </div>
            </div>
          </dl>
        </div>

        {/* Equipment info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Equipo y servicio</h2>
            <button
              type="button"
              onClick={abrirEdicion}
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50"
              title="Editar tipo de equipo, horario, dirección, ciudad o zona. Queda registrado en el audit."
            >
              ✏️ Editar
            </button>
          </div>
          <dl className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-gray-500">Tipo de equipo</dt>
                <dd className="text-sm font-medium text-slate-900">{solicitud.tipo_equipo}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Marca</dt>
                <dd className="text-sm font-medium text-slate-900">{solicitud.marca_equipo}</dd>
              </div>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Tipo de solicitud</dt>
              <dd className="text-sm text-slate-900">{solicitud.tipo_solicitud}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Problema reportado</dt>
              <dd className="text-sm text-slate-900 bg-gray-50 rounded-lg p-3">{solicitud.novedades_equipo}</dd>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-gray-500">
                  {solicitud.es_garantia ? 'Pago al técnico' : 'Valor al cliente'}
                </dt>
                <dd className="text-sm font-bold text-green-700">
                  {solicitud.es_garantia
                    ? solicitud.pago_tecnico && solicitud.pago_tecnico > 0
                      ? `$${formatCOP(solicitud.pago_tecnico)} COP`
                      : (
                        <>
                          <span className="text-xs font-medium text-gray-500 mr-1">desde</span>
                          ${formatCOP(PAGO_MINIMO_TECNICO_GARANTIA)} COP
                        </>
                      )
                    : (
                      <>
                        ${formatCOP(precioClienteServicio(
                          solicitud.tipo_equipo,
                          solicitud.tipo_solicitud,
                          solicitud.es_garantia,
                          (solicitud as unknown as { cotizacion?: { total?: number | null } | null }).cotizacion,
                        ))} COP
                        {/* Neto que recibe el técnico (catálogo ÷ 1.309 o costo cotizado). */}
                        <span className="block text-xs font-normal text-gray-500 mt-0.5">
                          Pago al técnico (neto): ${formatCOP(solicitud.pago_tecnico)} COP
                        </span>
                      </>
                    )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Garantia</dt>
                <dd className="text-sm text-slate-900">{solicitud.es_garantia ? `Si — ${solicitud.numero_serie_factura}` : 'No'}</dd>
              </div>
            </div>
            {solicitud.horario_confirmado && (
              <div className="border-l-4 border-emerald-500 bg-emerald-50 rounded-r-lg p-3">
                <dt className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  {solicitud.reagendamientos_count && solicitud.reagendamientos_count > 0
                    ? `Horario actualizado (reagendado ${solicitud.reagendamientos_count}×)`
                    : 'Horario confirmado'}
                </dt>
                <dd className="text-sm font-bold text-emerald-900 mt-0.5">{solicitud.horario_confirmado}</dd>
                {solicitud.horario_confirmado_at && (
                  <p className="text-[11px] text-emerald-700/70 mt-1">
                    {solicitud.ultimo_reagendado_at
                      ? `Último cambio: ${new Date(solicitud.ultimo_reagendado_at).toLocaleString('es-CO')}`
                      : `Confirmado: ${new Date(solicitud.horario_confirmado_at).toLocaleString('es-CO')}`}
                  </p>
                )}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-gray-500">
                  {solicitud.horario_confirmado ? 'Opción 1 (original)' : 'Horario 1'}
                </dt>
                <dd className="text-sm text-slate-900">{solicitud.horario_visita_1 || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">
                  {solicitud.horario_confirmado ? 'Opción 2 (original)' : 'Horario 2'}
                </dt>
                <dd className="text-sm text-slate-900">{solicitud.horario_visita_2 || '—'}</dd>
              </div>
            </div>
          </dl>
        </div>

        {/* Diagnosis & Fault Code — visible para warranty Y particular cuando hay diagnóstico */}
        {(() => {
          const triaje = (solicitud as unknown as Record<string, unknown>).triaje_resultado as Record<string, unknown> | null
          const cotizacion = (solicitud as unknown as Record<string, unknown>).cotizacion as Record<string, unknown> | null
          if (!triaje?.diagnostico_tecnico) return null

          // Productos vienen de triaje_resultado (siempre poblado) con fallback a cotizacion.
          type ProdNec = { sku: string; descripcion: string; cantidad: number; precio_unitario?: number; subtotal?: number; imagen_url?: string }
          type ProdRec = { nombre: string; descripcion: string }
          const productosNec = (triaje.productos_necesarios as ProdNec[] | undefined)
            ?? (cotizacion?.productos_necesarios as ProdNec[] | undefined)
            ?? []
          const productosRec = (triaje.productos_recomendados as ProdRec[] | undefined)
            ?? (cotizacion?.productos_recomendados as ProdRec[] | undefined)
            ?? []

          return (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Diagnostico del tecnico</h2>

              {/* Fault code badge (warranty only) */}
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

              <dl className="space-y-3 mb-4">
                <div>
                  <dt className="text-xs text-gray-500">Diagnostico</dt>
                  <dd className="text-sm text-slate-900 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{String(triaje.diagnostico_tecnico)}</dd>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {!!triaje.complejidad && (
                    <div>
                      <dt className="text-xs text-gray-500">Complejidad</dt>
                      <dd className="text-sm font-medium text-slate-900">
                        {String(triaje.complejidad)}
                        {triaje.codigo_complejidad ? ` (Cod. ${String(triaje.codigo_complejidad)})` : ''}
                      </dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-xs text-gray-500">Diagnosticado</dt>
                    <dd className="text-sm text-slate-900">{triaje.diagnosticado_at ? new Date(String(triaje.diagnosticado_at)).toLocaleString('es-CO') : '—'}</dd>
                  </div>
                  {!!triaje.siguiente_paso && (
                    <div>
                      <dt className="text-xs text-gray-500">Siguiente paso</dt>
                      <dd className="text-sm font-medium text-slate-900">{String(triaje.siguiente_paso)}</dd>
                    </div>
                  )}
                </div>
                {/* Legacy field — solo si no hay productos_necesarios (cotizaciones viejas) */}
                {!productosNec.length && !!triaje.repuestos_detalle && (
                  <div>
                    <dt className="text-xs text-gray-500">Repuestos (legacy)</dt>
                    <dd className="text-sm text-slate-900 bg-gray-50 rounded-lg p-2">{String(triaje.repuestos_detalle)}</dd>
                  </div>
                )}
              </dl>

              {/* Productos necesarios — visibles siempre */}
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  🔧 Productos necesarios {productosNec.length > 0 && `(${productosNec.length})`}
                </h3>
                {productosNec.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">El técnico no listó productos necesarios.</p>
                ) : (
                  <div className="space-y-2">
                    {productosNec.map((p, i) => {
                      const tienePrecio = typeof p.precio_unitario === 'number' && p.precio_unitario > 0
                      return (
                        <div key={`${p.sku}-${i}`} className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-3">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-mono text-sm font-bold text-fuchsia-900">{p.sku}</span>
                                <span className="text-xs text-fuchsia-700 bg-white px-2 py-0.5 rounded-full">cantidad: {p.cantidad}</span>
                              </div>
                              <p className="text-sm text-slate-800">{p.descripcion}</p>
                              {p.imagen_url && (
                                <a href={p.imagen_url} target="_blank" rel="noopener noreferrer" className="inline-block mt-2">
                                  <Image
                                    src={p.imagen_url}
                                    alt={`Foto ${p.sku}`}
                                    width={88}
                                    height={88}
                                    className="w-[88px] h-[88px] object-cover rounded-lg border border-fuchsia-200 hover:opacity-90 transition"
                                    unoptimized
                                  />
                                </a>
                              )}
                            </div>
                            {tienePrecio && (
                              <div className="text-right shrink-0">
                                <p className="text-xs text-gray-500">Precio unitario</p>
                                <p className="text-sm font-semibold text-slate-900">${formatCOP(p.precio_unitario ?? 0)}</p>
                                {typeof p.subtotal === 'number' && p.subtotal > 0 && (
                                  <p className="text-xs text-gray-600">Subtotal: ${formatCOP(p.subtotal)}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Productos recomendados — visibles siempre */}
              <div>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  ✨ Productos recomendados {productosRec.length > 0 && `(${productosRec.length})`}
                </h3>
                {productosRec.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Sin recomendaciones.</p>
                ) : (
                  <ul className="text-sm text-slate-700 space-y-1 list-disc list-inside bg-blue-50 rounded-xl p-3 border border-blue-100">
                    {productosRec.map((p, i) => (
                      <li key={i}>
                        <span className="font-semibold text-slate-900">{p.nombre}</span>
                        {p.descripcion && <span className="text-gray-600"> — {p.descripcion}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )
        })()}

        {/* Assigned técnico */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Tecnico asignado</h2>
          {tecnicoAsignado ? (
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-gray-500">Nombre</dt>
                <dd className="text-sm font-medium text-slate-900">{tecnicoAsignado.nombre_completo}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">WhatsApp</dt>
                <dd className="text-sm text-slate-900">{tecnicoAsignado.whatsapp}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Ciudad</dt>
                <dd className="text-sm text-slate-900">{tecnicoAsignado.ciudad_pueblo}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Especialidades</dt>
                <dd className="flex flex-wrap gap-1 mt-1">
                  {tecnicoAsignado.especialidades.map(e => (
                    <span key={e} className="text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{e}</span>
                  ))}
                </dd>
              </div>
              <Link
                href={`/admin/tecnicos/${tecnicoAsignado.id}`}
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 transition-colors inline-block mt-2"
              >
                Ver perfil del tecnico →
              </Link>
            </dl>
          ) : (
            <p className="text-sm text-gray-400">Ningun tecnico ha aceptado esta solicitud aun.</p>
          )}
        </div>

        {/* WhatsApp notifications */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Notificaciones WhatsApp</h2>
          {notificaciones.length === 0 ? (
            <p className="text-sm text-gray-400">No se enviaron notificaciones para esta solicitud.</p>
          ) : (
            <div className="space-y-3">
              {notificaciones.map((n) => (
                <div key={n.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{n.tecnico_nombre ?? n.tecnico_id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-400">Enviado: {new Date(n.enviado_at).toLocaleString('es-CO')}</p>
                    {n.respondido_at && (
                      <p className="text-xs text-gray-400">Respuesta: {new Date(n.respondido_at).toLocaleString('es-CO')}</p>
                    )}
                  </div>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${NOTIF_ESTILOS[n.estado] ?? 'bg-gray-100 text-gray-600'}`}>
                    {n.estado}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cambiar fecha de servicio — calendario (fecha + franja). Materializa
          fecha_visita_at (aparece en la vista Calendario de /admin/solicitudes) y
          notifica a cliente, técnico y supervisores. Vía /api/admin/reagendar-solicitud.
          Reemplaza la edición de horario por texto libre (que no avisaba ni
          cargaba el calendario). El admin puede forzar fechas/franjas (con aviso). */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Cambiar fecha de servicio
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Elegí la nueva fecha y franja en el calendario. Al guardar se{' '}
          <strong>notifica por WhatsApp</strong> al cliente, al técnico asignado y a
          los supervisores con visibilidad del servicio, y la fecha queda cargada en
          la vista <strong>Calendario</strong>. Podés forzar fechas cercanas o franjas
          llenas (se avisa, no se bloquea).
        </p>
        {solicitud.horario_confirmado && (
          <p className="text-xs text-gray-500 mb-3">
            Fecha actual:{' '}
            <span className="font-semibold text-slate-800">{solicitud.horario_confirmado}</span>
          </p>
        )}
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">📅 Nueva fecha</span>
            <input
              type="date"
              value={fechaReagenda}
              min={fechaColombiaYMD()}
              onChange={(e) => setFechaReagenda(e.target.value)}
              className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            {fechaReagenda && (
              <span className="block text-[11px] text-gray-500 mt-1 capitalize">
                {formatFechaLargaLocal(fechaReagenda)}
              </span>
            )}
          </label>
          <div className="flex-1">
            <span className="block text-xs font-semibold text-gray-700 mb-1">🕒 Franja horaria</span>
            <div className="grid grid-cols-2 gap-2 max-w-md">
              {FRANJAS_HORARIO.map(f => {
                const llena = franjasLlenasReagenda.includes(f.value)
                const sel = franjaReagenda === f.value
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFranjaReagenda(f.value)}
                    className={`p-2.5 rounded-lg border-2 text-left transition ${
                      sel ? 'border-blue-600 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="text-base leading-none">{f.icon}</div>
                    <div className="text-xs font-medium text-gray-900 mt-1">{f.label}</div>
                    {llena && <div className="text-[10px] font-semibold text-red-500 mt-0.5">Cupo lleno — forzar</div>}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
        <label className="block mt-4 max-w-md">
          <span className="block text-xs font-semibold text-gray-700 mb-1">Motivo (opcional)</span>
          <input
            type="text"
            value={motivoReagenda}
            onChange={(e) => setMotivoReagenda(e.target.value)}
            placeholder="Ej: Cliente pidió cambio por teléfono"
            className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          />
        </label>
        <div className="mt-4 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={handleReagendar}
            disabled={reagendando || !fechaReagenda || !franjaReagenda}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {reagendando ? 'Reprogramando…' : '📅 Reprogramar y notificar'}
          </button>
          <span className="text-[11px] text-gray-400">
            A supervisores les llega vía la plantilla <code>supervisor_reagendamiento_v1</code> (requiere aprobación de Meta).
          </span>
        </div>
        {resultadoReagenda && (
          <div className={`mt-3 rounded-lg p-3 text-sm ${
            resultadoReagenda.ok
              ? 'bg-green-50 border border-green-200 text-green-900'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}>
            {resultadoReagenda.ok ? '✅ ' : '⚠️ '}{resultadoReagenda.mensaje}
          </div>
        )}
      </div>

      {/* Full photo gallery — todas las fotos del flujo en un solo lugar.
          Junta evidencias_diagnostico (de triaje_resultado / cotizacion) +
          fotos de completación + firma del técnico (oath) + firma del cliente.
          Cada foto se renderiza con etiqueta de fase para que el admin sepa
          de dónde viene (diagnóstico vs completación). */}
      {(() => {
        const triaje = (solicitud as unknown as Record<string, unknown>).triaje_resultado as Record<string, unknown> | null
        const cotizacion = (solicitud as unknown as Record<string, unknown>).cotizacion as Record<string, unknown> | null
        const diagFotosTriaje = (triaje?.evidencias_diagnostico as string[] | undefined) ?? []
        const diagFotosCot = (cotizacion?.evidencias_diagnostico as string[] | undefined) ?? []
        // Dedup en caso de que el mismo url esté en ambos (suele pasar en particular).
        const diagFotos = Array.from(new Set([...diagFotosTriaje, ...diagFotosCot]))
        const compFotos = evidencia?.fotos ?? []
        const total = diagFotos.length + compFotos.length + (evidencia?.oath_firma ? 1 : 0) + (evidencia?.firma_url ? 1 : 0)
        if (total === 0) return null

        return (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              Galería completa del servicio ({total})
            </h2>

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
                        <p className="text-[10px] text-gray-400 mt-1">{new Date(evidencia.oath_firmado_at).toLocaleString('es-CO')}</p>
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
          </div>
        )
      })()}

      {/* Service evidence */}
      {evidencia && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            Evidencia del servicio
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Photos */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 mb-2">Fotos ({evidencia.fotos.length})</h3>
              <div className="grid grid-cols-3 gap-2">
                {evidencia.fotos.map((url, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                    <Image src={url} alt={`Evidencia ${i + 1}`} fill className="object-cover" />
                  </div>
                ))}
              </div>
            </div>

            {/* Checklist + details */}
            <div className="space-y-4">
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

              {/* Signature */}
              {evidencia.firma_url && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 mb-2">Firma del cliente</h3>
                  <div className="relative h-20 bg-white border border-gray-200 rounded-lg overflow-hidden">
                    <Image src={evidencia.firma_url} alt="Firma" fill className="object-contain" />
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="text-xs text-gray-400 space-y-1">
                <p>Completado: {new Date(evidencia.completado_at).toLocaleString('es-CO')}</p>
                {evidencia.gps_lat && evidencia.gps_lng && (
                  <p>GPS: {evidencia.gps_lat.toFixed(5)}, {evidencia.gps_lng.toFixed(5)}</p>
                )}
              </div>

              {/* Customer confirmation status */}
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
                  <p className="text-xs text-gray-500 mt-1">
                    {new Date(evidencia.confirmado_at).toLocaleString('es-CO')}
                  </p>
                )}
                {evidencia.cliente_comentario && (
                  <p className="text-xs mt-2 bg-white rounded p-2 text-gray-700">
                    {evidencia.cliente_comentario}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Re-send WhatsApp notification — gateado por horario_confirmado_at */}
      {(() => {
        // GUARD: el flujo siempre arranca con el cliente eligiendo horario.
        // Mientras horario_confirmado_at sea NULL (o el estado sea sin_agendar
        // tras timeout), reenviar significa pedirle al cliente que defina
        // fecha — NUNCA notificar técnicos. Esta UI refleja el guard que
        // /api/whatsapp/notify aplica server-side.
        const necesitaHorarioCliente =
          !solicitud.horario_confirmado_at || solicitud.estado === 'sin_agendar'

        const titulo = necesitaHorarioCliente
          ? 'Reenviar selección de horario al cliente'
          : 'Reenviar notificación WhatsApp a técnicos'
        const descripcion = necesitaHorarioCliente
          ? solicitud.estado === 'sin_agendar'
            ? 'La solicitud expiró. Al reenviar, se reactivará a pendiente_horario y el cliente recibirá la plantilla para elegir fecha y franja horaria. Los técnicos NO se notifican hasta que el cliente confirme.'
            : 'El cliente aún no ha confirmado horario. Mientras eso no pase no se puede notificar a técnicos — al reenviar se le envía la plantilla de selección de horario.'
          : 'El cliente ya confirmó horario. Esto envía de nuevo la oferta a los técnicos compatibles.'
        const labelBoton = necesitaHorarioCliente
          ? 'Enviar selección de horario al cliente'
          : 'Notificar técnicos'

        return (
          <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              {titulo}
            </h2>
            <p className="text-xs text-gray-500 mb-3">{descripcion}</p>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={async () => {
                  setReenviando(true)
                  setReenvioResult(null)
                  try {
                    const { data: { session } } = await supabase.auth.getSession()
                    if (!session) {
                      setReenvioResult({ error: 'Sesión expirada. Inicia sesión de nuevo.' })
                      setReenviando(false)
                      return
                    }
                    const res = await fetch('/api/whatsapp/notify', {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${session.access_token}`,
                      },
                      body: JSON.stringify({ solicitudId: id }),
                    })
                    const data = await res.json()
                    setReenvioResult(data)

                    // Refrescar la fila para que el botón refleje el estado
                    // post-acción (e.g., sin_agendar → pendiente_horario tras
                    // revivir, o notificada tras cliente confirma).
                    const { data: fresca } = await supabase
                      .from('solicitudes_servicio')
                      .select('estado, horario_confirmado, horario_confirmado_at, tecnico_asignado_id')
                      .eq('id', id)
                      .single()
                    if (fresca) {
                      setSolicitud(prev => (prev ? { ...prev, ...fresca } : prev))
                    }
                  } catch (e) {
                    setReenvioResult({ error: e instanceof Error ? e.message : String(e) })
                  }
                  setReenviando(false)
                }}
                disabled={reenviando}
                className={`px-4 py-2 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                  necesitaHorarioCliente
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {reenviando ? 'Enviando...' : labelBoton}
              </button>

              {solicitud.estado === 'asignada' && (
                <span className="text-xs text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded-lg">
                  Esta solicitud ya fue asignada. Si reenvia, solo se notificara pero no se reasignara.
                </span>
              )}
            </div>

        {reenvioResult && (
          <div className={`mt-4 rounded-lg p-4 ${
            reenvioResult.error
              ? 'bg-red-50 border border-red-200'
              : (reenvioResult.notificados as number) > 0
                ? 'bg-green-50 border border-green-200'
                : 'bg-yellow-50 border border-yellow-200'
          }`}>
            <p className={`text-sm font-semibold mb-2 ${
              reenvioResult.error ? 'text-red-800' :
              (reenvioResult.notificados as number) > 0 ? 'text-green-800' :
              'text-yellow-800'
            }`}>
              {reenvioResult.error
                ? 'Error al enviar'
                : (reenvioResult.mensaje as string) ?? 'Resultado'}
            </p>

            {!reenvioResult.error && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="text-xs">
                  <span className="text-gray-500">Tecnicos encontrados:</span>{' '}
                  <span className="font-semibold">{String(reenvioResult.matched ?? 0)}</span>
                </div>
                <div className="text-xs">
                  <span className="text-gray-500">Notificados exitosamente:</span>{' '}
                  <span className="font-semibold">{String(reenvioResult.notificados ?? 0)}</span>
                </div>
              </div>
            )}

            {(reenvioResult.diagnostico as string[])?.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-semibold text-amber-700 mb-1">Diagnostico:</p>
                {(reenvioResult.diagnostico as string[]).map((d: string, i: number) => (
                  <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1 break-all">{d}</p>
                ))}
              </div>
            )}

            <details className="mt-3">
              <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">Ver respuesta JSON completa</summary>
              <pre className="text-xs bg-gray-100 rounded p-3 mt-2 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(reenvioResult, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
        )
      })()}

      {/* Reenviar último mensaje del flujo — herramienta de recuperación */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Reenviar último mensaje del flujo
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Si algo no llegó al cliente o al técnico (test mode, ventana 24h cerrada,
          error transitorio de Meta), este botón re-envía la plantilla que
          corresponde al estado actual.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={async () => {
              setReenviandoUltimo(true)
              setUltimoResult(null)
              try {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session) {
                  setUltimoResult({ error: 'Sesión expirada. Inicia sesión de nuevo.' })
                  setReenviandoUltimo(false)
                  return
                }
                const res = await fetch('/api/admin/reenviar-ultimo-mensaje', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${session.access_token}`,
                  },
                  body: JSON.stringify({ solicitudId: id }),
                })
                const data = await res.json()
                setUltimoResult(data)
              } catch (e) {
                setUltimoResult({ error: e instanceof Error ? e.message : String(e) })
              }
              setReenviandoUltimo(false)
            }}
            disabled={reenviandoUltimo}
            className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {reenviandoUltimo ? 'Reenviando...' : '↻ Reenviar último mensaje'}
          </button>
          <span className="text-xs text-gray-500">Estado actual: <span className="font-mono">{solicitud.estado}</span></span>
        </div>

        {ultimoResult && (
          <div className={`mt-3 rounded-lg p-3 text-sm ${
            ultimoResult.ok
              ? 'bg-green-50 border border-green-200 text-green-900'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}>
            <p className="font-semibold mb-1">
              {ultimoResult.ok ? '✅ Enviado' : '⚠️ No enviado'} — {String(ultimoResult.accion ?? '')}
            </p>
            {ultimoResult.destinatario ? (
              <p className="text-xs">Destinatario: <strong>{String(ultimoResult.destinatario)}</strong></p>
            ) : null}
            {ultimoResult.mensaje ? (
              <p className="text-xs mt-1">{String(ultimoResult.mensaje)}</p>
            ) : null}
            {ultimoResult.error ? (
              <p className="text-xs mt-1 font-mono">{String(ultimoResult.error)}</p>
            ) : null}
            {ultimoResult.filtered ? (
              <p className="text-xs mt-1 bg-red-100 text-red-900 px-2 py-1 rounded font-semibold">
                ⚠️ Filtrado por BAIRD_TEST_PHONE_WHITELIST — revisar env vars de Vercel
              </p>
            ) : null}
          </div>
        )}
      </div>

      {/* Actualizar valor del servicio — solo flujo particular con cotización.
          Sobreescribe cotizacion.total, reabre la aprobación (estado →
          cotizacion_enviada) y le avisa al cliente por WhatsApp
          (plantilla valor_actualizado_cliente_v1). NO toca pago_tecnico.
          Vía /api/admin/actualizar-valor. */}
      {(() => {
        if (solicitud.es_garantia) return null
        const cot = (solicitud as unknown as Record<string, unknown>).cotizacion as
          | { total?: number; token?: string }
          | null
        if (!cot?.token) return null
        const valorActual = typeof cot.total === 'number' ? cot.total : 0
        return (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Actualizar valor del servicio
            </h2>
            <p className="text-xs text-gray-500 mb-3">
              Ajusta el valor que paga el <strong>cliente</strong> por este servicio
              particular. Reabre la aprobación (estado → <strong>Cotización
              enviada</strong>) y le envía un WhatsApp al cliente con el nuevo valor
              para que lo confirme. No modifica el pago al técnico.
            </p>
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-lg">
              <span className="text-xs text-gray-500">Valor actual:</span>
              <span className="text-sm font-semibold text-gray-900">
                ${valorActual.toLocaleString('es-CO')} COP
              </span>
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1">Nuevo valor (COP)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={nuevoValorInput}
                  onChange={(e) => setNuevoValorInput(e.target.value)}
                  placeholder="Ej: 430000"
                  className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </label>
              <label className="block flex-1 min-w-[200px]">
                <span className="block text-xs font-semibold text-gray-700 mb-1">Motivo (opcional)</span>
                <input
                  type="text"
                  value={motivoValor}
                  onChange={(e) => setMotivoValor(e.target.value)}
                  placeholder="Ej: Se sumó repuesto adicional"
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500"
                />
              </label>
              <button
                onClick={handleActualizarValor}
                disabled={actualizandoValor}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {actualizandoValor ? 'Guardando...' : 'Guardar y notificar'}
              </button>
            </div>

            {resultadoValor && (
              <div className={`mt-3 rounded-lg p-3 text-sm ${
                resultadoValor.ok
                  ? 'bg-green-50 border border-green-200 text-green-900'
                  : 'bg-amber-50 border border-amber-200 text-amber-900'
              }`}>
                {resultadoValor.ok ? '✅ ' : '⚠️ '}{resultadoValor.mensaje}
              </div>
            )}
          </div>
        )
      })()}

      {/* Pedir repuestos en garantía — avisa a los supervisores con visibilidad
          de la marca (SKU, modelo, No. de garantía, dirección y diagnóstico del
          técnico). Solo garantía. NO cambia estado.
          Vía /api/admin/pedir-repuesto-supervisores. */}
      {solicitud.es_garantia && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Pedir repuestos en garantía
          </h2>
          <p className="text-xs text-gray-500 mb-3">
            Envía a los supervisores con <strong>visibilidad de la marca</strong> de
            este servicio el pedido de repuesto con todo lo necesario para
            gestionarlo ante la marca: <strong>SKU, modelo, No. de garantía,
            dirección del cliente y el diagnóstico del técnico</strong>. No cambia el
            estado de la solicitud.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={async () => {
                setPidiendoRepuesto(true)
                setResultadoRepuesto(null)
                try {
                  const { data: { session } } = await supabase.auth.getSession()
                  if (!session) {
                    setResultadoRepuesto({ ok: false, mensaje: 'Sesión expirada. Inicia sesión de nuevo.' })
                    setPidiendoRepuesto(false)
                    return
                  }
                  const res = await fetch('/api/admin/pedir-repuesto-supervisores', {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      Authorization: `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({ solicitudId: id }),
                  })
                  const data = await res.json()
                  setResultadoRepuesto({ ok: !!data.ok, mensaje: data.mensaje ?? data.error ?? 'Sin respuesta' })
                } catch (e) {
                  setResultadoRepuesto({ ok: false, mensaje: e instanceof Error ? e.message : String(e) })
                }
                setPidiendoRepuesto(false)
              }}
              disabled={pidiendoRepuesto}
              className="px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {pidiendoRepuesto ? 'Enviando...' : '📦 Pedir repuesto a supervisores'}
            </button>
            <span className="text-xs text-gray-500">
              Los SKU se toman de los repuestos registrados en la solicitud.
            </span>
          </div>

          {resultadoRepuesto && (
            <div className={`mt-3 rounded-lg p-3 text-sm ${
              resultadoRepuesto.ok
                ? 'bg-green-50 border border-green-200 text-green-900'
                : 'bg-amber-50 border border-amber-200 text-amber-900'
            }`}>
              {resultadoRepuesto.ok ? '✅ ' : '⚠️ '}{resultadoRepuesto.mensaje}
            </div>
          )}
        </div>
      )}

      {/* Cambiar estado manualmente — herramienta de recuperación.
          Para destrabar una solicitud cuando el flujo automático no avanzó
          (p. ej. el técnico o el cliente perdió señal y la transición nunca
          se disparó). Toda transición queda en solicitud_eventos via
          /api/admin/cambiar-estado. NO envía WhatsApp. */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Cambiar estado manualmente
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Fuerza el estado de la solicitud cuando el flujo quedó atascado (por
          ejemplo, el técnico o el cliente perdió conexión y la transición
          automática nunca se disparó). <strong>No envía WhatsApp</strong> — si
          querés avisar al cliente o al técnico, usá &ldquo;Reenviar último
          mensaje&rdquo;. Todo cambio queda registrado en el audit log.
        </p>
        <div className="flex items-end gap-3 flex-wrap">
          <label className="block">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Nuevo estado</span>
            <select
              value={estadoSeleccionado || solicitud.estado}
              onChange={(e) => setEstadoSeleccionado(e.target.value)}
              className="border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            >
              {ESTADOS_VALIDOS.map((e) => (
                <option key={e} value={e}>
                  {(ESTADO_LABELS[e] ?? e)}{e === solicitud.estado ? ' (actual)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block flex-1 min-w-[200px]">
            <span className="block text-xs font-semibold text-gray-700 mb-1">Motivo (opcional)</span>
            <input
              type="text"
              value={motivoEstado}
              onChange={(e) => setMotivoEstado(e.target.value)}
              placeholder="Ej: Técnico completó pero perdió señal"
              className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
          </label>
          <button
            onClick={handleCambiarEstado}
            disabled={cambiandoEstado}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {cambiandoEstado ? 'Cambiando...' : 'Cambiar estado'}
          </button>
        </div>

        {resultadoEstado && (
          <div className={`mt-3 rounded-lg p-3 text-sm ${
            resultadoEstado.ok
              ? 'bg-green-50 border border-green-200 text-green-900'
              : 'bg-amber-50 border border-amber-200 text-amber-900'
          }`}>
            {resultadoEstado.ok ? '✅ ' : '⚠️ '}{resultadoEstado.mensaje}
          </div>
        )}
      </div>

      {/* Notas del administrador — notas internas + eventos nota_admin del
          audit log (ediciones de campos, avisos del sistema). Solo visibles
          en el panel; NO envían WhatsApp. Append-only via /api/admin/notas:
          una nota equivocada se corrige con otra nota. */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Notas del administrador
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Notas internas del equipo sobre este servicio. Solo se ven aquí — no
          se envía nada al cliente ni al técnico. Quedan en el audit log y no
          se pueden borrar; si te equivocas, agrega otra nota aclarando.
        </p>
        <div className="flex items-start gap-3 flex-wrap sm:flex-nowrap">
          <textarea
            value={nuevaNota}
            onChange={(e) => { setNuevaNota(e.target.value); if (errorNota) setErrorNota(null) }}
            placeholder="Ej: Repuesto solicitado a MABE el 12/06. Cliente pide que el técnico llame antes de ir."
            rows={2}
            maxLength={2000}
            className="w-full sm:flex-1 border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-y"
          />
          <button
            onClick={handleAgregarNota}
            disabled={guardandoNota || nuevaNota.trim().length === 0}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-sm font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
          >
            {guardandoNota ? 'Guardando...' : 'Guardar nota'}
          </button>
        </div>

        {errorNota && (
          <div className="mt-3 rounded-lg p-3 text-sm bg-amber-50 border border-amber-200 text-amber-900">
            ⚠️ {errorNota}
          </div>
        )}

        {notas.length === 0 ? (
          <p className="mt-4 text-sm text-gray-400">Sin notas todavía.</p>
        ) : (
          <div className="mt-4 space-y-2">
            {notas.map((n) => {
              const payload = n.payload ?? {}
              const esSistema = n.actor === 'sistema'
              const camposModificados = payload.campos_modificados as
                | Record<string, { previo: string | null; nuevo: string }>
                | undefined
              return (
                <div
                  key={n.id}
                  className={`rounded-lg border p-3 ${
                    esSistema ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-gray-200'
                  }`}
                >
                  <p className="text-sm text-slate-900 whitespace-pre-wrap">{n.motivo ?? '—'}</p>
                  {camposModificados && (
                    <ul className="mt-1 text-xs text-gray-500 list-disc list-inside">
                      {Object.entries(camposModificados).map(([campo, v]) => (
                        <li key={campo}>{campo}: “{v.previo ?? '—'}” → “{v.nuevo}”</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1.5 text-xs text-gray-400">
                    {esSistema ? '🤖 Sistema' : `✍️ ${n.actor ?? 'admin'}`} · {new Date(n.ocurrido_at).toLocaleString('es-CO')}
                  </p>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Historial de estados — cada transición con QUIÉN la disparó
          (cliente / técnico / admin / sistema). Fuente: solicitud_eventos.
          Los eventos 'cambio_estado' los inserta notificarCambioEstado con el
          actor inferido del par previo→nuevo (migración 20260612). Solicitudes
          anteriores a la migración solo muestran los eventos dedicados que ya
          existían (cancelaciones, cambios manuales del admin, reagendas). */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Historial de estados
        </h2>
        <p className="text-xs text-gray-500 mb-3">
          Cada cambio de estado de este servicio y quién lo disparó: el cliente
          (confirmó horario, aprobó pasos), el técnico (aceptó, diagnosticó,
          completó), un admin (acciones manuales) o el sistema (timeouts).
        </p>
        <div className="space-y-2">
          {historial.map((e) => {
            const badge = actorBadge(e.actor)
            return (
              <div key={e.id} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-slate-50 p-3">
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${badge.clase}`}>
                  {badge.label}
                </span>
                <div className="min-w-0">
                  <p className="text-sm text-slate-900">
                    {e.estado_previo ? (ESTADO_LABELS[e.estado_previo] ?? e.estado_previo) : '—'}
                    {' → '}
                    <span className="font-semibold">{e.estado_nuevo ? (ESTADO_LABELS[e.estado_nuevo] ?? e.estado_nuevo) : '—'}</span>
                    {e.tipo === 'cambio_estado_admin' && (
                      <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-purple-700">manual</span>
                    )}
                  </p>
                  {e.motivo && <p className="mt-0.5 text-xs text-gray-500">{e.motivo}</p>}
                  <p className="mt-0.5 text-xs text-gray-400">{new Date(e.ocurrido_at).toLocaleString('es-CO')}</p>
                </div>
              </div>
            )
          })}
          {/* Entrada sintética: creación de la solicitud (no hay evento en BD) */}
          <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-slate-50 p-3">
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold ${ACTOR_BADGES.cliente.clase}`}>
              {ACTOR_BADGES.cliente.label}
            </span>
            <div>
              <p className="text-sm text-slate-900">Solicitud creada</p>
              <p className="mt-0.5 text-xs text-gray-400">{new Date(solicitud.created_at).toLocaleString('es-CO')}</p>
            </div>
          </div>
        </div>
        {historial.length === 0 && (
          <p className="mt-3 text-xs text-gray-400">
            Las transiciones del flujo se registran desde la migración
            20260612_evento_cambio_estado — esta solicitud aún no tiene eventos
            de cambio de estado en el audit log.
          </p>
        )}
      </div>

      {/* Matching diagnostics */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 shadow-sm p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Diagnostico de matching
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Estos son los pasos que sigue el sistema para encontrar tecnicos compatibles con esta solicitud.
        </p>

        {diagnostics.length === 0 ? (
          <p className="text-sm text-gray-400">Cargando diagnostico...</p>
        ) : (
          <div className="space-y-3">
            {diagnostics.map((d, i) => (
              <div key={i} className={`flex items-start gap-3 p-3 rounded-lg ${
                d.status === 'pass' ? 'bg-green-50 border border-green-200' :
                d.status === 'fail' ? 'bg-red-50 border border-red-200' :
                'bg-yellow-50 border border-yellow-200'
              }`}>
                <span className="text-base shrink-0 mt-0.5">
                  {d.status === 'pass' ? '✅' : d.status === 'fail' ? '❌' : '⚠️'}
                </span>
                <div>
                  <p className={`text-sm font-semibold ${
                    d.status === 'pass' ? 'text-green-800' :
                    d.status === 'fail' ? 'text-red-800' :
                    'text-yellow-800'
                  }`}>
                    {d.step}
                  </p>
                  <p className={`text-xs mt-0.5 ${
                    d.status === 'pass' ? 'text-green-700' :
                    d.status === 'fail' ? 'text-red-700' :
                    'text-yellow-700'
                  }`}>
                    {d.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Candidate técnicos */}
        {candidatos.length > 0 && (
          <div className="mt-5">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Tecnicos candidatos (pasaron los filtros anteriores)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-2">Nombre</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-2">Ciudad</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-2">Estado</th>
                    <th className="text-left text-xs font-semibold text-gray-500 uppercase px-4 py-2">Especialidades</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {candidatos.map((t) => (
                    <tr key={t.id}>
                      <td className="px-4 py-2 text-sm font-medium text-slate-900">{t.nombre_completo}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">{t.ciudad_pueblo}</td>
                      <td className="px-4 py-2">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          t.estado_verificacion === 'verificado' ? 'bg-green-100 text-green-800' :
                          t.estado_verificacion === 'pendiente' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {t.estado_verificacion}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {t.especialidades.map(e => (
                            <span key={e} className="text-[10px] font-medium bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{e}</span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Edit modal — admin corrige horario / dirección / ciudad / zona.
          Toda edición queda en solicitud_eventos via /api/admin/editar-solicitud. */}
      {editando && solicitud && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !guardandoEdicion) setEditando(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">✏️ Editar solicitud</h3>
              <button
                type="button"
                onClick={() => !guardandoEdicion && setEditando(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 disabled:opacity-50"
                disabled={guardandoEdicion}
              >
                ✕
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <p className="text-xs text-gray-500">
                Los cambios quedan registrados en el audit log y <strong>NO</strong> envían WhatsApp.
                Para cambiar la <strong>fecha del servicio</strong> (y avisar a cliente, técnico y
                supervisores), usá &ldquo;Cambiar fecha de servicio&rdquo;.
              </p>

              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1">Dirección</span>
                <input
                  type="text"
                  value={edicionDireccion}
                  onChange={(e) => setEdicionDireccion(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-700 mb-1">Ciudad</span>
                  <input
                    type="text"
                    value={edicionCiudad}
                    onChange={(e) => setEdicionCiudad(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs font-semibold text-gray-700 mb-1">Zona</span>
                  <input
                    type="text"
                    value={edicionZona}
                    onChange={(e) => setEdicionZona(e.target.value)}
                    className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1">Tipo de equipo</span>
                <select
                  value={edicionTipoEquipo}
                  onChange={(e) => setEdicionTipoEquipo(e.target.value)}
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                >
                  {/* Si el valor actual no está en el catálogo (dato legacy), lo
                      mostramos igual para no perderlo silenciosamente. */}
                  {edicionTipoEquipo && !(TIPOS_EQUIPO as readonly string[]).includes(edicionTipoEquipo) && (
                    <option value={edicionTipoEquipo}>{edicionTipoEquipo} (actual)</option>
                  )}
                  {TIPOS_EQUIPO.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <span className="block text-[11px] text-gray-400 mt-1">
                  Cambiarlo afecta el matching de técnicos y las familias de falla
                  que ve el técnico en el diagnóstico.
                </span>
              </label>

              <label className="block">
                <span className="block text-xs font-semibold text-gray-700 mb-1">Motivo (opcional)</span>
                <textarea
                  value={edicionMotivo}
                  onChange={(e) => setEdicionMotivo(e.target.value)}
                  rows={2}
                  placeholder="Ej: Cliente solicitó cambio por teléfono"
                  className="w-full border-2 border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
                />
              </label>

              {errorEdicion && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
                  {errorEdicion}
                </div>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              <button
                type="button"
                onClick={() => !guardandoEdicion && setEditando(false)}
                disabled={guardandoEdicion}
                className="flex-1 rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarEdicion}
                disabled={guardandoEdicion}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {guardandoEdicion ? 'Guardando...' : 'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
