'use client'

import { useState } from 'react'
import Link from 'next/link'
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

const HOW_IT_WORKS = [
  { step: '1', title: 'Completas el formulario', desc: 'Describe el equipo y el problema. Sin registro previo.' },
  { step: '2', title: 'Técnicos reciben alerta', desc: 'Enviamos la solicitud por WhatsApp a técnicos verificados en tu zona.' },
  { step: '3', title: 'El primero en aceptar gana', desc: 'El técnico que acepta se muestra en tu WhatsApp con foto e identificación.' },
  { step: '4', title: 'Coordinas la visita', desc: 'Hablas directo con el técnico. Pagas a Baird Service por medios electrónicos (no efectivo).' },
]

const TRUST_BADGES = [
  { icon: '🆓', label: 'Gratis para clientes', sub: 'Sin costo de solicitud' },
  { icon: '🔒', label: 'Técnicos verificados', sub: 'Con foto e ID oficial' },
  { icon: '💬', label: 'Contacto directo', sub: 'Sin intermediarios' },
  { icon: '💳', label: 'Pago a Baird Service', sub: 'Electrónico, sin efectivo' },
]

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
          <div className="w-16" /> {/* spacer */}
        </div>
      </header>

      {/* ── Main layout ── */}
      <div className="max-w-6xl mx-auto px-4 py-8 lg:py-12">

        {/* Page heading */}
        <div className="text-center mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
            Solicita un <span className="text-green-600">servicio técnico</span>
          </h1>
          <p className="text-gray-500 text-base max-w-lg mx-auto">
            Sin registro previo. El técnico disponible más cercano te contacta por WhatsApp.
          </p>
        </div>

        {/* ── 2-column grid on desktop ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 items-start">

          {/* ── LEFT: Form ── */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8">

              {mensaje && (
                <div className="mb-6">
                  <Alert type={mensaje.tipo} message={mensaje.texto} onClose={() => setMensaje(null)} />
                </div>
              )}

              <form className="space-y-6" onSubmit={handleSubmit}>

                {/* Switch Garantía */}
                <div className="bg-gradient-to-r from-violet-50 to-purple-50 border border-purple-200 rounded-xl p-4">
                  <div className="flex items-start gap-3">
                    <input
                      id="garantia"
                      name="es_garantia"
                      type="checkbox"
                      checked={formData.es_garantia}
                      onChange={handleChange}
                      className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded cursor-pointer mt-0.5 shrink-0"
                    />
                    <div>
                      <label htmlFor="garantia" className="font-semibold text-sm text-gray-900 cursor-pointer flex items-center gap-1.5">
                        <ShieldCheckIcon className="w-4 h-4 text-purple-600" />
                        Esta es una solicitud de garantía de marca
                      </label>
                      <p className="text-xs text-gray-500 mt-1">
                        Si el equipo está en garantía, marca esta opción e ingresa el número de serie o factura
                      </p>
                    </div>
                  </div>
                </div>

                {/* Número de Serie (condicional) */}
                {formData.es_garantia && (
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
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

                {/* ── Sección: Tu información ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Tu información</p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                        label="WhatsApp de contacto"
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  </div>
                </div>

                {/* ── Sección: El equipo ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">El equipo</p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  </div>
                </div>

                {/* ── Sección: Coordinar visita ── */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                    <LightBulbIcon className="w-4 h-4 text-yellow-500" />
                    Coordinación de visita
                  </p>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <InputField
                        label="Primer horario preferido"
                        name="horario_visita_1"
                        value={formData.horario_visita_1}
                        onChange={handleChange}
                        placeholder="Ej: Lunes 24 Feb, 8am–12pm"
                        error={errors.horario_visita_1}
                        required
                      />
                      <InputField
                        label="Segundo horario preferido"
                        name="horario_visita_2"
                        value={formData.horario_visita_2}
                        onChange={handleChange}
                        placeholder="Ej: Martes 25 Feb, 2pm–6pm"
                        error={errors.horario_visita_2}
                        required
                      />
                    </div>

                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <InputField
                        label="Valor del servicio (COP)"
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
                        El pago se realiza directamente a Baird Service por medios electrónicos. No se acepta efectivo.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Botón de Envío */}
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

                <p className="text-center text-xs text-gray-400">
                  🔒 Solo técnicos verificados — recibirás foto e identificación del técnico asignado
                </p>
              </form>
            </div>
          </div>

          {/* ── RIGHT: Trust sidebar ── */}
          <aside className="lg:col-span-2 space-y-5">

            {/* How it works */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-slate-900 mb-4 flex items-center gap-2 text-sm">
                <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-xs">?</span>
                ¿Cómo funciona?
              </h3>
              <ol className="space-y-4">
                {HOW_IT_WORKS.map(({ step, title, desc }) => (
                  <li key={step} className="flex gap-3">
                    <span className="w-6 h-6 rounded-full bg-green-600 text-white flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                      {step}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{title}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            {/* Trust badges */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <h3 className="font-semibold text-slate-900 mb-4 text-sm">Por qué Baird Service</h3>
              <div className="space-y-3">
                {TRUST_BADGES.map(({ icon, label, sub }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-xl w-8 shrink-0 text-center">{icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{label}</p>
                      <p className="text-xs text-gray-400">{sub}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What happens next */}
            <div className="bg-slate-900 rounded-2xl p-5 text-white">
              <h3 className="font-semibold mb-3 text-sm">¿Qué pasa después?</h3>
              <div className="space-y-2 text-xs text-slate-300">
                <p>✅ Recibes confirmación de solicitud enviada</p>
                <p>📲 Un técnico acepta y te llega su nombre, foto e ID</p>
                <p>📞 Coordinas la visita directamente por WhatsApp</p>
                <p>🔧 El técnico llega y arregla el equipo</p>
                <p>💳 Pagas a Baird Service por medios electrónicos (sin efectivo)</p>
              </div>
            </div>

            {/* Are you a tech? */}
            <div className="bg-blue-50 rounded-2xl border border-blue-100 p-5">
              <p className="text-sm font-semibold text-blue-900 mb-1">¿Eres técnico?</p>
              <p className="text-xs text-blue-700 mb-3">Recibe solicitudes en tu WhatsApp y trabaja cuando quieras.</p>
              <Link
                href="/registro"
                className="block text-center text-sm font-semibold text-blue-700 border border-blue-300 rounded-xl py-2 hover:bg-blue-100 transition-colors"
              >
                Unirme como técnico →
              </Link>
            </div>

          </aside>
        </div>
      </div>
    </div>
  )
}
