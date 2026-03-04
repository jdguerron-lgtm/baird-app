'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { uploadFotoPerfil, uploadFotoDocumento } from '@/lib/uploadHelpers'

const ESPECIALIDADES = ['Lavadoras', 'Neveras y Nevecones', 'Hornos y Estufas', 'Aires Acondicionados']

const ESPECIALIDAD_ICONS: Record<string, string> = {
  'Lavadoras': '🫧',
  'Neveras y Nevecones': '❄️',
  'Hornos y Estufas': '🔥',
  'Aires Acondicionados': '💨',
}

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
    acepta_garantias: true
  })

  const [fotoPerfil, setFotoPerfil] = useState<File | null>(null)
  const [fotoDocumento, setFotoDocumento] = useState<File | null>(null)
  const [previewPerfil, setPreviewPerfil] = useState<string | null>(null)
  const [previewDocumento, setPreviewDocumento] = useState<string | null>(null)

  const handleChange = (e: any) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, tipo: 'perfil' | 'documento') => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMensaje({ texto: 'Por favor selecciona una imagen válida', tipo: 'error' })
      return
    }

    const maxSize = tipo === 'documento' ? 5 * 1024 * 1024 : 2 * 1024 * 1024
    if (file.size > maxSize) {
      setMensaje({
        texto: `La imagen excede el tamaño máximo de ${maxSize / 1024 / 1024}MB`,
        tipo: 'error'
      })
      return
    }

    if (tipo === 'perfil') {
      setFotoPerfil(file)
      setPreviewPerfil(URL.createObjectURL(file))
    } else {
      setFotoDocumento(file)
      setPreviewDocumento(URL.createObjectURL(file))
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

  const handleSubmit = async (e: any) => {
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

      // 1. Insertar técnico inicial
      const { data: tecnicoData, error: insertError } = await supabase
        .from('tecnicos')
        .insert([{
          nombre_completo: formData.nombre_completo,
          whatsapp: formData.whatsapp,
          ciudad_pueblo: formData.ciudad_pueblo,
          tipo_documento: formData.tipo_documento,
          numero_documento: formData.numero_documento,
          especialidad_principal: formData.especialidades[0],
          acepta_garantias: formData.acepta_garantias,
          estado_verificacion: 'pendiente'
        }])
        .select()
        .single()

      if (insertError) throw insertError

      const tecnicoId = tecnicoData.id

      // 2. Subir fotos — si falla, eliminar el técnico recién insertado
      let fotoPerfilUrl: string
      let fotoDocumentoUrl: string

      try {
        fotoPerfilUrl = await uploadFotoPerfil(fotoPerfil, tecnicoId)
      } catch (uploadError: any) {
        await supabase.from('tecnicos').delete().eq('id', tecnicoId)
        throw new Error('Error al subir la foto de perfil: ' + uploadError.message)
      }

      try {
        fotoDocumentoUrl = await uploadFotoDocumento(fotoDocumento, tecnicoId)
      } catch (uploadError: any) {
        await supabase.from('tecnicos').delete().eq('id', tecnicoId)
        throw new Error('Error al subir la foto del documento: ' + uploadError.message)
      }

      // 3. Actualizar técnico con URLs de fotos
      const { error: updateError } = await supabase
        .from('tecnicos')
        .update({
          foto_perfil_url: fotoPerfilUrl,
          foto_documento_url: fotoDocumentoUrl
        })
        .eq('id', tecnicoId)

      if (updateError) throw updateError

      // 4. Guardar especialidades en tabla junction
      const especialidadesRows = formData.especialidades.map(esp => ({
        tecnico_id: tecnicoId,
        especialidad: esp,
      }))

      const { error: espError } = await supabase
        .from('especialidades_tecnico')
        .insert(especialidadesRows)

      if (espError) throw espError

      setMensaje({
        texto: '¡Registro exitoso! Tu cuenta está pendiente de verificación. Te contactaremos pronto.',
        tipo: 'exito'
      })

      setFormData({
        nombre_completo: '',
        whatsapp: '',
        ciudad_pueblo: '',
        tipo_documento: 'CC',
        numero_documento: '',
        especialidades: [],
        acepta_garantias: true
      })
      setFotoPerfil(null)
      setFotoDocumento(null)
      setPreviewPerfil(null)
      setPreviewDocumento(null)

    } catch (error: any) {
      console.error(error)
      setMensaje({ texto: 'Hubo un error al registrar: ' + error.message, tipo: 'error' })
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
          <div className="flex items-center gap-1">
            <span className="text-lg font-bold text-slate-900 tracking-tight">baird</span>
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest mt-0.5">service</span>
          </div>
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
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                          WhatsApp <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="tel"
                          name="whatsapp"
                          required
                          value={formData.whatsapp}
                          onChange={handleChange}
                          className="block w-full border border-gray-200 rounded-xl py-2.5 px-4 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all hover:border-blue-300"
                          placeholder="+57 300 123 4567"
                        />
                        <p className="mt-1 text-xs text-gray-400">Con código de país</p>
                      </div>
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
                      <p className="text-xs text-gray-400 mb-2">Cara clara, buena iluminación. Máx 2MB</p>
                      <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer min-h-[120px]">
                        {previewPerfil ? (
                          <div className="relative w-20 h-20 rounded-full overflow-hidden border-2 border-blue-500">
                            <Image src={previewPerfil} alt="Perfil" fill className="object-cover" />
                          </div>
                        ) : (
                          <>
                            <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                            <span className="text-xs font-semibold text-blue-600">Subir foto de perfil</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileChange(e, 'perfil')}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {/* Foto Documento */}
                    <div>
                      <p className="text-sm font-semibold text-gray-700 mb-1.5">
                        Foto del Documento <span className="text-red-500">*</span>
                      </p>
                      <p className="text-xs text-gray-400 mb-2">Cédula o documento legible. Máx 5MB</p>
                      <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-gray-200 rounded-xl bg-gray-50 hover:bg-blue-50 hover:border-blue-300 transition-colors cursor-pointer min-h-[120px]">
                        {previewDocumento ? (
                          <div className="relative w-full h-20 rounded-lg overflow-hidden border-2 border-blue-500">
                            <Image src={previewDocumento} alt="Documento" fill className="object-cover" />
                          </div>
                        ) : (
                          <>
                            <svg className="w-10 h-10 text-gray-300 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-xs font-semibold text-blue-600">Subir documento</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleFileChange(e, 'documento')}
                          className="hidden"
                        />
                      </label>
                    </div>

                  </div>
                </div>

                {/* ── Sección: Especialidades ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Especialidades</p>
                  <p className="text-sm text-gray-500 mb-3">Selecciona todos los equipos que sabes reparar</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {ESPECIALIDADES.map((especialidad) => {
                      const selected = formData.especialidades.includes(especialidad)
                      return (
                        <button
                          key={especialidad}
                          type="button"
                          onClick={() => handleEspecialidadToggle(especialidad)}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                            selected
                              ? 'border-blue-500 bg-blue-50 text-blue-900'
                              : 'border-gray-200 hover:border-blue-300 text-gray-700'
                          }`}
                        >
                          <span className="text-xl">{ESPECIALIDAD_ICONS[especialidad]}</span>
                          <span className="text-sm font-medium">{especialidad}</span>
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
                  {formData.especialidades.length === 0 && (
                    <p className="mt-2 text-xs text-red-500">* Selecciona al menos una especialidad</p>
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
