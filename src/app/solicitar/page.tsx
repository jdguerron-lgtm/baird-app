'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useSolicitudForm } from '@/hooks/useSolicitudForm'
import { URL_PAGO_ANTICIPO_DIAGNOSTICO } from '@/lib/constants/tienda'
import { PhoneInput } from '@/components/ui/PhoneInput'
import { Alert } from '@/components/ui/Alert'
import { InputField } from '@/components/ui/InputField'
import { SelectField } from '@/components/ui/SelectField'
import { TextAreaField } from '@/components/ui/TextAreaField'
import { Button } from '@/components/ui/Button'
import { DateTimeSlotPicker } from '@/components/ui/DateTimeSlotPicker'
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
import {
  TIPOS_EQUIPO,
  TIPOS_SOLICITUD,
  TARIFA_DIAGNOSTICO,
  ANTICIPO_PORCENTAJE,
  IVA_TARIFA,
  calcularBaseSinIva,
  calcularIvaIncluido,
} from '@/types/solicitud'
import { formatCOP } from '@/lib/utils/format'

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
  const [, setSolicitudId] = useState<string | null>(null)
  // Tras crear una solicitud particular de Diagnóstico/Reparación, mostramos el
  // CTA para pagar el anticipo ($42.000) en la tienda Shopify (recaudo online).
  const [mostrarPagoAnticipo, setMostrarPagoAnticipo] = useState(false)
  const [geoLoading, setGeoLoading] = useState(false)
  // El auto-agendamiento de la opción 1 salta la página /horario (donde antes
  // se aceptaban los TyC), así que la aceptación se exige aquí en el formulario.
  const [aceptaTyc, setAceptaTyc] = useState(false)

  const { formData, errors, handleChange, setField, validate, resetForm } = useSolicitudForm()

  const handleUseLocation = async () => {
    if (!navigator.geolocation) {
      setMensaje({ texto: 'Tu navegador no soporta geolocalizacion', tipo: 'error' })
      return
    }
    setGeoLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&accept-language=es`
          )
          const data = await res.json()
          if (data.address) {
            const addr = data.address
            const road = addr.road || addr.pedestrian || addr.street || ''
            const houseNumber = addr.house_number || ''
            const fullAddress = [road, houseNumber].filter(Boolean).join(' ') || data.display_name?.split(',').slice(0, 2).join(',') || ''
            const city = addr.city || addr.town || addr.village || addr.municipality || ''
            const suburb = addr.suburb || addr.neighbourhood || addr.quarter || ''

            if (fullAddress) setField('direccion', fullAddress.trim())
            if (city) setField('ciudad_pueblo', city.trim())
            if (suburb) setField('zona_servicio', suburb.trim())
          }
        } catch {
          setMensaje({ texto: 'No se pudo obtener la direccion. Ingresala manualmente.', tipo: 'error' })
        } finally {
          setGeoLoading(false)
        }
      },
      () => {
        setMensaje({ texto: 'No se pudo acceder a tu ubicacion. Verifica los permisos.', tipo: 'error' })
        setGeoLoading(false)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) {
      setMensaje({ texto: 'Por favor corrige los errores en el formulario', tipo: 'error' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    if (!aceptaTyc) {
      setMensaje({ texto: 'Debes aceptar los Términos y Condiciones para agendar tu visita', tipo: 'error' })
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setCargando(true)
    setMensaje(null)

    // Enviar solicitud al API (inserta en BD + notifica al cliente + notifica técnicos)
    try {
      const res = await fetch('/api/solicitar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      const data = await res.json()

      if (!res.ok) {
        setMensaje({ texto: data.error || 'Hubo un error al enviar la solicitud. Espera unos segundos e intenta de nuevo — si persiste, escríbenos por WhatsApp.', tipo: 'error' })
        window.scrollTo({ top: 0, behavior: 'smooth' })
        setCargando(false)
        return
      }

      const id = data.id
      setSolicitudId(id)
      setMostrarPagoAnticipo(
        !formData.es_garantia &&
        (formData.tipo_solicitud === 'Diagnóstico' || formData.tipo_solicitud === 'Reparación'),
      )

      const tecnicosMsg = data.notificados > 0
        ? ` ${data.notificados} técnico(s) notificado(s) por WhatsApp.`
        : ' Registramos tu solicitud y buscaremos técnicos disponibles.'

      setMensaje({
        texto: data.agendado
          // Auto-agendado con la opción 1 (o la 2): la visita ya quedó fijada,
          // sin paso extra de confirmación por WhatsApp.
          ? `✅ Solicitud #${id.slice(0, 8)} enviada y visita agendada para ${data.horario}.${tecnicosMsg} Te avisaremos cuando un técnico acepte.`
          : `✅ Solicitud #${id.slice(0, 8)} enviada. Te enviamos un WhatsApp para confirmar el horario de tu visita.${tecnicosMsg}`,
        tipo: 'success',
      })
    } catch {
      setMensaje({
        texto: 'No pudimos conectar con el servidor. Revisa tu señal (WiFi o datos) e intenta de nuevo — tu información sigue en el formulario.',
        tipo: 'error',
      })
      setCargando(false)
      return
    }

    resetForm()
    setAceptaTyc(false)
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
          <Link href="/" className="relative w-32 h-9 block">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain" priority />
          </Link>
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
                  {/* Recaudo del anticipo vía tienda Shopify (producto "Diagnostico
                      Linea Blanca (Anticipo)", $42.000 = 50% de TARIFA_DIAGNOSTICO).
                      Solo particular Diagnóstico/Reparación. */}
                  {mensaje.tipo === 'success' && mostrarPagoAnticipo && (
                    <div className="mt-3 bg-emerald-50 border-2 border-emerald-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-emerald-900 mb-1">
                        💳 Asegura tu visita pagando el anticipo del diagnóstico
                      </p>
                      <p className="text-xs text-emerald-800 mb-3">
                        Son $42.000 COP (el 50% de la tarifa de diagnóstico). Si apruebas la reparación, se abonan al total. Pago seguro en nuestra tienda oficial.
                      </p>
                      <a
                        href={URL_PAGO_ANTICIPO_DIAGNOSTICO}
                        target="_blank"
                        rel="noopener"
                        className="inline-block bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors"
                      >
                        Pagar anticipo $42.000 →
                      </a>
                    </div>
                  )}
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
                      <PhoneInput
                        label="WhatsApp de contacto"
                        name="cliente_telefono"
                        value={formData.cliente_telefono}
                        onChange={(v) => setField('cliente_telefono', v)}
                        error={errors.cliente_telefono}
                        icon={<PhoneIcon className="w-5 h-5 mr-2 text-green-600" />}
                        required
                      />
                    </div>
                    <div>
                      <InputField
                        label="Direccion Completa"
                        name="direccion"
                        value={formData.direccion}
                        onChange={handleChange}
                        placeholder="Calle 123 #45-67, Apto 301"
                        error={errors.direccion}
                        icon={<LocationIcon className="w-5 h-5 mr-2 text-green-600" />}
                        required
                      />
                      <button
                        type="button"
                        onClick={handleUseLocation}
                        disabled={geoLoading}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 hover:bg-green-100 transition-colors disabled:opacity-50"
                      >
                        {geoLoading ? (
                          <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                        {geoLoading ? 'Obteniendo ubicacion...' : 'Usar mi ubicacion actual'}
                      </button>
                    </div>
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
                      <DateTimeSlotPicker
                        label="Primer horario preferido"
                        value={formData.horario_visita_1}
                        onChange={(v) => setField('horario_visita_1', v)}
                        error={errors.horario_visita_1}
                        required
                      />
                      <DateTimeSlotPicker
                        label="Segundo horario preferido"
                        value={formData.horario_visita_2}
                        onChange={(v) => setField('horario_visita_2', v)}
                        error={errors.horario_visita_2}
                        required
                      />
                    </div>

                    {/* ── Tarjeta de precio (calculado automáticamente) ── */}
                    {formData.es_garantia ? (
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                        <div className="flex items-start gap-3">
                          <ShieldCheckIcon className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-sm font-semibold text-purple-900">
                              Servicio sin costo para ti
                            </p>
                            <p className="text-xs text-purple-700 mt-1">
                              Esta solicitud está cubierta por la garantía de la marca. Baird Service
                              factura directamente al fabricante.
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : formData.tipo_solicitud === 'Mantenimiento' ? (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <BoltIcon className="w-5 h-5 text-green-600 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Mantenimiento {formData.tipo_equipo}
                              </p>
                              <p className="text-2xl font-bold text-green-700 mt-0.5">
                                ${formatCOP(formData.pago_tecnico)} <span className="text-sm font-medium text-green-600">COP</span>
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-green-700 bg-white border border-green-200 rounded-full px-2.5 py-1 font-medium">
                            Tarifa fija
                          </span>
                        </div>

                        {/* Discriminación del IVA — exigido por DIAN para facturación electrónica */}
                        <div className="bg-white border border-green-100 rounded-lg p-2.5 text-[11px] text-gray-700 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Base sin IVA</span>
                            <span className="font-medium tabular-nums">${formatCOP(calcularBaseSinIva(formData.pago_tecnico))}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>IVA ({Math.round(IVA_TARIFA * 100)}%)</span>
                            <span className="font-medium tabular-nums">${formatCOP(calcularIvaIncluido(formData.pago_tecnico))}</span>
                          </div>
                          <div className="flex justify-between border-t border-green-200 pt-1 mt-1 text-green-800 font-semibold">
                            <span>Total a pagar</span>
                            <span className="tabular-nums">${formatCOP(formData.pago_tecnico)}</span>
                          </div>
                        </div>

                        <p className="text-xs text-green-700 mt-3">
                          💡 Incluye limpieza, lubricación, ajustes eléctricos y prueba de funcionamiento.
                          El pago se realiza a Baird Service por medios electrónicos (no efectivo).
                        </p>
                      </div>
                    ) : formData.tipo_solicitud === 'Cambio de filtro' ? (
                      <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <BoltIcon className="w-5 h-5 text-teal-600 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                Cambio de filtro {formData.tipo_equipo}
                              </p>
                              <p className="text-2xl font-bold text-teal-700 mt-0.5">
                                ${formatCOP(formData.pago_tecnico)} <span className="text-sm font-medium text-teal-600">COP</span>
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-teal-700 bg-white border border-teal-200 rounded-full px-2.5 py-1 font-medium">
                            Filtro incluido
                          </span>
                        </div>

                        {/* Discriminación del IVA — exigido por DIAN para facturación electrónica */}
                        <div className="bg-white border border-teal-100 rounded-lg p-2.5 text-[11px] text-gray-700 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Base sin IVA</span>
                            <span className="font-medium tabular-nums">${formatCOP(calcularBaseSinIva(formData.pago_tecnico))}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>IVA ({Math.round(IVA_TARIFA * 100)}%)</span>
                            <span className="font-medium tabular-nums">${formatCOP(calcularIvaIncluido(formData.pago_tecnico))}</span>
                          </div>
                          <div className="flex justify-between border-t border-teal-200 pt-1 mt-1 text-teal-800 font-semibold">
                            <span>Total a pagar</span>
                            <span className="tabular-nums">${formatCOP(formData.pago_tecnico)}</span>
                          </div>
                        </div>

                        <p className="text-xs text-teal-700 mt-3">
                          💡 Precio todo-incluido: el <strong>filtro</strong>, la mano de obra y el IVA ya están
                          cubiertos. No pagas nada adicional al técnico. El pago se realiza a Baird Service por
                          medios electrónicos (no efectivo).
                        </p>
                      </div>
                    ) : (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <BoltIcon className="w-5 h-5 text-blue-600 shrink-0" />
                            <div>
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                {formData.tipo_solicitud} — visita técnica
                              </p>
                              <p className="text-2xl font-bold text-blue-700 mt-0.5">
                                ${formatCOP(TARIFA_DIAGNOSTICO)} <span className="text-sm font-medium text-blue-600">COP</span>
                              </p>
                            </div>
                          </div>
                          <span className="text-xs text-blue-700 bg-white border border-blue-200 rounded-full px-2.5 py-1 font-medium">
                            Anticipo ${formatCOP(TARIFA_DIAGNOSTICO * ANTICIPO_PORCENTAJE)}
                          </span>
                        </div>

                        {/* Discriminación del IVA — exigido por DIAN para facturación electrónica */}
                        <div className="bg-white border border-blue-100 rounded-lg p-2.5 text-[11px] text-gray-700 space-y-0.5">
                          <div className="flex justify-between">
                            <span>Base sin IVA</span>
                            <span className="font-medium tabular-nums">${formatCOP(calcularBaseSinIva(TARIFA_DIAGNOSTICO))}</span>
                          </div>
                          <div className="flex justify-between">
                            <span>IVA ({Math.round(IVA_TARIFA * 100)}%)</span>
                            <span className="font-medium tabular-nums">${formatCOP(calcularIvaIncluido(TARIFA_DIAGNOSTICO))}</span>
                          </div>
                          <div className="flex justify-between border-t border-blue-200 pt-1 mt-1 text-blue-800 font-semibold">
                            <span>Total visita</span>
                            <span className="tabular-nums">${formatCOP(TARIFA_DIAGNOSTICO)}</span>
                          </div>
                        </div>

                        <p className="text-xs text-blue-700 mt-3">
                          💡 Pagas <strong>${formatCOP(TARIFA_DIAGNOSTICO * ANTICIPO_PORCENTAJE)} COP</strong> de
                          anticipo para reservar la visita. Tras revisar el equipo, el técnico te enviará una
                          cotización por la reparación; tú decides si aprobar o rechazar.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* TyC — requerido: el agendamiento queda confirmado al enviar
                    (la opción 1 se agenda automáticamente), sin paso posterior
                    en /horario donde antes se aceptaban. */}
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={aceptaTyc}
                    onChange={(e) => setAceptaTyc(e.target.checked)}
                    className="mt-1 h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">
                    He leído y acepto los <Link href="/terminos" target="_blank" className="text-green-700 underline">Términos y Condiciones</Link> y la <Link href="/politica-privacidad" target="_blank" className="text-green-700 underline">Política de Privacidad</Link>.
                  </span>
                </label>

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
