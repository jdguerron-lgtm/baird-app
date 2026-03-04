'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'

interface Tecnico {
  id: string
  nombre_completo: string
  whatsapp: string
  ciudad_pueblo: string
  tipo_documento: string
  numero_documento: string
  especialidad_principal: string | null
  foto_perfil_url: string | null
  foto_documento_url: string | null
  estado_verificacion: string
  fecha_verificacion: string | null
  nota_verificacion: string | null
  acepta_garantias: boolean
  created_at: string
}

export default function TecnicoDetalle() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [tecnico, setTecnico] = useState<Tecnico | null>(null)
  const [especialidades, setEspecialidades] = useState<string[]>([])
  const [cargando, setCargando] = useState(true)
  const [accion, setAccion] = useState<'idle' | 'procesando'>('idle')
  const [nota, setNota] = useState('')
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'exito' | 'error' } | null>(null)
  const [imagenExpandida, setImagenExpandida] = useState<string | null>(null)

  useEffect(() => {
    const cargar = async () => {
      const [tecRes, espRes] = await Promise.all([
        supabase.from('tecnicos').select('*').eq('id', id).single(),
        supabase.from('especialidades_tecnico').select('especialidad').eq('tecnico_id', id),
      ])

      if (tecRes.data) {
        setTecnico(tecRes.data)
        setNota(tecRes.data.nota_verificacion ?? '')
      }
      setEspecialidades(espRes.data?.map((e: { especialidad: string }) => e.especialidad) ?? [])
      setCargando(false)
    }

    cargar()
  }, [id])

  const cambiarEstado = async (nuevoEstado: 'verificado' | 'rechazado' | 'pendiente') => {
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
              <div>
                <p className="text-xs text-gray-400">Acepta garantías</p>
                <p className="text-sm font-semibold text-slate-900">{tecnico.acepta_garantias ? 'Sí' : 'No'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Fecha de registro</p>
                <p className="text-sm font-semibold text-slate-900">
                  {tecnico.created_at ? new Date(tecnico.created_at).toLocaleString('es-CO') : '—'}
                </p>
              </div>
            </div>
          </div>

          {/* Especialidades */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Especialidades</h2>
            {especialidades.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {especialidades.map(esp => (
                  <span key={esp} className="text-sm font-medium bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl border border-blue-100">
                    {esp}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">Sin especialidades registradas</p>
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
                  disabled={accion === 'procesando'}
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
    </div>
  )
}
