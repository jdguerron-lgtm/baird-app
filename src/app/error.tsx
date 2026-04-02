'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 via-white to-red-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-10 max-w-md w-full text-center">
        <div className="text-5xl mb-4">⚠</div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Algo salió mal</h2>
        <p className="text-gray-600 mb-8 text-sm">
          Ocurrió un error inesperado. Por favor intenta de nuevo.
        </p>
        <button
          onClick={reset}
          className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-md"
        >
          Intentar de nuevo
        </button>
        <Link
          href="/"
          className="block mt-4 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}
