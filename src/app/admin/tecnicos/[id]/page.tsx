'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { CONTRATO_TECNICO_VERSION } from '@/lib/constants/legal'
import { supabase } from '@/lib/supabase'
import { uploadContratoFirmado, urlContratoFirmado } from '@/lib/uploadHelpers'
import { normalizeForMatch } from '@/lib/utils/format'
import { CIUDADES_SUGERIDAS } from '@/lib/constants/ciudades'
import { ESPECIALIDADES, ESPECIALIDADES_INFO } from '@/lib/constants/especialidades'
import {
  CERTIFICACIONES,
  ESTADOS_CERTIFICACION,
  ESTADO_CERTIFICACION_LABELS,
  ESTADO_GAS_LABELS,
  certificacionesAplicables,
  estadoGasTecnico,
  parseCertificaciones,
  type CertificacionId,
  type CertificacionTecnico,
  type CertificacionesTecnico,
  type EstadoCertificacion,
} from '@/lib/constants/certificaciones'

interface Tecnico {
  id: string
  nombre_completo: string
  whatsapp: string
  ciudad_pueblo: string
  ciudades_cobertura: string[]
  tipo_documento: string
  numero_documento: string
  especialidad_principal: string | null
  foto_perfil_url: string | null
  foto_documento_url: string | null
  estado_verificacion: string
  fecha_verificacion: string | null
  nota_verificacion: string | null
  acepta_garantias: boolean
  tiene_arl: boolean | null
  // Gasodomésticos + certificaciones (migración 20261008). Ver docs/CERTIFICACIONES.md
  cubre_gasodomesticos: boolean | null
  certificaciones: unknown
  perfil_actualizado_at: string | null
  // Aceptación legal (migración 20261009). Contrato se firma en físico.
  tyc_version: string | null
  tyc_aceptados_at: string | null
  datos_version: string | null
  datos_autorizados_at: string | null
  contrato_firmado: boolean | null
  contrato_firmado_version: string | null
  contrato_firmado_at: string | null
  contrato_registrado_por: string | null
  // Copia escaneada del contrato firmado (migración 20261009_tecnicos_contrato_archivo)
  contrato_archivo_path: string | null
  contrato_archivo_subido_at: string | null
  created_at: string
}

