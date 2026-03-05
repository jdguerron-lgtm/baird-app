'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Same mapping used in whatsapp.service.ts
const TIPO_A_ESPECIALIDAD: Record<string, string> = {
  'Lavadora':           'Lavadoras',
  'Secadora':           'Lavadoras',
  'Lavavajillas':       'Lavadoras',
  'Nevera':             'Neveras y Nevecones',
  'Nevecón':            'Neveras y Nevecones',
  'Horno':              'Hornos y Estufas',
  'Estufa':             'Hornos y Estufas',
  'Aire Acondicionado': 'Aires Acondicionados',
}

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
  estado: string
  tecnico_asignado_id: string | null
  created_at: string
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

interface MatchDiagnostic {
  step: string
  status: 'pass' | 'fail' | 'warn'
  detail: string
}

const ESTADO_ESTILOS: Record<string, string> = {
  pendiente: 'bg-yellow-100 text-yellow-800',
  notificada: 'bg-blue-100 text-blue-800',
  asignada: 'bg-green-100 text-green-800',
  en_proceso: 'bg-purple-100 text-purple-800',
  completada: 'bg-emerald-100 text-emerald-800',
  cancelada: 'bg-red-100 text-red-800',
}

const NOTIF_ESTILOS: Record<string, string> = {
  enviado: 'bg-blue-100 text-blue-800',
  aceptado: 'bg-green-100 text-green-800',
  invalidado: 'bg-gray-100 text-gray-600',
  error: 'bg-red-100 text-red-800',
  expirado: 'bg-yellow-100 text-yellow-800',
}

function formatCOP(n: number) {
  return n.toLocaleString('es-CO')
}

export default function SolicitudDetalle() {
  const params = useParams()
  const id = params.id as string

  const [solicitud, setSolicitud] = useState<Solicitud | null>(null)
  const [tecnicoAsignado, setTecnicoAsignado] = useState<Tecnico | null>(null)
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([])
  const [diagnostics, setDiagnostics] = useState<MatchDiagnostic[]>([])
  const [candidatos, setCandidatos] = useState<Tecnico[]>([])
  const [cargando, setCargando] = useState(true)

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

      // 4. Run matching diagnostics
      await runDiagnostics(sol)

      setCargando(false)
    }

    cargar()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

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
      .ilike('ciudad_pueblo', `%${sol.ciudad_pueblo}%`)

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
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Solicitud #{solicitud.id.slice(0, 8)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Creada el {new Date(solicitud.created_at).toLocaleString('es-CO')}
          </p>
        </div>
        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${ESTADO_ESTILOS[solicitud.estado] ?? 'bg-gray-100 text-gray-600'}`}>
          {solicitud.estado}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Client info */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Datos del cliente</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-gray-500">Nombre</dt>
              <dd className="text-sm font-medium text-slate-900">{solicitud.cliente_nombre}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">WhatsApp</dt>
              <dd className="text-sm font-medium text-slate-900">{solicitud.cliente_telefono}</dd>
            </div>
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
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Equipo y servicio</h2>
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
                <dt className="text-xs text-gray-500">Valor del servicio</dt>
                <dd className="text-sm font-bold text-green-700">${formatCOP(solicitud.pago_tecnico)} COP</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Garantia</dt>
                <dd className="text-sm text-slate-900">{solicitud.es_garantia ? `Si — ${solicitud.numero_serie_factura}` : 'No'}</dd>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <dt className="text-xs text-gray-500">Horario 1</dt>
                <dd className="text-sm text-slate-900">{solicitud.horario_visita_1 || '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Horario 2</dt>
                <dd className="text-sm text-slate-900">{solicitud.horario_visita_2 || '—'}</dd>
              </div>
            </div>
          </dl>
        </div>

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
    </div>
  )
}
