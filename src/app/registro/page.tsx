'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function RegistroTecnico() {
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' })

  const [formData, setFormData] = useState({
    nombre_completo: '',
    whatsapp: '',
    ciudad_pueblo: '',
    especialidad_principal: 'Lavadoras',
    acepta_garantias: true
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
      const { error } = await supabase
        .from('tecnicos')
        .insert([formData])

      if (error) throw error

      setMensaje({ texto: '¡Registro exitoso! Ya estás en la base de datos.', tipo: 'exito' })
      setFormData({ nombre_completo: '', whatsapp: '', ciudad_pueblo: '', especialidad_principal: 'Lavadoras', acepta_garantias: true })
      
    } catch (error: any) {
      console.error(error)
      setMensaje({ texto: 'Hubo un error al registrar: ' + error.message, tipo: 'error' })
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Únete a la Red de Técnicos
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Recibe solicitudes de servicio en tu celular
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          
          {mensaje.texto && (
            <div className={`p-4 mb-4 rounded-md text-sm font-medium ${mensaje.tipo === 'exito' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
              {mensaje.texto}
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit}>
            
            {/* Nombre */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Nombre Completo</label>
              <input type="text" name="nombre_completo" required value={formData.nombre_completo} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>

            {/* WhatsApp */}
            <div>
              <label className="block text-sm font-medium text-gray-700">WhatsApp (con código de país ej: +57)</label>
              <input type="tel" name="whatsapp" required value={formData.whatsapp} onChange={handleChange} className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>

            {/* Ciudad */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Ciudad o Pueblo</label>
              <input type="text" name="ciudad_pueblo" required value={formData.ciudad_pueblo} onChange={handleChange} placeholder="Ej: Chía, Bogotá, Cajicá..." className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm" />
            </div>

            {/* Especialidad */}
            <div>
              <label className="block text-sm font-medium text-gray-700">Especialidad Principal</label>
              <select name="especialidad_principal" value={formData.especialidad_principal} onChange={handleChange} className="mt-1 block w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm">
                <option>Lavadoras</option>
                <option>Neveras y Nevecones</option>
                <option>Hornos y Estufas</option>
                <option>Aires Acondicionados</option>
              </select>
            </div>

            {/* Garantías */}
            <div className="flex items-center">
              <input id="garantias" name="acepta_garantias" type="checkbox" checked={formData.acepta_garantias} onChange={handleChange} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded" />
              <label htmlFor="garantias" className="ml-2 block text-sm text-gray-900">
                Acepto realizar servicios de garantía
              </label>
            </div>

            {/* Botón */}
            <div>
              <button type="submit" disabled={cargando} className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white ${cargando ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500`}>
                {cargando ? 'Registrando...' : 'Registrarme como Técnico'}
              </button>
            </div>
            
          </form>
        </div>
      </div>
    </div>
  )
}
// Prueba