export default function TecnicoDetalle() {
  const params = useParams()
  const id = params.id as string

  const [tecnico, setTecnico] = useState<Tecnico | null>(null)
  const [especialidades, setEspecialidades] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [accion, setAccion] = useState<'idle' | 'procesando'>('idle')
  const [nota, setNota] = useState('')
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null)
  const [imagenExpandida, setImagenExpandida] = useState<string | null>(null)
  const [ciudades, setCiudades] = useState<string[]>([])
  const [nuevaCiudad, setNuevaCiudad] = useState('')
  const [guardandoCiudades, setGuardandoCiudades] = useState(false)
  // Especialidades editables (la lista guardada vive en `especialidades`)
  const [espEdit, setEspEdit] = useState<string[]>([])
  const [guardandoEsp, setGuardandoEsp] = useState(false)
  // Gasodomésticos + certificaciones (verificación MANUAL del admin)
  const [guardandoGas, setGuardandoGas] = useState(false)
  const [certs, setCerts] = useState<CertificacionesTecnico>({})
  const [guardandoCerts, setGuardandoCerts] = useState(false)
  const [mostrarNoAplicables, setMostrarNoAplicables] = useState(false)
  const [adminEmail, setAdminEmail] = useState<string>('admin')
  const [fechaFirma, setFechaFirma] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [guardandoContrato, setGuardandoContrato] = useState(false)
  const [archivoContrato, setArchivoContrato] = useState<File | null>(null)
  const [subiendoContrato, setSubiendoContrato] = useState(false)
  const [abriendoContrato, setAbriendoContrato] = useState(false)

  useEffect(() => {
    const cargar = async () => {
      const [tecRes, espRes, userRes] = await Promise.all([
        supabase.from('tecnicos').select('*').eq('id', id).single(),
        supabase.from('especialidades_tecnico').select('especialidad').eq('tecnico_id', id),
        supabase.auth.getUser(),
      ])

      if (tecRes.data) {
        setTecnico(tecRes.data)
        setNota(tecRes.data.nota_verificacion ?? '')
        const cob = Array.isArray(tecRes.data.ciudades_cobertura) && tecRes.data.ciudades_cobertura.length > 0
          ? tecRes.data.ciudades_cobertura
          : (tecRes.data.ciudad_pueblo ? [tecRes.data.ciudad_pueblo] : [])
        setCiudades(cob)
        setCerts(parseCertificaciones(tecRes.data.certificaciones))
      }
      const esp = espRes.data?.map((e: { especialidad: string }) => e.especialidad) ?? []
      setEspecialidades(esp)
      setEspEdit(esp)
      if (userRes.data.user?.email) setAdminEmail(userRes.data.user.email)
      setCargando(false)
    }

    cargar()
  }, [id])

  const toggleEspEdit = (esp: string) => {
    setEspEdit(prev => (prev.includes(esp) ? prev.filter(e => e !== esp) : [...prev, esp]))
  }

  const guardarEspecialidades = async () => {
    if (espEdit.length === 0) {
      setMensaje({ texto: 'El técnico debe tener al menos una especialidad', tipo: 'error' })
      return
    }
    setGuardandoEsp(true)
    setMensaje(null)

    // Insertar nuevas y borrar quitadas (sin ventana con cero filas). El admin
    // escribe como `authenticated` → policy full access en especialidades_tecnico.
    const toAdd = espEdit.filter(e => !especialidades.includes(e))
    const toRemove = especialidades.filter(e => !espEdit.includes(e))

    if (toAdd.length > 0) {
      const { error } = await supabase
        .from('especialidades_tecnico')
        .insert(toAdd.map(e => ({ tecnico_id: id, especialidad: e })))
      if (error) {
        setMensaje({ texto: 'Error al agregar especialidades: ' + error.message, tipo: 'error' })
        setGuardandoEsp(false)
        return
      }
    }
    if (toRemove.length > 0) {
      const { data: borradas, error } = await supabase
        .from('especialidades_tecnico')
        .delete()
        .eq('tecnico_id', id)
        .in('especialidad', toRemove)
        .select('especialidad')
      if (error || !borradas || borradas.length !== toRemove.length) {
        setMensaje({
          texto: 'Error al quitar especialidades: ' + (error?.message ?? 'no se borraron todas las filas (¿permisos RLS?)'),
          tipo: 'error',
        })
        setGuardandoEsp(false)
        return
      }
    }

    // Principal: se conserva si sigue marcada; si no, la primera de la lista.
    const principal = tecnico && espEdit.includes(tecnico.especialidad_principal ?? '')
      ? tecnico.especialidad_principal
      : espEdit[0]
    if (principal && principal !== tecnico?.especialidad_principal) {
      await supabase.from('tecnicos').update({ especialidad_principal: principal }).eq('id', id)
      setTecnico(prev => prev ? { ...prev, especialidad_principal: principal } : prev)
    }

    setEspecialidades(espEdit)
    setMensaje({ texto: 'Especialidades actualizadas', tipo: 'exito' })
    setGuardandoEsp(false)
  }

  const guardarGas = async (valor: boolean | null) => {
    setGuardandoGas(true)
    setMensaje(null)
    const { data: updated, error } = await supabase
      .from('tecnicos')
      .update({ cubre_gasodomesticos: valor })
      .eq('id', id)
      .select('cubre_gasodomesticos')
    if (error || !updated || updated.length === 0) {
      setMensaje({ texto: 'Error al guardar gasodomésticos: ' + (error?.message ?? 'la fila no se actualizó'), tipo: 'error' })
      setGuardandoGas(false)
      return
    }
    setTecnico(prev => prev ? { ...prev, cubre_gasodomesticos: valor } : prev)
    setMensaje({ texto: 'Gasodomésticos actualizado', tipo: 'exito' })
    setGuardandoGas(false)
  }

  const setCert = (cid: CertificacionId, patch: Partial<CertificacionTecnico>) => {
    setCerts(prev => ({
      ...prev,
      [cid]: { estado: 'sin_revisar', ...(prev[cid] ?? {}), ...patch },
    }))
  }

  const guardarCertificaciones = async () => {
    setGuardandoCerts(true)
    setMensaje(null)
    const ahora = new Date().toISOString()
    // Limpia entradas vacías (sin_revisar y sin ningún dato) y sella autor/fecha
    // de las que cambiaron respecto a lo guardado.
    const guardadas = parseCertificaciones(tecnico?.certificaciones)
    const limpias: CertificacionesTecnico = {}
    for (const [k, v] of Object.entries(certs) as [CertificacionId, CertificacionTecnico | undefined][]) {
      if (!v) continue
      const vacia = v.estado === 'sin_revisar' && !v.entidad && !v.numero && !v.vence && !v.nota
      if (vacia) continue
      const prev = guardadas[k]
      const cambio = !prev || prev.estado !== v.estado || prev.entidad !== v.entidad || prev.numero !== v.numero || prev.vence !== v.vence || prev.nota !== v.nota
      limpias[k] = cambio ? { ...v, actualizado_en: ahora, actualizado_por: adminEmail } : v
    }

    const { data: updated, error } = await supabase
      .from('tecnicos')
      .update({ certificaciones: limpias })
      .eq('id', id)
      .select('certificaciones')
    if (error || !updated || updated.length === 0) {
      setMensaje({ texto: 'Error al guardar certificaciones: ' + (error?.message ?? 'la fila no se actualizó'), tipo: 'error' })
      setGuardandoCerts(false)
      return
    }
    setCerts(limpias)
    setTecnico(prev => prev ? { ...prev, certificaciones: limpias } : prev)
    setMensaje({ texto: 'Certificaciones actualizadas', tipo: 'exito' })
    setGuardandoCerts(false)
  }

  // Contrato de prestación de servicios firmado en físico: el admin lo marca
  // al recibir el original. Es requisito para verificar (habilitar).
  const guardarContrato = async (firmado: boolean) => {
    if (!tecnico) return
    if (!firmado && tecnico.estado_verificacion === 'verificado' &&
        !window.confirm('El técnico está verificado. ¿Desmarcar el contrato? Quedará sin contrato firmado registrado (no se cambia su estado).')) {
      return
    }
    setGuardandoContrato(true)
    setMensaje(null)
    const cambios = firmado
      ? {
          contrato_firmado: true,
          contrato_firmado_version: CONTRATO_TECNICO_VERSION,
          contrato_firmado_at: new Date(`${fechaFirma}T12:00:00-05:00`).toISOString(),
          contrato_registrado_por: adminEmail,
        }
      : {
          contrato_firmado: false,
          contrato_firmado_version: null,
          contrato_firmado_at: null,
          contrato_registrado_por: adminEmail,
        }
    const { error } = await supabase.from('tecnicos').update(cambios).eq('id', id)
    if (error) {
      setMensaje({ texto: 'Error al guardar el contrato: ' + error.message, tipo: 'error' })
    } else {
      setTecnico(prev => prev ? { ...prev, ...cambios } : prev)
      setMensaje({ texto: firmado ? 'Contrato firmado registrado' : 'Contrato desmarcado', tipo: 'exito' })
    }
    setGuardandoContrato(false)
  }

  // Copia escaneada del contrato firmado (PDF/JPG/PNG ≤ 10 MB) al bucket
  // privado tecnicos-contratos. Se guarda la ruta; se lee con signed URL.
  const subirContrato = async () => {
    if (!tecnico || !archivoContrato) return
    setSubiendoContrato(true)
    setMensaje(null)
    try {
      const version = tecnico.contrato_firmado_version ?? CONTRATO_TECNICO_VERSION
      const path = await uploadContratoFirmado(archivoContrato, id, version)
      const cambios = { contrato_archivo_path: path, contrato_archivo_subido_at: new Date().toISOString() }
      const { error } = await supabase.from('tecnicos').update(cambios).eq('id', id)
      if (error) throw new Error(error.message)
      setTecnico(prev => prev ? { ...prev, ...cambios } : prev)
      setArchivoContrato(null)
      setMensaje({ texto: 'Contrato escaneado guardado', tipo: 'exito' })
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'Error al subir el contrato', tipo: 'error' })
    } finally {
      setSubiendoContrato(false)
    }
  }

  const verContrato = async () => {
    if (!tecnico?.contrato_archivo_path) return
    setAbriendoContrato(true)
    try {
      const url = await urlContratoFirmado(tecnico.contrato_archivo_path)
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'No se pudo abrir el contrato', tipo: 'error' })
    } finally {
      setAbriendoContrato(false)
    }
  }

  const cambiarEstado = async (nuevoEstado: 'verificado' | 'rechazado' | 'pendiente') => {
    if (nuevoEstado === 'verificado' && !tecnico?.contrato_firmado) {
      setMensaje({ texto: 'Primero marca el contrato firmado en físico', tipo: 'error' })
      return
    }
    if (nuevoEstado === 'rechazado' && !nota.trim()) {
      setMensaje({ texto: 'Debes ingresar una nota explicando el rechazo', tipo: 'error' })
      return
    }

    setAccion('procesando')
    setMensaje(null)

    const { error } = await supabase
      .from('tecnicos')
      .update({
        estado_verificacion: nuevoEstado,
        fecha_verificacion: nuevoEstado !== 'pendiente' ? new Date().toISOString() : null,
        nota_verificacion: nota.trim() || null,
      })
      .eq('id', id)

    if (error) {
      setMensaje({ texto: 'Error al actualizar: ' + error.message, tipo: 'error' })
      setAccion('idle')
      return
    }

    setTecnico(prev => prev ? {
      ...prev,
      estado_verificacion: nuevoEstado,
      fecha_verificacion: nuevoEstado !== 'pendiente' ? new Date().toISOString() : null,
      nota_verificacion: nota.trim() || null,
    } : null)

    const labels: Record<string, string> = {
      verificado: 'Técnico verificado exitosamente',
      rechazado: 'Técnico rechazado',
      pendiente: 'Técnico devuelto a pendiente',
    }

    setMensaje({ texto: labels[nuevoEstado], tipo: 'exito' })
    setAccion('idle')
  }

  const agregarCiudad = () => {
    const c = nuevaCiudad.trim()
    if (!c) return
    // Duplicado acento/case-insensitive: "Bogota" ya cubierta por "Bogotá".
    if (ciudades.some(x => normalizeForMatch(x) === normalizeForMatch(c))) {
      setNuevaCiudad('')
      return
    }
    setCiudades(prev => [...prev, c])
    setNuevaCiudad('')
  }

  const quitarCiudad = (ciudad: string) => {
    setCiudades(prev => prev.filter(x => x !== ciudad))
  }

  const guardarCiudades = async () => {
    setGuardandoCiudades(true)
    setMensaje(null)

    // Trim + dedupe acento/case-insensitive, conservando la primera grafía
    // ingresada ("Bogotá" y "Bogota" son la misma ciudad para el matching).
    const limpias = Array.from(
      new Map(
        ciudades.map(c => c.trim()).filter(Boolean).map(c => [normalizeForMatch(c), c]),
      ).values(),
    )

    // .select() para confirmar que la fila realmente se actualizó: un UPDATE
    // bloqueado por RLS o con id inexistente devuelve error=null y 0 filas —
    // sin esto el admin vería "actualizadas" sin haberse guardado nada.
    const { data: updated, error } = await supabase
      .from('tecnicos')
      .update({ ciudades_cobertura: limpias })
      .eq('id', id)
      .select('ciudades_cobertura')

    if (error || !updated || updated.length === 0) {
      setMensaje({
        texto: 'Error al guardar ciudades: ' + (error?.message ?? 'la fila no se actualizó (¿permisos RLS o técnico inexistente?)'),
        tipo: 'error',
      })
      setGuardandoCiudades(false)
      return
    }

    setCiudades(limpias)
    setTecnico(prev => prev ? { ...prev, ciudades_cobertura: limpias } : null)
    setMensaje({ texto: 'Ciudades de cobertura actualizadas', tipo: 'exito' })
    setGuardandoCiudades(false)
  }

  if (cargando) {
    return (
      <div className="p-8 flex justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (!tecnico) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500">Técnico no encontrado</p>
        <Link href="/admin/tecnicos" className="text-sm text-blue-600 hover:text-blue-800 mt-2 inline-block">
          ← Volver a la lista
        </Link>
      </div>
    )
  }

  const estadoConfig: Record<string, { bg: string; text: string; border: string }> = {
    pendiente: { bg: 'bg-yellow-50', text: 'text-yellow-800', border: 'border-yellow-200' },
    verificado: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-200' },
    rechazado: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' },
  }

  const cfg = estadoConfig[tecnico.estado_verificacion] ?? estadoConfig.pendiente

  const estadoGas = estadoGasTecnico(tecnico.cubre_gasodomesticos, certs)
  const gasBadge: Record<typeof estadoGas, string> = {
    no_informado: 'bg-gray-100 text-gray-600 border-gray-200',
    no_cubre: 'bg-slate-100 text-slate-600 border-slate-200',
    cubre_sin_certificado: 'bg-amber-100 text-amber-800 border-amber-200',
    cubre_certificado: 'bg-green-100 text-green-800 border-green-200',
  }
  const aplicables = certificacionesAplicables(especialidades, tecnico.cubre_gasodomesticos)
  const aplicablesIds = new Set(aplicables.map(c => c.id))
  const noAplicables = CERTIFICACIONES.filter(c => !aplicablesIds.has(c.id))
  const verificadas = Object.values(certs).filter(c => c?.estado === 'verificada').length
  const declaradas = Object.values(certs).filter(c => c?.estado === 'declarada').length

  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Breadcrumb */}
      <div className="mb-6">
        <Link href="/admin/tecnicos" className="text-sm text-gray-400 hover:text-gray-600 transition-colors">
          ← Técnicos
        </Link>
      </div>

      {/* Image lightbox */}
      {imagenExpandida && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setImagenExpandida(null)}
        >
          <div className="relative max-w-3xl max-h-[90vh] w-full h-full">
            <Image src={imagenExpandida} alt="Imagen expandida" fill className="object-contain" />
          </div>
          <button className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl font-bold">✕</button>
        </div>
      )}

      {/* Mensaje */}
      {mensaje && (
        <div className={`p-4 mb-6 rounded-xl text-sm font-medium ${
          mensaje.tipo === 'exito'
            ? 'bg-green-50 text-green-800 border border-green-200'
            : 'bg-red-50 text-red-800 border border-red-200'
        }`}>
          {mensaje.tipo === 'exito' ? '✅' : '⚠️'} {mensaje.texto}
        </div>
      )}

      {/* Header card */}
      <div className={`${cfg.bg} border ${cfg.border} rounded-2xl p-6 mb-6`}>
        <div className="flex items-start gap-5">
          {/* Photo */}
          <div
            className="w-20 h-20 rounded-xl overflow-hidden bg-white border-2 border-white shadow-sm shrink-0 relative cursor-pointer"
            onClick={() => tecnico.foto_perfil_url && setImagenExpandida(tecnico.foto_perfil_url)}
          >
            {tecnico.foto_perfil_url ? (
              <Image src={tecnico.foto_perfil_url} alt="Perfil" fill className="object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl font-bold">
                {tecnico.nombre_completo.charAt(0)}
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-slate-900">{tecnico.nombre_completo}</h1>
              <span className={`text-xs font-bold px-3 py-1 rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                {tecnico.estado_verificacion.toUpperCase()}
              </span>
              <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${gasBadge[estadoGas]}`} title="Gasodomésticos">
                🔥 {ESTADO_GAS_LABELS[estadoGas]}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">{tecnico.ciudad_pueblo}</p>
            {tecnico.fecha_verificacion && (
              <p className="text-xs text-gray-400 mt-1">
                Verificado: {new Date(tecnico.fecha_verificacion).toLocaleDateString('es-CO')}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column: info */}
        <div className="space-y-6">
          {/* Datos personales */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Datos personales</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-gray-400">Nombre completo</p>
                <p className="text-sm font-semibold text-slate-900">{tecnico.nombre_completo}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">WhatsApp</p>
                  <p className="text-sm font-semibold text-slate-900">{tecnico.whatsapp}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Ciudad</p>
                  <p className="text-sm font-semibold text-slate-900">{tecnico.ciudad_pueblo}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Tipo documento</p>
                  <p className="text-sm font-semibold text-slate-900">{tecnico.tipo_documento}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Número documento</p>
                  <p className="text-sm font-semibold text-slate-900">{tecnico.numero_documento}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-gray-400">Acepta garantías</p>
                  <p className="text-sm font-semibold text-slate-900">{tecnico.acepta_garantias ? 'Sí' : 'No'}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Tiene ARL</p>
                  <p className={`text-sm font-semibold ${tecnico.tiene_arl === null ? 'text-gray-400' : tecnico.tiene_arl ? 'text-green-700' : 'text-amber-700'}`}>
                    {tecnico.tiene_arl === null ? 'No informado' : tecnico.tiene_arl ? 'Sí' : 'No'}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-400">Fecha de registro</p>
                <p className="text-sm font-semibold text-slate-900">
                  {tecnico.created_at ? new Date(tecnico.created_at).toLocaleString('es-CO') : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Ciudades de cobertura */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Ciudades de cobertura</h2>
            <p className="text-xs text-gray-400 mb-4">
              Ciudades/pueblos donde el técnico recibe solicitudes. La ciudad base es <span className="font-semibold text-gray-500">{tecnico.ciudad_pueblo}</span>.
              {' '}El matching ignora mayúsculas y tildes (&ldquo;soacha&rdquo; = &ldquo;Soacha&rdquo;). Si la lista
              queda vacía, las solicitudes se matchean solo contra la ciudad base.
            </p>

            {/* Chips */}
            <div className="flex flex-wrap gap-2 mb-3">
              {ciudades.length > 0 ? (
                ciudades.map(c => (
                  <span key={c} className="inline-flex items-center gap-1.5 text-sm font-medium bg-slate-100 text-slate-700 pl-3 pr-2 py-1.5 rounded-xl border border-slate-200">
                    {c}
                    <button
                      type="button"
                      onClick={() => quitarCiudad(c)}
                      className="text-slate-400 hover:text-red-600 transition-colors font-bold leading-none"
                      title={`Quitar ${c}`}
                    >
                      ✕
                    </button>
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-400">Sin ciudades de cobertura</span>
              )}
            </div>

            {/* Agregar ciudad — con sugerencias (datalist); acepta texto libre */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                list="ciudades-sugeridas"
                value={nuevaCiudad}
                onChange={(e) => setNuevaCiudad(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarCiudad() } }}
                placeholder="Agregar ciudad o pueblo (ej. Soacha)..."
                className="flex-1 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              />
              <datalist id="ciudades-sugeridas">
                {CIUDADES_SUGERIDAS
                  .filter(c => !ciudades.some(x => normalizeForMatch(x) === normalizeForMatch(c)))
                  .map(c => <option key={c} value={c} />)}
              </datalist>
              <button
                type="button"
                onClick={agregarCiudad}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 rounded-xl text-sm transition-all"
              >
                Agregar
              </button>
            </div>

            <button
              type="button"
              onClick={guardarCiudades}
              disabled={guardandoCiudades}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardandoCiudades ? 'Guardando...' : 'Guardar ciudades'}
            </button>
          </div>

          {/* Especialidades (editables) */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Especialidades</h2>
            <p className="text-xs text-gray-400 mb-4">
              Categorías en las que el técnico recibe solicitudes (el matching compara con estas etiquetas).
              Principal: <span className="font-semibold text-gray-500">{tecnico.especialidad_principal ?? '—'}</span>.
            </p>
            <div className="space-y-2 mb-4">
              {ESPECIALIDADES.map(esp => {
                const on = espEdit.includes(esp)
                const info = ESPECIALIDADES_INFO[esp]
                return (
                  <label key={esp} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${on ? 'border-blue-300 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleEspEdit(esp)}
                      className="h-4 w-4 mt-0.5 text-blue-600 border-gray-300 rounded"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold text-slate-900">{info.icono} {esp}</span>
                      <span className="block text-[11px] text-gray-500 leading-snug">{info.cubre}{info.gas ? ' · incluye equipos a gas' : ''}</span>
                    </span>
                  </label>
                )
              })}
              {especialidades.some(e => !(ESPECIALIDADES as readonly string[]).includes(e)) && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2">
                  ⚠️ Etiquetas fuera del catálogo en BD: {especialidades.filter(e => !(ESPECIALIDADES as readonly string[]).includes(e)).join(', ')}. Se borrarán al guardar.
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={guardarEspecialidades}
              disabled={guardandoEsp || (espEdit.length === especialidades.length && espEdit.every(e => especialidades.includes(e)))}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {guardandoEsp ? 'Guardando...' : 'Guardar especialidades'}
            </button>
          </div>

          {/* Gasodomésticos */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Gasodomésticos</h2>
            <p className="text-xs text-gray-400 mb-4">
              ¿Atiende estufas, hornos, calentadores y secadoras <span className="font-semibold">a gas</span>? Intervenir un artefacto a gas exige
              certificado de competencia laboral (Res. 90902/2013). Declarado por el técnico; el admin puede corregirlo.
            </p>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {([
                { v: true, t: '🔥 Sí, atiende gas' },
                { v: false, t: '⚡ Solo eléctricos' },
                { v: null, t: 'No informado' },
              ] as { v: boolean | null; t: string }[]).map(({ v, t }) => {
                const on = tecnico.cubre_gasodomesticos === v
                return (
                  <button
                    key={String(v)}
                    type="button"
                    disabled={guardandoGas || on}
                    onClick={() => guardarGas(v)}
                    className={`p-2.5 rounded-xl border-2 text-xs font-semibold transition-all disabled:cursor-default ${
                      on ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-gray-200 hover:border-blue-300 text-gray-600'
                    }`}
                  >
                    {t}
                  </button>
                )
              })}
            </div>
            {estadoGas === 'cubre_sin_certificado' && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
                ⚠️ Declara atender gasodomésticos pero <span className="font-semibold">no tiene verificada</span> la competencia laboral en gas.
                Pídele el certificado y márcalo abajo en Certificaciones antes de asignarle equipos a gas.
              </p>
            )}
            {estadoGas === 'cubre_certificado' && (
              <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg p-3">
                ✅ Competencia laboral en gas verificada y vigente.
              </p>
            )}
            {tecnico.perfil_actualizado_at ? (
              <p className="text-[11px] text-gray-400 mt-3">
                Perfil completado por el técnico: {new Date(tecnico.perfil_actualizado_at).toLocaleString('es-CO')}
              </p>
            ) : (
              <p className="text-[11px] text-gray-400 mt-3">
                El técnico aún no ha completado su perfil desde el portal (<code className="text-[10px]">/tecnico/&#123;token&#125;/perfil</code>).
              </p>
            )}
          </div>
        </div>

        {/* Right column: photos + actions */}
        <div className="space-y-6">
          {/* Photos */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Documentos</h2>
            <div className="space-y-4">
              <div>
                <p className="text-xs text-gray-400 mb-2">Foto de perfil</p>
                {tecnico.foto_perfil_url ? (
                  <div
                    className="relative w-full h-48 rounded-xl overflow-hidden border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setImagenExpandida(tecnico.foto_perfil_url!)}
                  >
                    <Image src={tecnico.foto_perfil_url} alt="Perfil" fill className="object-cover" />
                  </div>
                ) : (
                  <div className="w-full h-32 bg-gray-100 rounded-xl flex items-center justify-center text-gray-300 text-sm">
                    Sin foto
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-gray-400 mb-2">Foto del documento</p>
                {tecnico.foto_documento_url ? (
                  <div
                    className="relative w-full h-48 rounded-xl overflow-hidden border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setImagenExpandida(tecnico.foto_documento_url!)}
                  >
                    <Image src={tecnico.foto_documento_url} alt="Documento" fill className="object-cover" />
                  </div>
                ) : (
                  <div className="w-full h-32 bg-gray-100 rounded-xl flex items-center justify-center text-gray-300 text-sm">
                    Sin foto
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Contrato físico — requisito para verificar */}
          <div className={`rounded-xl border shadow-sm p-5 ${tecnico.contrato_firmado ? 'bg-white border-gray-200' : 'bg-amber-50 border-amber-200'}`}>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contrato de prestación de servicios</h2>
            {tecnico.contrato_firmado ? (
              <div className="space-y-1 text-sm text-gray-700">
                <p className="font-semibold text-green-700">✅ Firmado en físico</p>
                <p>Versión: {tecnico.contrato_firmado_version ?? '—'}{tecnico.contrato_firmado_version && tecnico.contrato_firmado_version !== CONTRATO_TECNICO_VERSION && (
                  <span className="ml-1 text-amber-700">(vigente: {CONTRATO_TECNICO_VERSION})</span>
                )}</p>
                <p>Fecha de firma: {tecnico.contrato_firmado_at ? new Date(tecnico.contrato_firmado_at).toLocaleDateString('es-CO') : '—'}</p>
                <p className="text-xs text-gray-400">Registrado por {tecnico.contrato_registrado_por ?? '—'}</p>
                <button
                  type="button"
                  onClick={() => guardarContrato(false)}
                  disabled={guardandoContrato}
                  className="mt-2 text-xs text-red-600 underline disabled:opacity-50"
                >
                  Desmarcar
                </button>
              </div>
            ) : (
              <div className="space-y-3 text-sm">
                <p className="text-amber-900">
                  ⚠️ Sin contrato firmado. Imprime el{' '}
                  <a href="/contrato-tecnico" target="_blank" rel="noopener noreferrer" className="underline font-semibold">contrato (v{CONTRATO_TECNICO_VERSION})</a>,
                  recoge la firma y los documentos (RUT, salud, pensión, ARL, certificación bancaria) y márcalo aquí.
                </p>
                <label className="block text-xs font-semibold text-gray-500">
                  Fecha de firma
                  <input
                    type="date"
                    value={fechaFirma}
                    onChange={(e) => setFechaFirma(e.target.value)}
                    className="mt-1 block w-full border border-gray-200 rounded-lg py-2 px-3 text-sm"
                  />
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled={guardandoContrato}
                    onChange={() => guardarContrato(true)}
                    className="h-5 w-5 mt-0.5 rounded border-gray-300"
                  />
                  <span className="font-semibold text-gray-900">Recibí el contrato firmado en físico y los documentos</span>
                </label>
              </div>
            )}
            {/* Copia escaneada del contrato firmado (bucket privado, signed URL) */}
            <div className="mt-4 pt-4 border-t border-gray-200 space-y-2 text-sm">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Copia escaneada</p>
              {tecnico.contrato_archivo_path ? (
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={verContrato}
                    disabled={abriendoContrato}
                    className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {abriendoContrato ? 'Abriendo…' : '📄 Ver contrato escaneado'}
                  </button>
                  <span className="text-xs text-gray-400">
                    Subido {tecnico.contrato_archivo_subido_at ? new Date(tecnico.contrato_archivo_subido_at).toLocaleDateString('es-CO') : '—'}
                  </span>
                </div>
              ) : (
                <p className="text-xs text-gray-500">Aún no hay copia escaneada. Sube el PDF o la foto del contrato firmado.</p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  accept="application/pdf,image/jpeg,image/png"
                  onChange={(e) => setArchivoContrato(e.target.files?.[0] ?? null)}
                  className="block text-xs text-gray-600 file:mr-2 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
                />
                <button
                  type="button"
                  onClick={subirContrato}
                  disabled={!archivoContrato || subiendoContrato}
                  className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {subiendoContrato ? 'Subiendo…' : tecnico.contrato_archivo_path ? 'Reemplazar' : 'Subir'}
                </button>
              </div>
              <p className="text-[11px] text-gray-400">PDF, JPG o PNG · máx. 10 MB · solo visible para administradores.</p>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Registro: T&amp;C {tecnico.tyc_version ?? 'no aceptados'} · Datos {tecnico.datos_version ?? 'no autorizados'}
            </p>
          </div>

          {/* Verification actions */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Verificación</h2>

            {/* Nota */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                Nota de verificación
              </label>
              <textarea
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Escribe una nota (requerida para rechazar)..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent resize-none"
              />
            </div>

            {/* Buttons */}
            <div className="space-y-2">
              {tecnico.estado_verificacion !== 'verificado' && (
                <button
                  onClick={() => cambiarEstado('verificado')}
                  disabled={accion === 'procesando' || !tecnico.contrato_firmado}
                  title={!tecnico.contrato_firmado ? 'Requiere contrato firmado en físico' : undefined}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {accion === 'procesando' ? 'Procesando...' : '✅ Verificar técnico'}
                </button>
              )}

              {tecnico.estado_verificacion !== 'rechazado' && (
                <button
                  onClick={() => cambiarEstado('rechazado')}
                  disabled={accion === 'procesando'}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {accion === 'procesando' ? 'Procesando...' : '❌ Rechazar técnico'}
                </button>
              )}

              {tecnico.estado_verificacion !== 'pendiente' && (
                <button
                  onClick={() => cambiarEstado('pendiente')}
                  disabled={accion === 'procesando'}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {accion === 'procesando' ? 'Procesando...' : '↩️ Devolver a pendiente'}
                </button>
              )}
            </div>

            {tecnico.nota_verificacion && tecnico.nota_verificacion !== nota && (
              <div className="mt-4 bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 mb-1">Nota anterior:</p>
                <p className="text-sm text-gray-600">{tecnico.nota_verificacion}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Certificaciones y acreditaciones — verificación MANUAL (ancho completo) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 mt-6">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Certificaciones y acreditaciones</h2>
          <span className="text-[11px] text-gray-400">
            {verificadas} verificada{verificadas !== 1 ? 's' : ''} · {declaradas} declarada{declaradas !== 1 ? 's' : ''} por el técnico
          </span>
        </div>
        <p className="text-xs text-gray-400 mb-4">
          Checklist manual: pide el soporte al técnico, consúltalo en la entidad (link &ldquo;Verificar&rdquo;) y marca el estado.
          Las que aplican dependen de sus especialidades y de si atiende gas. Detalle normativo en <code className="text-[10px]">docs/CERTIFICACIONES.md</code>.
          ARL: <span className={`font-semibold ${tecnico.tiene_arl === null ? 'text-gray-400' : tecnico.tiene_arl ? 'text-green-700' : 'text-amber-700'}`}>
            {tecnico.tiene_arl === null ? 'no informado' : tecnico.tiene_arl ? 'sí' : 'no'}
          </span>.
        </p>

        <div className="space-y-3">
          {aplicables.map(def => {
            const c = certs[def.id] ?? { estado: 'sin_revisar' as EstadoCertificacion }
            const requerida = def.requeridaParaGas && tecnico.cubre_gasodomesticos === true
            const estadoColor: Record<EstadoCertificacion, string> = {
              sin_revisar: 'border-gray-200',
              declarada: 'border-blue-200 bg-blue-50/40',
              verificada: 'border-green-300 bg-green-50/40',
              vencida: 'border-amber-300 bg-amber-50/40',
              rechazada: 'border-red-300 bg-red-50/40',
              no_aplica: 'border-gray-200 bg-gray-50 opacity-70',
            }
            return (
              <div key={def.id} className={`rounded-xl border p-4 ${estadoColor[c.estado]}`}>
                <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {def.nombre}
                      {requerida && (
                        <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 align-middle">Requerida para gas</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {def.entidad}
                      {def.vigenciaMeses ? ` · vigencia ~${def.vigenciaMeses} meses` : ' · no vence'}
                      {def.normativa ? ` · ${def.normativa}` : ''}
                    </p>
                  </div>
                  {def.verificarEn && (
                    <a
                      href={def.verificarEn}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-xs font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Verificar ↗
                    </a>
                  )}
                </div>
                <p className="text-xs text-gray-500 mb-3">{def.descripcion}</p>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <select
                    value={c.estado}
                    onChange={e => setCert(def.id, { estado: e.target.value as EstadoCertificacion })}
                    className="sm:col-span-3 border border-gray-200 rounded-xl py-2 px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  >
                    {ESTADOS_CERTIFICACION.map(s => (
                      <option key={s} value={s}>{ESTADO_CERTIFICACION_LABELS[s]}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={c.entidad ?? ''}
                    onChange={e => setCert(def.id, { entidad: e.target.value || undefined })}
                    placeholder="Entidad emisora"
                    className="sm:col-span-3 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={c.numero ?? ''}
                    onChange={e => setCert(def.id, { numero: e.target.value || undefined })}
                    placeholder="Nº certificado / matrícula"
                    className="sm:col-span-3 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                  <input
                    type="date"
                    value={c.vence ?? ''}
                    onChange={e => setCert(def.id, { vence: e.target.value || undefined })}
                    title="Fecha de vencimiento"
                    className="sm:col-span-3 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                  <input
                    type="text"
                    value={c.nota ?? ''}
                    onChange={e => setCert(def.id, { nota: e.target.value || undefined })}
                    placeholder="Nota (qué soporte se revisó, observaciones)"
                    className="sm:col-span-12 border border-gray-200 rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                  />
                </div>
                {c.actualizado_en && (
                  <p className="text-[10px] text-gray-400 mt-2">
                    Última actualización: {new Date(c.actualizado_en).toLocaleString('es-CO')}{c.actualizado_por ? ` · ${c.actualizado_por}` : ''}
                  </p>
                )}
              </div>
            )
          })}
        </div>

        {noAplicables.length > 0 && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setMostrarNoAplicables(v => !v)}
              className="text-xs font-semibold text-gray-500 hover:text-gray-700"
            >
              {mostrarNoAplicables ? '▾' : '▸'} {noAplicables.length} certificación{noAplicables.length !== 1 ? 'es' : ''} que no aplica{noAplicables.length !== 1 ? 'n' : ''} a sus especialidades
              {noAplicables.some(d => certs[d.id] && certs[d.id]!.estado !== 'sin_revisar') ? ' (hay datos guardados)' : ''}
            </button>
            {mostrarNoAplicables && (
              <ul className="mt-2 space-y-1">
                {noAplicables.map(d => (
                  <li key={d.id} className="text-xs text-gray-500">
                    • {d.nombre}
                    {certs[d.id] && certs[d.id]!.estado !== 'sin_revisar' ? ` — ${ESTADO_CERTIFICACION_LABELS[certs[d.id]!.estado]}` : ''}
                    {d.aplicaA !== 'todos' ? ` (${d.aplicaA.join(', ')})` : d.soloGas ? ' (solo si atiende gas)' : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={guardarCertificaciones}
          disabled={guardandoCerts}
          className="mt-4 w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2.5 px-4 rounded-xl text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {guardandoCerts ? 'Guardando...' : 'Guardar certificaciones'}
        </button>
      </div>
    </div>
  )
}
