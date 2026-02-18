import Image from 'next/image'
import Link from 'next/link'
import { UserIcon, ChecklistIcon } from '@/components/icons'

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 via-white to-blue-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="sm:mx-auto sm:w-full sm:max-w-4xl">
        <div className="flex justify-center mb-8">
          <div className="relative w-80 h-28">
            <Image
              src="/Baird_Service_Logo.png"
              alt="Baird Service"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        <h1 className="mt-6 text-center text-4xl font-bold bg-gradient-to-r from-green-700 to-blue-700 bg-clip-text text-transparent">
          Bienvenido a Baird Service
        </h1>
        <p className="mt-4 text-center text-lg text-gray-600 max-w-2xl mx-auto">
          Conectamos clientes con técnicos certificados en electrodomésticos de línea blanca
        </p>
      </div>

      {/* Cards de Selección */}
      <div className="mt-16 sm:mx-auto sm:w-full sm:max-w-5xl px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

          {/* Tarjeta Cliente */}
          <Link href="/solicitar">
            <div className="group relative overflow-hidden bg-white rounded-3xl shadow-2xl border-2 border-green-200 p-10 hover:shadow-3xl hover:scale-105 transition-all duration-300 cursor-pointer">
              {/* Gradiente de fondo en hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-green-50 to-blue-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

              <div className="relative z-10">
                {/* Icono */}
                <div className="flex justify-center mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <UserIcon className="w-10 h-10 text-white" />
                  </div>
                </div>

                {/* Título */}
                <h2 className="text-2xl font-bold text-center text-gray-900 mb-4">
                  Soy Cliente
                </h2>

                {/* Descripción */}
                <p className="text-center text-gray-600 mb-6">
                  Necesito reparar o mantener mi electrodoméstico
                </p>

                {/* Lista de beneficios */}
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <span className="text-green-600 mt-1">✓</span>
                    <span className="text-sm text-gray-700">Diagnóstico con IA en tiempo real</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-600 mt-1">✓</span>
                    <span className="text-sm text-gray-700">Estimación de costo y tiempo</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-green-600 mt-1">✓</span>
                    <span className="text-sm text-gray-700">Técnicos certificados en tu zona</span>
                  </li>
                </ul>

                {/* Botón */}
                <div className="flex justify-center">
                  <button className="bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold py-3 px-8 rounded-full shadow-lg group-hover:shadow-xl group-hover:from-green-700 group-hover:to-green-800 transition-all duration-300">
                    Solicitar Servicio →
                  </button>
                </div>
              </div>
            </div>
          </Link>

          {/* Tarjeta Técnico */}
          <Link href="/registro">
            <div className="group relative overflow-hidden bg-white rounded-3xl shadow-2xl border-2 border-blue-200 p-10 hover:shadow-3xl hover:scale-105 transition-all duration-300 cursor-pointer">
              {/* Gradiente de fondo en hover */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-purple-50 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

              <div className="relative z-10">
                {/* Icono */}
                <div className="flex justify-center mb-6">
                  <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                    <ChecklistIcon className="w-10 h-10 text-white" />
                  </div>
                </div>

                {/* Título */}
                <h2 className="text-2xl font-bold text-center text-gray-900 mb-4">
                  Soy Técnico
                </h2>

                {/* Descripción */}
                <p className="text-center text-gray-600 mb-6">
                  Quiero ofrecer mis servicios profesionales
                </p>

                {/* Lista de beneficios */}
                <ul className="space-y-3 mb-8">
                  <li className="flex items-start gap-3">
                    <span className="text-blue-600 mt-1">✓</span>
                    <span className="text-sm text-gray-700">Recibe solicitudes cercanas a tu zona</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-600 mt-1">✓</span>
                    <span className="text-sm text-gray-700">Gestiona tus servicios fácilmente</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <span className="text-blue-600 mt-1">✓</span>
                    <span className="text-sm text-gray-700">Verificación de identidad profesional</span>
                  </li>
                </ul>

                {/* Botón */}
                <div className="flex justify-center">
                  <button className="bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold py-3 px-8 rounded-full shadow-lg group-hover:shadow-xl group-hover:from-blue-700 group-hover:to-blue-800 transition-all duration-300">
                    Registrarme como Técnico →
                  </button>
                </div>
              </div>
            </div>
          </Link>

        </div>
      </div>

      {/* Footer */}
      <div className="mt-16 text-center">
        <p className="text-sm text-gray-500">
          🔒 Plataforma segura con técnicos verificados
        </p>
        <p className="text-xs text-gray-400 mt-2">
          © 2024 Baird Service - Marketplace de Servicios Técnicos
        </p>
      </div>
    </div>
  )
}
