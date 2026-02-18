'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { useSolicitudForm } from '@/hooks/useSolicitudForm'
import { useTriaje } from '@/hooks/useTriaje'
import { useDebounce } from '@/hooks/useDebounce'
import { submitSolicitud } from '@/lib/services/solicitud.service'
import { Alert } from '@/components/ui/Alert'
import { InputField } from '@/components/ui/InputField'
import { SelectField } from '@/components/ui/SelectField'
import { TextAreaField } from '@/components/ui/TextAreaField'
import { Button } from '@/components/ui/Button'
import { TriajeDisplay } from '@/components/solicitud/TriajeDisplay'
import {
  UserIcon,
  PhoneIcon,
  LocationIcon,
  TagIcon,
  AlertIcon,
  BoxIcon,
  ChecklistIcon,
  ShieldCheckIcon,
  DocumentIcon,
  BoltIcon
} from '@/components/icons'
import { TIPOS_EQUIPO, TIPOS_SOLICITUD } from '@/types/solicitud'

export default function SolicitarServicio() {
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'success' | 'error' } | null>(null)
  const [solicitudId, setSolicitudId] = useState<string | null>(null)

  // Hooks personalizados
  const { formData, errors, handleChange, validate, resetForm } = useSolicitudForm()
  const { triaje, triajeLoading, triajeError, analizarProblema, resetTriaje } = useTriaje()

  // Debounce para triaje automático (esperar 1.5s después de que el usuario deja de escribir)
  const debouncedNovedades = useDebounce(formData.novedades_equipo, 1500)

  // Effect: Analizar cuando el usuario deja de escribir
  useEffect(() => {
    if (
      debouncedNovedades.length >= 20 &&
      formData.tipo_equipo &&
      formData.marca_equipo
    ) {
      analizarProblema(
        debouncedNovedades,
        formData.tipo_equipo,
        formData.marca_equipo,
        formData.tipo_solicitud
      )
    } else {
      resetTriaje()
    }
  }, [debouncedNovedades, formData.tipo_equipo, formData.marca_equipo, formData.tipo_solicitud, analizarProblema, resetTriaje])

  // Submit con validación
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validar antes de enviar
    if (!validate()) {
      setMensaje({
        texto: 'Por favor corrige los errores en el formulario',
        tipo: 'error',
      })
      // Scroll to top para ver el mensaje
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setCargando(true)
    setMensaje(null)

    const result = await submitSolicitud(formData)

    if (result.success && result.data) {
      setSolicitudId(result.data.id)
      setMensaje({
        texto: `¡Solicitud #${result.data.id.slice(0, 8)} enviada exitosamente! Pronto un técnico se pondrá en contacto contigo.`,
        tipo: 'success',
      })
      resetForm()
      resetTriaje()
      // Scroll to top para ver el mensaje
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      setMensaje({
        texto: result.error || 'Hubo un error al enviar la solicitud',
        tipo: 'error',
      })
      // Scroll to top para ver el mensaje
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    setCargando(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="flex justify-center mb-6">
          <div className="relative w-64 h-24">
            <Image
              src="/Baird_Service_Logo.png"
              alt="Baird Service"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        <h2 className="mt-4 text-center text-3xl font-bold bg-gradient-to-r from-green-700 to-blue-700 bg-clip-text text-transparent">
          Solicita un Servicio Técnico
        </h2>
        <p className="mt-3 text-center text-base text-gray-600 max-w-xl mx-auto">
          Completa el formulario y te conectaremos con el mejor técnico de tu zona
        </p>
      </div>

      {/* Formulario */}
      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-10 px-6 shadow-2xl sm:rounded-2xl sm:px-12 border border-blue-100">

          {mensaje && (
            <Alert
              type={mensaje.tipo}
              message={mensaje.texto}
              onClose={() => setMensaje(null)}
            />
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>

            {/* Switch Garantía */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-5">
              <div className="flex items-start">
                <input
                  id="garantia"
                  name="es_garantia"
                  type="checkbox"
                  checked={formData.es_garantia}
                  onChange={handleChange}
                  className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded cursor-pointer mt-0.5"
                />
                <div className="ml-3">
                  <label htmlFor="garantia" className="font-bold text-base text-gray-900 cursor-pointer flex items-center">
                    <ShieldCheckIcon className="w-5 h-5 mr-2 text-purple-600" />
                    Esta es una solicitud de garantía de marca
                  </label>
                  <p className="text-sm text-gray-600 mt-1.5">
                    Si el equipo está en garantía, marca esta opción e ingresa el número de serie o factura
                  </p>
                </div>
              </div>
            </div>

            {/* Número de Serie (condicional) */}
            {formData.es_garantia && (
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 animate-fadeIn">
                <InputField
                  label="Número de Serie o # de Factura"
                  name="numero_serie_factura"
                  value={formData.numero_serie_factura}
                  onChange={handleChange}
                  placeholder="SN12345678 o Factura #001234"
                  error={errors.numero_serie_factura}
                  icon={<DocumentIcon className="w-5 h-5 mr-2 text-purple-600" />}
                  required
                />
              </div>
            )}

            {/* Grid de 2 columnas - Datos Personales */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField
                label="Tu Nombre"
                name="cliente_nombre"
                value={formData.cliente_nombre}
                onChange={handleChange}
                placeholder="María González"
                error={errors.cliente_nombre}
                icon={<UserIcon className="w-5 h-5 mr-2 text-green-600" />}
                required
              />

              <InputField
                label="Teléfono de Contacto"
                name="cliente_telefono"
                type="tel"
                value={formData.cliente_telefono}
                onChange={handleChange}
                placeholder="+57 300 123 4567"
                error={errors.cliente_telefono}
                icon={<PhoneIcon className="w-5 h-5 mr-2 text-green-600" />}
                required
              />
            </div>

            {/* Dirección */}
            <InputField
              label="Dirección Completa"
              name="direccion"
              value={formData.direccion}
              onChange={handleChange}
              placeholder="Calle 123 #45-67, Apto 301"
              error={errors.direccion}
              icon={<LocationIcon className="w-5 h-5 mr-2 text-green-600" />}
              required
            />

            {/* Grid Ciudad y Zona */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField
                label="Ciudad o Pueblo"
                name="ciudad_pueblo"
                value={formData.ciudad_pueblo}
                onChange={handleChange}
                placeholder="Bogotá, Medellín..."
                error={errors.ciudad_pueblo}
                required
              />

              <InputField
                label="Zona / Barrio"
                name="zona_servicio"
                value={formData.zona_servicio}
                onChange={handleChange}
                placeholder="Chapinero, Usaquén..."
                error={errors.zona_servicio}
                required
              />
            </div>

            {/* Grid Marca y Tipo */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <InputField
                label="Marca del Equipo"
                name="marca_equipo"
                value={formData.marca_equipo}
                onChange={handleChange}
                placeholder="Samsung, LG, Whirlpool..."
                error={errors.marca_equipo}
                icon={<TagIcon className="w-5 h-5 mr-2 text-blue-600" />}
                required
              />

              <SelectField
                label="Tipo de Equipo"
                name="tipo_equipo"
                value={formData.tipo_equipo}
                onChange={handleChange}
                options={TIPOS_EQUIPO}
                error={errors.tipo_equipo}
                icon={<BoxIcon className="w-5 h-5 mr-2 text-blue-600" />}
                required
              />
            </div>

            {/* Tipo de Solicitud */}
            <SelectField
              label="Tipo de Servicio"
              name="tipo_solicitud"
              value={formData.tipo_solicitud}
              onChange={handleChange}
              options={TIPOS_SOLICITUD}
              error={errors.tipo_solicitud}
              icon={<ChecklistIcon className="w-5 h-5 mr-2 text-blue-600" />}
              required
            />

            {/* Novedades del Equipo */}
            <TextAreaField
              label="¿Qué le pasa al equipo?"
              name="novedades_equipo"
              value={formData.novedades_equipo}
              onChange={handleChange}
              placeholder="Describe en detalle qué síntomas tiene el equipo. Ej: 'La lavadora hace un ruido fuerte al centrifugar y no termina el ciclo de lavado'"
              error={errors.novedades_equipo}
              rows={4}
              icon={<AlertIcon className="w-5 h-5 mr-2 text-orange-600" />}
              hint="💡 Incluye todos los detalles posibles. Nuestra IA los analizará para sugerir la posible falla."
              required
            />

            {/* Display de Triaje */}
            {triajeLoading && (
              <div className="text-center py-6 bg-blue-50 rounded-xl border border-blue-200">
                <div className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-sm font-medium text-blue-800">Analizando el problema con IA...</p>
                </div>
              </div>
            )}

            {triaje && <TriajeDisplay triaje={triaje} />}

            {triajeError && (
              <Alert type="warning" message={`Análisis de IA: ${triajeError}. Puedes continuar enviando tu solicitud.`} />
            )}

            {/* Botón de Envío */}
            <div className="pt-2">
              <Button
                type="submit"
                loading={cargando}
                disabled={cargando}
                fullWidth
                variant="primary"
                icon={<BoltIcon className="w-6 h-6" />}
              >
                Solicitar Servicio Ahora
              </Button>
            </div>
          </form>

          {/* Footer */}
          <div className="mt-8 pt-6 border-t border-gray-200">
            <p className="text-center text-xs text-gray-500">
              🔒 Conectamos solo con técnicos verificados y certificados
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
