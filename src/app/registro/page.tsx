'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { uploadFotoPerfil, uploadFotoDocumento } from '@/lib/uploadHelpers'
import { prepararFoto } from '@/lib/utils/foto-registro'
import SelectorFoto from '@/components/ui/SelectorFoto'
import { PhoneInput, phoneToDigits } from '@/components/ui/PhoneInput'
import { ESPECIALIDADES, ESPECIALIDADES_INFO } from '@/lib/constants/especialidades'
import { aplicarDeclaracionTecnico } from '@/lib/constants/certificaciones'
import { PRIVACIDAD_VERSION } from '@/lib/constants/legal'
import { TYC_VERSION } from '@/types/solicitud'

type SiNo = '' | 'si' | 'no'

const BENEFITS = [
  { icon: '📲', label: 'Solicitudes directo a tu WhatsApp' },
  { icon: '🕐', label: 'Trabaja cuando quieras' },
  { icon: '💳', label: 'Pago a través de Baird Service' },
  { icon: '🔒', label: 'Red de técnicos verificados' },
]

export default function RegistroTecnico() {
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' })

  const [formData, setFormData] = useState({
    nombre_completo: '',
    whatsapp: '',
    ciudad_pueblo: '',
    tipo_documento: 'CC',
    numero_documento: '',
    especialidades: [] as string[],
    tiene_arl: '' as SiNo,
    // Gasodomésticos: intervenir un artefacto a gas exige certificado de
    // competencia laboral (Res. 90902/2013). Se pregunta explícito para
    // poder exigirlo después en el matching. Ver docs/CERTIFICACIONES.md.
    cubre_gasodomesticos: '' as SiNo,
    tiene_cert_gas: '' as SiNo,
    acepta_garantias: true
  })

  // Aceptaciones legales requeridas para enviar el registro: Términos +
  // autorización de datos (Ley 1581/2012). El contrato de prestación de
  // servicios NO se acepta aquí: se firma en físico y el admin lo marca en
  // /admin/tecnicos/[id]. Ver supabase/migrations/20261009_tecnicos_aceptacion_legal.sql
  const [aceptaContrato, setAceptaContrato] = useState(false)
  const [autorizaDatos, setAutorizaDatos] = useState(false)
  const [fotoPerfil, setFotoPerfil] = useState<File | null>(null)
  const [fotoDocumento, setFotoDocumento] = useState<File | null>(null)
  const [previewPerfil, setPreviewPerfil] = useState<string | null>(null)
  const [previewDocumento, setPreviewDocumento] = useState<string | null>(null)
  // Foto que se está comprimiendo en el navegador (ver utils/foto-registro.ts)
  const [procesandoFoto, setProcesandoFoto] = useState<'perfil' | 'documento' | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    const checked = 'checked' in e.target ? (e.target as HTMLInputElement).checked : false
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  // Entrada única para la cámara en vivo y la galería (SelectorFoto).
  const procesarFoto = async (file: File | undefined, tipo: 'perfil' | 'documento') => {
    if (!file) return

    setProcesandoFoto(tipo)
    try {
      // Detecta el tipo real, comprime a JPEG y valida límites en el navegador.
      // Acepta fotos de cámara pesadas, WebP, HEIC (donde el navegador lo
      // decodifica) y archivos sin MIME/extensión; solo rechaza lo que no es
      // imagen o no se pudo convertir, con mensaje accionable.
      const listo = await prepararFoto(file, tipo)
      if (tipo === 'perfil') {
        if (previewPerfil) URL.revokeObjectURL(previewPerfil)
        setFotoPerfil(listo)
        setPreviewPerfil(URL.createObjectURL(listo))
      } else {
        if (previewDocumento) URL.revokeObjectURL(previewDocumento)
        setFotoDocumento(listo)
        setPreviewDocumento(URL.createObjectURL(listo))
      }
      if (mensaje.tipo === 'error') setMensaje({ texto: '', tipo: '' })
    } catch (err) {
      setMensaje({ texto: err instanceof Error ? err.message : 'No se pudo procesar la imagen', tipo: 'error' })
    } finally {
      setProcesandoFoto(null)
    }
  }

  const quitarFoto = (tipo: 'perfil' | 'documento') => {
    if (tipo === 'perfil') {
      if (previewPerfil) URL.revokeObjectURL(previewPerfil)
      setFotoPerfil(null)
      setPreviewPerfil(null)
    } else {
      if (previewDocumento) URL.revokeObjectURL(previewDocumento)
      setFotoDocumento(null)
      setPreviewDocumento(null)
    }
  }

  const handleEspecialidadToggle = (especialidad: string) => {
    setFormData(prev => ({
      ...prev,
      especialidades: prev.especialidades.includes(especialidad)
        ? prev.especialidades.filter(e => e !== especialidad)
        : [...prev.especialidades, especialidad]
    }))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setCargando(true)
    setMensaje({ texto: '', tipo: '' })

    try {
      if (formData.especialidades.length === 0) {
        throw new Error('Debes seleccionar al menos una especialidad')
      }
      if (!fotoPerfil) {
        throw new Error('La foto de perfil es requerida')
      }
      if (!fotoDocumento) {
        throw new Error('La foto del documento es requerida')
      }
      if (formData.tiene_arl !== 'si' && formData.tiene_arl !== 'no') {
        throw new Error('Indica si estás afiliado a una ARL')
      }
      if (formData.cubre_gasodomesticos !== 'si' && formData.cubre_gasodomesticos !== 'no') {
        throw new Error('Indica si atiendes equipos a gas (gasodomésticos)')
      }
      if (formData.cubre_gasodomesticos === 'si' && formData.tiene_cert_gas !== 'si' && formData.tiene_cert_gas !== 'no') {
        throw new Error('Indica si tienes el certificado de competencia laboral en gas')
      }

      if (!aceptaContrato) {
        throw new Error('Debes aceptar los Términos y Condiciones')
      }
      if (!autorizaDatos) {
        throw new Error('Debes autorizar el tratamiento de tus datos personales')
      }

      const cubreGas = formData.cubre_gasodomesticos === 'si'
      // Solo siembra "declarada"/"sin_revisar"; verificar es tarea del admin.
      const certificaciones = cubreGas
        ? aplicarDeclaracionTecnico({}, { competencia_gas: formData.tiene_cert_gas === 'si' }, 'registro')
        : {}

      // 1. Insertar técnico inicial
      const { data: tecnicoData, error: insertError } = await supabase
        .from('tecnicos')
        .insert([{
          nombre_completo: formData.nombre_completo.trim(),
          whatsapp: phoneToDigits(formData.whatsapp),
          ciudad_pueblo: formData.ciudad_pueblo.trim(),
          tipo_documento: formData.tipo_documento,
          numero_documento: formData.numero_documento,
          especialidad_principal: formData.especialidades[0],
          tiene_arl: formData.tiene_arl === 'si',
          cubre_gasodomesticos: cubreGas,
          certificaciones,
          acepta_garantias: formData.acepta_garantias,
          tyc_version: TYC_VERSION,
          tyc_aceptados_at: new Date().toISOString(),
          datos_version: PRIVACIDAD_VERSION,
          datos_autorizados_at: new Date().toISOString(),
          estado_verificacion: 'pendiente'
        }])
        .select()
        .single()

      if (insertError) throw new Error(insertError.message)

      const tecnicoId = tecnicoData.id

      // 2. Subir fotos — si falla, eliminar el técnico recién insertado
      let fotoPerfilUrl: string
      let fotoDocumentoUrl: string

      try {
        fotoPerfilUrl = await uploadFotoPerfil(fotoPerfil, tecnicoId)
      } catch (uploadError: unknown) {
        await supabase.from('tecnicos').delete().eq('id', tecnicoId)
        throw new Error('Error al subir la foto de perfil: ' + (uploadError instanceof Error ? uploadError.message : String(uploadError)))
      }

      try {
        fotoDocumentoUrl = await uploadFotoDocumento(fotoDocumento, tecnicoId)
      } catch (uploadError: unknown) {
        await supabase.from('tecnicos').delete().eq('id', tecnicoId)
        throw new Error('Error al subir la foto del documento: ' + (uploadError instanceof Error ? uploadError.message : String(uploadError)))
      }

      // 3. Actualizar técnico con URLs de fotos
      const { error: updateError } = await supabase
        .from('tecnicos')
        .update({
          foto_perfil_url: fotoPerfilUrl,
          foto_documento_url: fotoDocumentoUrl
        })
        .eq('id', tecnicoId)

      if (updateError) throw new Error(updateError.message)

      // 4. Guardar especialidades en tabla junction
      const especialidadesRows = formData.especialidades.map(esp => ({
        tecnico_id: tecnicoId,
        especialidad: esp,
      }))

      const { error: espError } = await supabase
        .from('especialidades_tecnico')
        .insert(especialidadesRows)

      if (espError) throw new Error(espError.message)

      // 5. Enviar mensaje de bienvenida por WhatsApp (fire-and-forget)
      fetch('/api/notificar-registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tecnicoId }),
      }).catch((err) => console.warn('WhatsApp notification failed:', err))

      setMensaje({
        texto: '¡Registro exitoso! Te enviamos un mensaje de bienvenida a tu WhatsApp. Tu cuenta está pendiente de verificación.',
        tipo: 'exito'
      })

      setFormData({
        nombre_completo: '',
        whatsapp: '',
        ciudad_pueblo: '',
        tipo_documento: 'CC',
        numero_documento: '',
        especialidades: [],
        tiene_arl: '',
        cubre_gasodomesticos: '',
        tiene_cert_gas: '',
        acepta_garantias: true
      })
      setAceptaContrato(false)
      setAutorizaDatos(false)
      setFotoPerfil(null)
      setFotoDocumento(null)
      setPreviewPerfil(null)
      setPreviewDocumento(null)

    } catch (error: unknown) {
      console.error(error)
      setMensaje({ texto: 'Hubo un error al registrar: ' + (error instanceof Error ? error.message : String(error)), tipo: 'error' })
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-gray-100 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm font-medium">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Inicio
          </Link>
          <Link href="/" className="relative w-44 h-12 block">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill sizes="176px" className="object-contain" priority />
          </Link>
          <div className="w-16" />
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12">

        {/* Page heading */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
            Únete a nuestra <span className="text-blue-600">red de técnicos</span>
          </h1>
          <p className="text-gray-500 text-base max-w-lg mx-auto">
            Recibe solicitudes de servicio directo en tu WhatsApp y trabaja cuando quieras.
          </p>
        </div>

        {/* ── 2-column grid on desktop ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

          {/* ── LEFT: Form ── */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">

              {mensaje.texto && (
                <div className={`p-4 mb-6 rounded-xl text-sm font-medium ${
                  mensaje.tipo === 'exito'
                    ? 'bg-green-50 text-green-800 border border-green-200'
                    : 'bg-red-50 text-red-800 border border-red-200'
                }`}>
                  <span className="mr-2">{mensaje.tipo === 'exito' ? '✅' : '⚠️'}</span>
                  {mensaje.texto}
                </div>
              )}

              <form className="space-y-8" onSubmit={handleSubmit}>

                {/* ── Sección: Datos personales ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Datos personales</p>
                  <div className="space-y-4">

                    {/* Nombre */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                        Nombre Completo <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        name="nombre_completo"
                        required
                        value={formData.nombre_completo}
                        onChange={handleChange}
                        className="block w-full border border-gray-200 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                        placeholder="Juan Pérez"
                      />
                    </div>

                    {/* WhatsApp + Ciudad */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <PhoneInput
                        label="WhatsApp"
                        name="whatsapp"
                        value={formData.whatsapp}
                        onChange={(v) => setFormData(prev => ({ ...prev, whatsapp: v }))}
                        required
                      />
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                          Ciudad o Pueblo <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="ciudad_pueblo"
                          required
                          value={formData.ciudad_pueblo}
                          onChange={handleChange}
                          className="block w-full border border-gray-200 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                          placeholder="Bogotá, Chía, Cajicá..."
                        />
                      </div>
                    </div>

                    {/* Documento */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                          Tipo de Documento <span className="text-red-500">*</span>
                        </label>
                        <select
                          name="tipo_documento"
                          value={formData.tipo_documento}
                          onChange={handleChange}
                          className="block w-full border border-gray-200 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                        >
                          <option value="CC">Cédula de Ciudadanía</option>
                          <option value="CE">Cédula de Extranjería</option>
                          <option value="Pasaporte">Pasaporte</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                          Número de Documento <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          name="numero_documento"
                          required
                          value={formData.numero_documento}
                          onChange={handleChange}
                          placeholder="12345678"
                          className="block w-full border border-gray-200 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                        />
                      </div>
                    </div>

                  </div>
                </div>

                {/* ── Sección: Verificación de identidad ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Verificación de identidad</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    {/* Foto Perfil */}
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-1.5">
                        Foto de Perfil <span className="text-red-500">*</span>
                      </p>
                      <p className="text-xs text-gray-400 mb-2">Cara clara, buena iluminación. Cualquier foto del celular: se ajusta sola.</p>
                      {previewPerfil ? (
                        <div className="flex flex-col items-center justify-center p-4 border-2 border-blue-300 rounded-xl bg-blue-50 min-h-[120px] gap-3">
                          <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-blue-500">
                            <Image src={previewPerfil} alt="Perfil" fill className="object-cover" />
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <SelectorFoto
                              variant="links"
                              capture="user"
                              labelCamara="📷 Tomar otra"
                              labelGaleria="🖼️ Elegir guardada"
                              disabled={procesandoFoto === 'perfil'}
                              onFiles={(files) => procesarFoto(files[0], 'perfil')}
                            />
                            <button type="button" onClick={() => quitarFoto('perfil')} className="text-xs font-semibold text-red-600 underline">
                              Quitar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 min-h-[120px] gap-2">
                          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          {procesandoFoto === 'perfil' ? (
                            <span className="text-xs font-semibold text-blue-600">Preparando foto…</span>
                          ) : (
                            // Cámara FRONTAL (capture="user"): es una selfie de identificación.
                            <SelectorFoto
                              variant="tiles"
                              capture="user"
                              labelCamara="📷 Tomar foto"
                              labelGaleria="🖼️ Foto guardada"
                              onFiles={(files) => procesarFoto(files[0], 'perfil')}
                            />
                          )}
                        </div>
                      )}
                    </div>

                    {/* Foto Documento */}
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-1.5">
                        Foto del Documento <span className="text-red-500">*</span>
                      </p>
                      <p className="text-xs text-gray-400 mb-2">Cédula o documento legible. Se ajusta sola al subirla.</p>
                      {previewDocumento ? (
                        <div className="flex flex-col items-center justify-center p-4 border-2 border-blue-300 rounded-xl bg-blue-50 min-h-[120px] gap-3">
                          <div className="relative w-full h-20 rounded-lg overflow-hidden border-2 border-blue-500">
                            <Image src={previewDocumento} alt="Documento" fill className="object-cover" />
                          </div>
                          <div className="flex flex-wrap items-center justify-center gap-3">
                            <SelectorFoto
                              variant="links"
                              capture="environment"
                              labelCamara="📷 Tomar otra"
                              labelGaleria="🖼️ Elegir guardada"
                              disabled={procesandoFoto === 'documento'}
                              onFiles={(files) => procesarFoto(files[0], 'documento')}
                            />
                            <button type="button" onClick={() => quitarFoto('documento')} className="text-xs font-semibold text-red-600 underline">
                              Quitar
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center p-3 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 min-h-[120px] gap-2">
                          <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          {procesandoFoto === 'documento' ? (
                            <span className="text-xs font-semibold text-blue-600">Preparando foto…</span>
                          ) : (
                            // Cámara TRASERA: foto de la cédula sobre la mesa.
                            <SelectorFoto
                              variant="tiles"
                              capture="environment"
                              labelCamara="📷 Tomar foto"
                              labelGaleria="🖼️ Foto guardada"
                              onFiles={(files) => procesarFoto(files[0], 'documento')}
                            />
                          )}
                        </div>
                      )}
                    </div>

                  </div>
                </div>

                {/* ── Sección: Especialidades ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Especialidades</p>
                  <p className="text-sm text-gray-500 mb-3">Selecciona todos los equipos que sabes reparar. La primera que marques será tu especialidad principal.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ESPECIALIDADES.map((especialidad) => {
                      const selected = formData.especialidades.includes(especialidad)
                      const info = ESPECIALIDADES_INFO[especialidad]
                      return (
                        <button
                          key={especialidad}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => handleEspecialidadToggle(especialidad)}
                          className={`flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                            selected
                              ? 'border-blue-500 bg-blue-50 text-blue-900'
                              : 'border-gray-200 hover:border-blue-300 text-gray-700'
                          }`}
                        >
                          <span className="text-xl leading-none mt-0.5">{info.icono}</span>
                          <span className="flex-1 min-w-0">
                            <span className="block text-sm font-medium">{especialidad}</span>
                            <span className={`block text-[11px] leading-snug mt-0.5 ${selected ? 'text-blue-700/80' : 'text-gray-400'}`}>
                              {info.cubre}
                            </span>
                          </span>
                          {selected && (
                            <span className="ml-auto w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {formData.especialidades.length === 0 && (
                    <p className="mt-2 text-xs text-red-500">* Selecciona al menos una especialidad</p>
                  )}
                </div>

                {/* ── Sección: Gasodomésticos ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Gasodomésticos</p>
                  <p className="text-sm font-semibold text-gray-700 mb-1.5">
                    ¿Atiendes equipos a gas (estufas, hornos, calentadores, secadoras a gas)? <span className="text-red-500">*</span>
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    En Colombia intervenir un artefacto a gas exige certificado de competencia laboral (Res. 90902 de 2013).
                    Si marcas &ldquo;Sí&rdquo; te lo pediremos en la verificación.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { valor: 'si' as const, icono: '🔥', texto: 'Sí, atiendo gas' },
                      { valor: 'no' as const, icono: '⚡', texto: 'Solo eléctricos' },
                    ]).map(({ valor, icono, texto }) => {
                      const selected = formData.cubre_gasodomesticos === valor
                      return (
                        <button
                          key={valor}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setFormData(prev => ({ ...prev, cubre_gasodomesticos: valor, tiene_cert_gas: valor === 'no' ? '' : prev.tiene_cert_gas }))}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                            selected
                              ? 'border-blue-500 bg-blue-50 text-blue-900'
                              : 'border-gray-200 hover:border-blue-300 text-gray-700'
                          }`}
                        >
                          <span className="text-xl">{icono}</span>
                          <span className="text-sm font-medium">{texto}</span>
                          {selected && (
                            <span className="ml-auto w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {formData.cubre_gasodomesticos === '' && (
                    <p className="mt-2 text-xs text-red-500">* Selecciona una opción</p>
                  )}

                  {formData.cubre_gasodomesticos === 'si' && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-amber-900 mb-1.5">
                        ¿Tienes certificado de competencia laboral en gas vigente? <span className="text-red-500">*</span>
                      </p>
                      <p className="text-xs text-amber-800/80 mb-3">
                        Lo expide el SENA o un organismo de certificación de personas acreditado por ONAC. Si todavía no lo tienes puedes registrarte igual.
                      </p>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          { valor: 'si' as const, texto: 'Sí, lo tengo' },
                          { valor: 'no' as const, texto: 'Todavía no' },
                        ]).map(({ valor, texto }) => {
                          const selected = formData.tiene_cert_gas === valor
                          return (
                            <button
                              key={valor}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => setFormData(prev => ({ ...prev, tiene_cert_gas: valor }))}
                              className={`p-2.5 rounded-xl border-2 text-sm font-medium text-left transition-all ${
                                selected
                                  ? 'border-amber-500 bg-white text-amber-900'
                                  : 'border-amber-200 bg-white/60 hover:border-amber-400 text-gray-700'
                              }`}
                            >
                              {texto}
                            </button>
                          )
                        })}
                      </div>
                      {formData.tiene_cert_gas === '' && (
                        <p className="mt-2 text-xs text-red-500">* Selecciona una opción</p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── Sección: Seguridad social ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Seguridad social</p>
                  <p className="text-sm font-semibold text-gray-700 mb-1.5">
                    ¿Tienes ARL (afiliación a riesgos laborales)? <span className="text-red-500">*</span>
                  </p>
                  <p className="text-xs text-gray-400 mb-3">
                    Muchos conjuntos y empresas la exigen para dejar ingresar al técnico. Si no la tienes puedes registrarte igual.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { valor: 'si' as const, icono: '🛡️', texto: 'Sí, tengo ARL' },
                      { valor: 'no' as const, icono: '🚫', texto: 'No tengo ARL' },
                    ]).map(({ valor, icono, texto }) => {
                      const selected = formData.tiene_arl === valor
                      return (
                        <button
                          key={valor}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setFormData(prev => ({ ...prev, tiene_arl: valor }))}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                            selected
                              ? 'border-blue-500 bg-blue-50 text-blue-900'
                              : 'border-gray-200 hover:border-blue-300 text-gray-700'
                          }`}
                        >
                          <span className="text-xl">{icono}</span>
                          <span className="text-sm font-medium">{texto}</span>
                          {selected && (
                            <span className="ml-auto w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {formData.tiene_arl === '' && (
                    <p className="mt-2 text-xs text-red-500">* Selecciona una opción</p>
                  )}
                </div>

                {/* ── Garantías ── */}
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <input
                      id="garantias"
                      name="acepta_garantias"
                      type="checkbox"
                      checked={formData.acepta_garantias}
                      onChange={handleChange}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer shrink-0 mt-0.5"
                    />
                    <div>
                      <label htmlFor="garantias" className="font-semibold text-sm text-gray-900 cursor-pointer">
                        Acepto realizar servicios de garantía
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        Como parte de nuestra red, podrás atender servicios con garantía de marca
                      </p>
                    </div>
                  </div>
                </div>

                {/* ── Aceptaciones legales (obligatorias) ── */}
                <div className="space-y-3 border border-gray-200 rounded-xl p-4">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={aceptaContrato}
                      onChange={(e) => setAceptaContrato(e.target.checked)}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer shrink-0 mt-0.5"
                    />
                    <span className="text-sm text-gray-700">
                      He leído y acepto los{' '}
                      <Link href="/terminos" target="_blank" className="text-blue-600 underline">Términos y Condiciones</Link>.
                      Entiendo que me vinculo como contratista independiente, sin relación laboral, y que para quedar
                      habilitado debo <strong>firmar en físico</strong> el{' '}
                      <Link href="/contrato-tecnico" target="_blank" className="text-blue-600 underline font-semibold">
                        Contrato de Prestación de Servicios
                      </Link>{' '}
                      y acreditar RUT y afiliación a salud, pensión y ARL.
                    </span>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autorizaDatos}
                      onChange={(e) => setAutorizaDatos(e.target.checked)}
                      className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer shrink-0 mt-0.5"
                    />
                    <span className="text-sm text-gray-700">
                      Autorizo a Baird Service S.A.S. a tratar mis datos personales, incluidos los sensibles
                      (fotografía de mi rostro y documento, ubicación GPS durante los servicios e información de
                      seguridad social), conforme a la{' '}
                      <Link href="/politica-privacidad" target="_blank" className="text-blue-600 underline">
                        Política de Privacidad y Tratamiento de Datos
                      </Link>
                      . Sé que la autorización de datos sensibles es facultativa.
                    </span>
                  </label>
                </div>

                {/* Botón de envío */}
                <button
                  type="submit"
                  disabled={cargando}
                  className={`w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold text-white transition-all duration-200 shadow-sm ${
                    cargando
                      ? 'bg-blue-400 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 hover:shadow-md active:scale-[0.99]'
                  }`}
                >
                  {cargando ? (
                    <>
                      <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Registrando...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                      </svg>
                      Registrarme como Técnico
                    </>
                  )}
                </button>

                <p className="text-center text-xs text-gray-400">
                  Al registrarte formarás parte de la red de técnicos verificados de Baird Service S.A.S
                </p>

              </form>
            </div>
          </div>

          {/* ── RIGHT: Info sidebar ── */}
          <aside className="lg:col-span-2 space-y-5">

            {/* Benefits */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-slate-900 mb-4 text-sm">¿Por qué unirte?</h3>
              <div className="space-y-3">
                {BENEFITS.map(({ icon, label }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xl w-8 text-center shrink-0">{icon}</span>
                    <p className="text-sm font-medium text-slate-700">{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Process */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-slate-900 mb-4 text-sm">Proceso de verificación</h3>
              <ol className="space-y-3">
                {[
                  { n: '1', t: 'Envías tu registro', d: 'Datos y fotos de verificación' },
                  { n: '2', t: 'Revisamos tu perfil', d: 'Verificamos identidad y documentos' },
                  { n: '3', t: 'Cuenta activada', d: 'Empiezas a recibir solicitudes' },
                ].map(({ n, t, d }) => (
                  <li key={n} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {n}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{t}</p>
                      <p className="text-xs text-gray-400">{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* CTA for clients */}
            <div className="bg-green-50 rounded-2xl border border-green-100 p-5">
              <p className="text-sm font-semibold text-green-900 mb-1">¿Necesitas un servicio técnico?</p>
              <p className="text-xs text-green-700 mb-3">Solicita atención de nuestros técnicos verificados.</p>
              <Link
                href="/solicitar"
                className="block text-center text-sm font-semibold text-green-700 border border-green-300 rounded-xl py-2 hover:bg-green-100 transition-colors"
              >
                Solicitar servicio →
              </Link>
            </div>

          </aside>
        </div>
      </div>
    </div>
  )
}
