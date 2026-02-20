'use client'

import { useState } from 'react'
import Image from 'next/image'
import { useSolicitudForm } from '@/hooks/useSolicitudForm'
import { submitSolicitud } from '@/lib/services/solicitud.service'
import { Alert } from '@/components/ui/Alert'
import { InputField } from '@/components/ui/InputField'
import { SelectField } from '@/components/ui/SelectField'
import { TextAreaField } from '@/components/ui/TextAreaField'
import { Button } from '@/components/ui/Button'
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
  BoltIcon,
  LightBulbIcon,
} from '@/components/icons'
import { TIPOS_EQUIPO, TIPOS_SOLICITUD } from '@/types/solicitud'

// ──────────────────────────────────────────────────────────
// TRIAJE IA: deshabilitado temporalmente para priorizar
// la integración con WhatsApp. Los archivos useTriaje.ts,
// TriajeDisplay.tsx y /api/triaje/route.ts se conservan
// intactos para reactivarse en una próxima iteración.
// Ver TODO.md para el plan de reactivación.
// ──────────────────────────────────────────────────────────

export default function SolicitarServicio() {
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; tipo: 'success' | 'error' } | null>(null)
  const [solicitudId, setSolicitudId] = useState<string | null>(null)

  const { formData, errors, handleChange, validate, resetForm } = useSolicitudForm()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      setMensaje({ texto: 'Por favor corrige los errores en el formulario', tipo: 'error' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setCargando(true)
    setMensaje(null)

    // 1. Guardar solicitud en Supabase
    const result = await submitSolicitud(formData)

    if (!result.success || !result.data) {
      setMensaje({ texto: result.error || 'Hubo un error al enviar la solicitud', tipo: 'error' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      setCargando(false)
      return
    }

    const id = result.data.id
    setSolicitudId(id)

    // 2. Disparar notificaciones WhatsApp a técnicos compatibles
    try {
      const waRes = await fetch('/api/whatsapp/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ solicitudId: id }),
      })
      const waData = await waRes.json()
      const tecnicosMsg = waData.notificados > 0
        ? ` ${waData.notificados} técnico(s) notificado(s) por WhatsApp.`
        : ' Registramos tu solicitud y buscaremos técnicos disponibles.'

      setMensaje({
        texto: `✅ Solicitud #${id.slice(0, 8)} enviada.${tecnicosMsg} Te avisaremos cuando un técnico acepte.`,
        tipo: 'success',
      })
    } catch {
      // No bloquear el flujo si falla la notificación WhatsApp
      setMensaje({
        texto: `✅ Solicitud #${id.slice(0, 8)} enviada. Pronto un técnico se pondrá en contacto contigo.`,
        tipo: 'success',
      })
    }

    resetForm()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setCargando(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">

      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="flex justify-center mb-6">
          <div className="relative w-64 h-24">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain" priority />
          </div>
        </div>
        <h2 className="mt-4 text-center text-3xl font-bold bg-gradient-to-r from-green-700 to-blue-700 bg-clip-text text-transparent">
          Solicita un Servicio Técnico
        </h2>
        <p className="mt-3 text-center text-base text-gray-600 max-w-xl mx-auto">
          Completa el formulario y el primer técnico disponible en tu zona te contactará por WhatsApp
        </p>
      </div>

      {/* Formulario */}
      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white py-10 px-6 shadow-2xl sm:rounded-2xl sm:px-12 border border-blue-100">

          {mensaje && (
            <Alert type={mensaje.tipo} message={mensaje.texto} onClose={() => setMensaje(null)} />
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
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-5">
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

            {/* Datos personales */}
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
                label="Teléfono de Contacto (WhatsApp)"
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

            {/* Ciudad y Zona */}
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

            {/* Marca y Tipo de equipo */}
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

            {/* Descripción del problema */}
            <TextAreaField
              label="¿Qué le pasa al equipo?"
              name="novedades_equipo"
              value={formData.novedades_equipo}
              onChange={handleChange}
              placeholder="Describe en detalle qué síntomas tiene el equipo. Ej: 'La lavadora hace un ruido fuerte al centrifugar y no termina el ciclo de lavado'"
              error={errors.novedades_equipo}
              rows={4}
              icon={<AlertIcon className="w-5 h-5 mr-2 text-orange-600" />}
              hint="💡 Cuanto más detallado seas, mejor podrá prepararse el técnico."
              required
            />

            {/* ── SECCIÓN: Coordinación de visita ── */}
            <div className="border-t border-gray-200 pt-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4 flex items-center">
                <LightBulbIcon className="w-5 h-5 mr-2 text-yellow-500" />
                Coordinación de la visita
              </h3>

              {/* Horarios preferidos */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <InputField
                  label="Primer horario preferido"
                  name="horario_visita_1"
                  value={formData.horario_visita_1}
                  onChange={handleChange}
                  placeholder="Ej: Lunes 24 Feb, 8am a 12pm"
                  error={errors.horario_visita_1}
                  required
                />
                <InputField
                  label="Segundo horario preferido"
                  name="horario_visita_2"
                  value={formData.horario_visita_2}
                  onChange={handleChange}
                  placeholder="Ej: Martes 25 Feb, 2pm a 6pm"
                  error={errors.horario_visita_2}
                  required
                />
              </div>

              {/* Valor del servicio */}
              <div className="bg-green-50 border border-green-200 rounded-xl p-5">
                <InputField
                  label="Valor a pagar al técnico (COP)"
                  name="pago_tecnico"
                  type="number"
                  value={formData.pago_tecnico === 0 ? '' : String(formData.pago_tecnico)}
                  onChange={handleChange}
                  placeholder="Ej: 150000"
                  error={errors.pago_tecnico}
                  icon={<BoltIcon className="w-5 h-5 mr-2 text-green-600" />}
                  required
                />
                <p className="text-xs text-green-700 mt-2">
                  💡 Este valor se mostrará al técnico antes de que decida aceptar. Mínimo $20.000 COP.
                </p>
              </div>
            </div>

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
              🔒 Conectamos solo con técnicos verificados — recibirás la foto e identificación del técnico asignado
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
