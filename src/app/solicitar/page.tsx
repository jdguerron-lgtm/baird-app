'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import Image from 'next/image'

export default function SolicitarServicio() {
    const [cargando, setCargando] = useState(false)
    const [mensaje, setMensaje] = useState({ texto: '', tipo: '' })

    const [formData, setFormData] = useState({
        cliente_nombre: '',
        cliente_telefono: '',
        direccion: '',
        ciudad_pueblo: '',
        zona_servicio: '',
        marca_equipo: '',
        tipo_equipo: 'Lavadora',
        tipo_solicitud: 'Diagnóstico',
        novedades_equipo: '',
        es_garantia: false,
        numero_serie_factura: ''
    })

    const handleChange = (e: any) => {
        const { name, value, type, checked } = e.target
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }))
    }

    const handleSubmit = async (e: any) => {
        e.preventDefault()
        setCargando(true)
        setMensaje({ texto: '', tipo: '' })

        try {
            // Preparar datos para insertar (excluir numero_serie_factura del insert directo)
            const { numero_serie_factura, ...dataToInsert } = formData

            const { error } = await supabase
                .from('solicitudes_servicio')
                .insert([dataToInsert])

            if (error) throw error

            setMensaje({
                texto: '¡Solicitud enviada! Pronto un técnico se pondrá en contacto contigo.',
                tipo: 'exito'
            })

            // Resetear formulario
            setFormData({
                cliente_nombre: '',
                cliente_telefono: '',
                direccion: '',
                ciudad_pueblo: '',
                zona_servicio: '',
                marca_equipo: '',
                tipo_equipo: 'Lavadora',
                tipo_solicitud: 'Diagnóstico',
                novedades_equipo: '',
                es_garantia: false,
                numero_serie_factura: ''
            })

        } catch (error: any) {
            console.error(error)
            setMensaje({
                texto: 'Hubo un error al enviar la solicitud: ' + error.message,
                tipo: 'error'
            })
        } finally {
            setCargando(false)
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
            <div className="sm:mx-auto sm:w-full sm:max-w-2xl">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <div className="relative w-64 h-24">
                        <Image
                            src="/baird-logo.png"
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

            <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-2xl">
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

                        {/* Switch Garantía */}
                        <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-2 border-blue-200 rounded-xl p-5">
                            <div className="flex items-start">
                                <div className="flex items-center h-5">
                                    <input
                                        id="garantia"
                                        name="es_garantia"
                                        type="checkbox"
                                        checked={formData.es_garantia}
                                        onChange={handleChange}
                                        className="h-5 w-5 text-purple-600 focus:ring-purple-500 border-gray-300 rounded cursor-pointer"
                                    />
                                </div>
                                <div className="ml-3">
                                    <label htmlFor="garantia" className="font-bold text-base text-gray-900 cursor-pointer flex items-center">
                                        <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                                        </svg>
                                        Esta es una solicitud de garantía de marca
                                    </label>
                                    <p className="text-sm text-gray-600 mt-1.5">
                                        Si el equipo está en garantía, marca esta opción y luego ingresa el número de serie o factura
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Número de Serie/Factura (solo si es garantía) */}
                        {formData.es_garantia && (
                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 animate-fadeIn">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    <span className="flex items-center">
                                        <svg className="w-5 h-5 mr-2 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                                        </svg>
                                        Número de Serie o # de Factura
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    name="numero_serie_factura"
                                    value={formData.numero_serie_factura}
                                    onChange={handleChange}
                                    className="block w-full border-2 border-purple-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all sm:text-sm hover:border-purple-300"
                                    placeholder="SN12345678 o Factura #001234"
                                />
                            </div>
                        )}

                        {/* Grid de 2 columnas */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Nombre del Cliente */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    <span className="flex items-center">
                                        <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                        </svg>
                                        Tu Nombre
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    name="cliente_nombre"
                                    required
                                    value={formData.cliente_nombre}
                                    onChange={handleChange}
                                    className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all sm:text-sm hover:border-green-300"
                                    placeholder="María González"
                                />
                            </div>

                            {/* Teléfono */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    <span className="flex items-center">
                                        <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                        </svg>
                                        Teléfono de Contacto
                                    </span>
                                </label>
                                <input
                                    type="tel"
                                    name="cliente_telefono"
                                    required
                                    value={formData.cliente_telefono}
                                    onChange={handleChange}
                                    className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all sm:text-sm hover:border-green-300"
                                    placeholder="+57 300 123 4567"
                                />
                            </div>

                        </div>

                        {/* Dirección */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <span className="flex items-center">
                                    <svg className="w-5 h-5 mr-2 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                    Dirección Completa
                                </span>
                            </label>
                            <input
                                type="text"
                                name="direccion"
                                required
                                value={formData.direccion}
                                onChange={handleChange}
                                className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all sm:text-sm hover:border-green-300"
                                placeholder="Calle 123 #45-67, Apto 301"
                            />
                        </div>

                        {/* Grid Ciudad y Zona */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Ciudad */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Ciudad o Pueblo
                                </label>
                                <input
                                    type="text"
                                    name="ciudad_pueblo"
                                    required
                                    value={formData.ciudad_pueblo}
                                    onChange={handleChange}
                                    className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all sm:text-sm hover:border-green-300"
                                    placeholder="Bogotá, Medellín..."
                                />
                            </div>

                            {/* Zona */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    Zona / Barrio
                                </label>
                                <input
                                    type="text"
                                    name="zona_servicio"
                                    required
                                    value={formData.zona_servicio}
                                    onChange={handleChange}
                                    className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all sm:text-sm hover:border-green-300"
                                    placeholder="Chapinero, Usaquén..."
                                />
                            </div>

                        </div>

                        {/* Grid Marca y Tipo */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Marca */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    <span className="flex items-center">
                                        <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                        </svg>
                                        Marca del Equipo
                                    </span>
                                </label>
                                <input
                                    type="text"
                                    name="marca_equipo"
                                    required
                                    value={formData.marca_equipo}
                                    onChange={handleChange}
                                    className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm hover:border-blue-300"
                                    placeholder="Samsung, LG, Whirlpool..."
                                />
                            </div>

                            {/* Tipo de Equipo */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    <span className="flex items-center">
                                        <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                        </svg>
                                        Tipo de Equipo
                                    </span>
                                </label>
                                <select
                                    name="tipo_equipo"
                                    value={formData.tipo_equipo}
                                    onChange={handleChange}
                                    className="block w-full bg-white border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm hover:border-blue-300"
                                >
                                    <option>Lavadora</option>
                                    <option>Nevera</option>
                                    <option>Nevecón</option>
                                    <option>Horno</option>
                                    <option>Estufa</option>
                                    <option>Aire Acondicionado</option>
                                    <option>Secadora</option>
                                    <option>Lavavajillas</option>
                                </select>
                            </div>

                        </div>

                        {/* Tipo de Solicitud */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <span className="flex items-center">
                                    <svg className="w-5 h-5 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                                    </svg>
                                    Tipo de Servicio
                                </span>
                            </label>
                            <select
                                name="tipo_solicitud"
                                value={formData.tipo_solicitud}
                                onChange={handleChange}
                                className="block w-full bg-white border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all sm:text-sm hover:border-blue-300"
                            >
                                <option>Diagnóstico</option>
                                <option>Reparación</option>
                                <option>Mantenimiento</option>
                                <option>Instalación</option>
                            </select>
                        </div>

                        {/* Novedades del Equipo (Descripción) */}
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <span className="flex items-center">
                                    <svg className="w-5 h-5 mr-2 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    ¿Qué le pasa al equipo?
                                </span>
                            </label>
                            <textarea
                                name="novedades_equipo"
                                required
                                value={formData.novedades_equipo}
                                onChange={handleChange}
                                rows={4}
                                className="block w-full border-2 border-gray-200 rounded-xl shadow-sm py-3 px-4 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all sm:text-sm hover:border-orange-300"
                                placeholder="Describe en detalle qué síntomas tiene el equipo. Ej: 'La lavadora hace un ruido fuerte al centrifugar y no termina el ciclo de lavado'"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                💡 Incluye todos los detalles posibles. Nuestra IA los analizará para sugerir la posible falla.
                            </p>
                        </div>

                        {/* Botón de Envío */}
                        <div className="pt-2">
                            <button
                                type="submit"
                                disabled={cargando}
                                className={`group relative w-full flex justify-center py-4 px-4 border border-transparent rounded-xl shadow-lg text-base font-bold text-white transition-all duration-200 ${cargando
                                    ? 'bg-gradient-to-r from-green-400 to-blue-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 hover:shadow-xl transform hover:-translate-y-0.5'
                                    } focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500`}
                            >
                                {cargando ? (
                                    <span className="flex items-center">
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Enviando solicitud...
                                    </span>
                                ) : (
                                    <span className="flex items-center">
                                        <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                                        </svg>
                                        Solicitar Servicio Ahora
                                    </span>
                                )}
                            </button>
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
