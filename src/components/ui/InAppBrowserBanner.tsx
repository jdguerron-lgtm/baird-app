'use client'

// Banner informativo cuando el técnico abre el portal desde el WebView de
// WhatsApp / Instagram / Facebook / Line / WeChat. Esos WebView tienen bugs
// históricos con <input type="file" capture> (Android sobre todo): a veces no
// abren cámara, ignoran `multiple`, o no entregan el archivo capturado.
//
// El detector es CONSERVADOR: sólo se dispara con marcadores explícitos en el
// UserAgent para evitar molestar a usuarios de Chrome / Safari / Edge / Brave.
//
// El banner es dismissible (sessionStorage) y nunca bloquea — sólo sugiere
// abrir el link en un navegador real.
//
// Usamos `useSyncExternalStore` (patrón React 18+) en vez de useEffect +
// setState para evitar hydration mismatch sin disparar la regla
// `react-hooks/set-state-in-effect`.

import { useState, useSyncExternalStore } from 'react'

const IN_APP_REGEX = /(WhatsApp|Instagram|FBAN|FBAV|FB_IAB|Line\/|MicroMessenger)/i
const DISMISS_KEY = 'baird-inapp-banner-dismissed-v1'

// subscribe no-op: el snapshot es estable durante toda la vida del componente,
// no necesitamos notificar cambios externos. Se devuelve la misma función
// referencial para evitar re-suscripciones.
const noopSubscribe = () => () => {}

const getClientSnapshot = (): boolean => {
  try {
    if (sessionStorage.getItem(DISMISS_KEY) === '1') return false
    return IN_APP_REGEX.test(navigator.userAgent || '')
  } catch {
    return false
  }
}
const getServerSnapshot = (): boolean => false

export default function InAppBrowserBanner() {
  const detected = useSyncExternalStore(noopSubscribe, getClientSnapshot, getServerSnapshot)
  const [dismissed, setDismissed] = useState(false)
  const [copied, setCopied] = useState(false)

  if (!detected || dismissed) return null

  const copyLink = async () => {
    const url = window.location.href
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
        return
      }
    } catch {
      // fallthrough al prompt
    }
    window.prompt('Copia este enlace y ábrelo en Chrome o Safari:', url)
  }

  const dismiss = () => {
    try {
      sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // ignorar — quotaExceeded / modo privado
    }
    setDismissed(true)
  }

  return (
    <div className="bg-amber-50 border-b border-amber-300 px-4 py-3 sticky top-0 z-[60] shadow-sm">
      <div className="max-w-lg mx-auto text-xs text-amber-900 flex items-start gap-3">
        <span className="text-base shrink-0" aria-hidden>⚠️</span>
        <div className="flex-1 min-w-0">
          <p className="font-semibold mb-0.5">Estás dentro del navegador de WhatsApp</p>
          <p className="text-amber-800">
            Para subir fotos sin problemas, abre este enlace en <strong>Chrome</strong> o <strong>Safari</strong>.
          </p>
          <div className="mt-2 flex gap-2 flex-wrap">
            <button
              type="button"
              onClick={copyLink}
              className="bg-amber-600 text-white px-3 py-1.5 rounded-lg font-medium hover:bg-amber-700 active:scale-95 transition"
            >
              {copied ? '✓ Enlace copiado' : 'Copiar enlace'}
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="text-amber-800 underline px-1 py-1.5"
            >
              Continuar aquí
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
