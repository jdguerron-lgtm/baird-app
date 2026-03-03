import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="text-6xl font-bold text-blue-200 mb-4">404</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Página no encontrada</h2>
        <p className="text-gray-600 mb-8 text-sm">
          El link que seguiste no existe o ya no está disponible.
        </p>
        <Link
          href="/"
          className="inline-block w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
