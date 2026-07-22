'use client'

import { useState } from 'react'
import { QR_PAGOS_BAIRD_URL, LLAVE_BREB_BAIRD } from '@/lib/constants/pagos'

/**
 * Tarjeta con el QR de pagos de Baird Service (Bre-B) para el portal del
 * técnico: lo muestra al cliente para que pague a Baird en sitio (nunca
 * efectivo al técnico). Tap sobre el QR → pantalla completa para escanear.
 *
 * Si la imagen public/qr-pagos-baird.png no existe (404), la tarjeta se
 * oculta sola — así el deploy no muestra un recuadro roto mientras el QR
 * del banco no esté subido. Ver src/lib/constants/pagos.ts.
 */
export default function QrPagosBaird() {
  const [imagenOk, setImagenOk] = useState(true)
  const [ampliado, setAmpliado] = useState(false)
  const [copiado, setCopiado] = useState(false)

  if (!imagenOk) return null

  const copiarLlave = async () => {
    try {
      await navigator.clipboard.writeText(LLAVE_BREB_BAIRD)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // Sin clipboard (http/permiso) — la llave queda visible para dictarla.
    }
  }

  return (
    <>
      <div className="bg-white rounded-xl border-2 border-emerald-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={QR_PAGOS_BAIRD_URL}
            alt="QR de pagos Baird Service"
            onError={() => setImagenOk(false)}
            onClick={() => setAmpliado(true)}
            className="w-24 h-24 rounded-lg border border-gray-200 object-contain cursor-zoom-in shrink-0 bg-white"
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900">💳 QR de pagos Baird (Bre-B)</p>
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Muéstraselo al cliente para que pague a Baird Service.
              Nunca recibas efectivo ni pagos a tu cuenta personal.
            </p>
            {LLAVE_BREB_BAIRD && (
              <button
                type="button"
                onClick={copiarLlave}
                className="mt-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1"
              >
                {copiado ? '✅ Llave copiada' : `🔑 Llave: ${LLAVE_BREB_BAIRD} — copiar`}
              </button>
            )}
            <button
              type="button"
              onClick={() => setAmpliado(true)}
              className="block mt-1.5 text-xs font-semibold text-emerald-700 underline"
            >
              Ampliar QR para escanear
            </button>
          </div>
        </div>
      </div>

      {/* Pantalla completa — brillo máximo de contraste para escanear */}
      {ampliado && (
        <div
          className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6"
          onClick={() => setAmpliado(false)}
        >
          <p className="text-base font-bold text-slate-900 mb-1">Paga a Baird Service</p>
          <p className="text-xs text-gray-500 mb-4">Escanea con tu app bancaria (Bre-B)</p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={QR_PAGOS_BAIRD_URL}
            alt="QR de pagos Baird Service"
            className="w-full max-w-xs aspect-square object-contain"
          />
          {LLAVE_BREB_BAIRD && (
            <p className="text-sm font-semibold text-slate-700 mt-4">🔑 Llave: {LLAVE_BREB_BAIRD}</p>
          )}
          <button
            type="button"
            className="mt-6 bg-slate-900 text-white text-sm font-semibold px-6 py-2.5 rounded-xl"
            onClick={() => setAmpliado(false)}
          >
            Cerrar
          </button>
        </div>
      )}
    </>
  )
}
