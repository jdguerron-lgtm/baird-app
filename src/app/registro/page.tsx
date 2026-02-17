'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { uploadFotoPerfil, uploadFotoDocumento } from '@/lib/uploadHelpers'
import Image from 'next/image'

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

  // Estados para archivos y previews
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

    // Validar tipo de archivo
    if (!file.type.startsWith('image/')) {
      setMensaje({ texto: 'Por favor selecciona una imagen válida', tipo: 'error' })
      return
    }

    // Validar tamaño
    const maxSize = tipo === 'documento' ? 5 * 1024 * 1024 : 2 * 1024 * 1024
    if (file.size > maxSize) {
      setMensaje({
        texto: `La imagen excede el tamaño máximo de ${maxSize / 1024 / 1024}MB`,
        tipo: 'error'
      })
      return
    }

    // Guardar archivo y crear preview
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
      // Validaciones
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

      // 2. Subir fotos
      const fotoPerfilUrl = await uploadFotoPerfil(fotoPerfil, tecnicoId)
      const fotoDocumentoUrl = await uploadFotoDocumento(fotoDocumento, tecnicoId)

      // 3. Actualizar técnico con URLs
      const { error: updateError } = await supabase
        .from('tecnicos')
        .update({
          foto_perfil_url: fotoPerfilUrl,
          foto_documento_url: fotoDocumentoUrl
        })
        .eq('id', tecnicoId)

      if (updateError) throw updateError

      setMensaje({
        texto: '¡Registro exitoso! Tu cuenta está pendiente de verificación.',
        tipo: 'exito'
      })

      // Limpiar formulario completo
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          {/* Temporalmente comentado mientras se agrega el logo 
          <div className="relative w-64 h-24">
            <Image
              src="/baird-logo.png"
              alt="Baird Service"
              fill
              className="object-contain"
              priority
            />
          </div>
          */}
          <div className="text-center">
            <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-900 to-blue-600 bg-clip-text text-transparent">
              baird
            </h1>
            <p className="text-xl font-semibold text-gray-800 tracking-wide">SERVICE S.A.S</p>
          </div>
        </div>

        <h2 className="mt-4 text-center text-3xl font-bold bg-gradient-to-r from-blue-900 to-blue-600 bg-clip-text text-transparent">
          Únete a Nuestra Red de Técnicos
        </h2>
        <p className="mt-3 text-center text-base text-gray-600 max-w-sm mx-auto">
          Forma parte del equipo de expertos en electrodomésticos y recibe solicitudes directamente en tu celular
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-lg">
        <div className="bg-white py-10 px-6 shadow-2xl sm:rounded-2xl sm:px-12 border border-blue-100">

          {mensaje.texto && (
            <div className={`p-4 mb-6 rounded-xl text-sm font-medium shadow-sm ${mensaje.tipo === 'exito' ? 'bg-gradient-to-r from-green-50 to-green-100 text-green-800 border border-green-200' : 'bg-gradient-to-r from-red-50 to-red-100 text-red-800 border border-red-200'}`}>
              <div className="flex items-center">
                <span className="text-lg mr-2">{mensaje.tipo === 'exito' ? '✓' : '⚠'}</span>
                {mensaje.texto}
              </div>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>

            {/* Nombre */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <span className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  Nombre Completo
                </span>
              </label>
              <input
                type="text"
                name="nombre_completo"
                required
                value={formData.nombre_completo}
                onChange={handleChange}
                className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm hover:border-blue-300"
                placeholder="Juan Pérez"
              />
            </div>

            {/* WhatsApp */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <span className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                  WhatsApp
                </span>
              </label>
              <input
                type="tel"
                name="whatsapp"
                required
                value={formData.whatsapp}
                onChange={handleChange}
                className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm hover:border-blue-300"
                placeholder="+57 300 123 4567"
              />
              <p className="mt-1.5 text-xs text-gray-500">Incluye el código de país</p>
            </div>

            {/* Documento de Identidad */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Tipo de Documento
                </label>
                <select
                  name="tipo_documento"
                  value={formData.tipo_documento}
                  onChange={handleChange}
                  className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm hover:border-blue-300"
                >
                  <option value="CC">Cédula de Ciudadanía</option>
                  <option value="CE">Cédula de Extranjería</option>
                  <option value="Pasaporte">Pasaporte</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Número de Documento
                </label>
                <input
                  type="text"
                  name="numero_documento"
                  required
                  value={formData.numero_documento}
                  onChange={handleChange}
                  placeholder="12345678"
                  className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm hover:border-blue-300"
                />
              </div>
            </div>

            {/* Ciudad */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                <span className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Ciudad o Pueblo
                </span>
              </label>
              <input
                type="text"
                name="ciudad_pueblo"
                required
                value={formData.ciudad_pueblo}
                onChange={handleChange}
                placeholder="Bogotá, Chía, Cajicá..."
                className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm hover:border-blue-300"
              />
            </div>

            {/* Verificación Visual */}
            <div className="space-y-4">
              <label className="block text-sm font-semibold text-gray-700">
                Verificación de Identidad
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Foto Perfil */}
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-medium italic">1. Foto de Perfil (Cara clara)</p>
                  <div className="flex flex-col items-center p-4 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative overflow-hidden">
                    {previewPerfil ? (
                      <div className="relative w-24 h-24 rounded-full overflow-hidden border-2 border-blue-500">
                        <Image src={previewPerfil} alt="Perfil" fill className="object-cover" />
                      </div>
                    ) : (
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, 'perfil')}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <span className="mt-2 text-xs font-semibold text-blue-600">Subir Foto Perfil</span>
                  </div>
                </div>

                {/* Foto Documento */}
                <div className="space-y-2">
                  <p className="text-xs text-gray-500 font-medium italic">2. Foto de Documento</p>
                  <div className="flex flex-col items-center p-4 border-2 border-dashed border-gray-300 rounded-2xl bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer relative overflow-hidden">
                    {previewDocumento ? (
                      <div className="relative w-full h-24 rounded-lg overflow-hidden border-2 border-blue-500">
                        <Image src={previewDocumento} alt="Documento" fill className="object-cover" />
                      </div>
                    ) : (
                      <svg className="w-12 h-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileChange(e, 'documento')}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    <span className="mt-2 text-xs font-semibold text-blue-600">Subir Documento</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Especialidades - Múltiples selecciones */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                <span className="flex items-center">
                  <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Especialidades (Selecciona todas las que manejes)
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {['Lavadoras', 'Neveras y Nevecones', 'Hornos y Estufas', 'Aires Acondicionados'].map((especialidad) => (
                  <div
                    key={especialidad}
                    onClick={() => handleEspecialidadToggle(especialidad)}
                    className={`cursor-pointer border-2 rounded-xl p-3 transition-all ${formData.especialidades.includes(especialidad)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                      }`}
                  >
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        checked={formData.especialidades.includes(especialidad)}
                        onChange={() => { }} // Manejado por el div onClick
                        className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <label className="ml-3 block text-sm font-medium text-gray-900 cursor-pointer">
                        {especialidad}
                      </label>
                    </div>
                  </div>
                ))}
              </div>
              {formData.especialidades.length === 0 && (
                <p className="mt-2 text-xs text-red-600">* Selecciona al menos una especialidad</p>
              )}
            </div>

            {/* Garantías */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-start">
                <div className="flex items-center h-5">
                  <input
                    id="garantias"
                    name="acepta_garantias"
                    type="checkbox"
                    checked={formData.acepta_garantias}
                    onChange={handleChange}
                    className="h-5 w-5 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                  />
                </div>
                <div className="ml-3">
                  <label htmlFor="garantias" className="font-medium text-sm text-gray-900 cursor-pointer">
                    Acepto realizar servicios de garantía
                  </label>
                  <p className="text-xs text-gray-600 mt-1">
                    Como parte de nuestra red, podrás atender servicios con garantía
                  </p>
                </div>
              </div>
            </div>

            {/* Botón */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={cargando}
                className={`group relative w-full flex justify-center py-3.5 px-4 border border-transparent rounded-xl shadow-lg text-sm font-bold text-white transition-all duration-200 ${cargando
                  ? 'bg-gradient-to-r from-blue-400 to-blue-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 hover:shadow-xl transform hover:-translate-y-0.5'
                  } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}
              >
                {cargando ? (
                  <span className="flex items-center">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Registrando...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Registrarme como Técnico
                  </span>
                )}
              </button>
            </div>

          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-center text-xs text-gray-500">
              Al registrarte, formarás parte de la red de técnicos certificados de Baird Service
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
