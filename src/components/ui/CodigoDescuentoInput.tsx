'use client'

import { useEffect, useState } from 'react'
import { normalizarCodigoDescuento } from '@/lib/constants/descuentos'

interface Props {
  /** Código tal como está en el formulario ('' = sin código). */
  value: string
  onChange: (codigo: string) => void
  error?: string
}

type Estado =
  | { tipo: 'vacio' }
  | { tipo: 'validando' }
  | { tipo: 'valido'; etiqueta: string; descripcion: string | null }
  | { tipo: 'invalido'; motivo: string }

/**
 * Campo opcional "Código de descuento" en /solicitar (2026-10-19), solo
 * particular. Valida en vivo contra GET /api/descuentos/validar (debounce
 * 500 ms) y muestra si el código aplica y cuánto. Es solo UX: el guard real
 * está en POST /api/solicitar, que rechaza la solicitud si el código no vale.
 *
 * El descuento se aplica en el ÚLTIMO pago del servicio (saldo final), no en
 * el anticipo — el texto de ayuda lo dice explícitamente para no generar
 * reclamos al pagar la reserva.
 */
export function CodigoDescuentoInput({ value, onChange, error }: Props) {
  // Resultado de la última validación remota, por código. El estado visible
  // se DERIVA del código actual (sin setState síncrono en el effect): si el
  // código cambió y aún no hay respuesta para él, se muestra "validando".
  const [resultado, setResultado] = useState<{ codigo: string; estado: Estado } | null>(null)
  const codigo = normalizarCodigoDescuento(value)

  useEffect(() => {
    if (codigo.length < 3) return
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/descuentos/validar?codigo=${encodeURIComponent(codigo)}`, {
          signal: controller.signal,
          cache: 'no-store',
        })
        const data = await res.json()
        setResultado({
          codigo,
          estado: data.valido
            ? { tipo: 'valido', etiqueta: String(data.etiqueta), descripcion: data.descripcion ?? null }
            : { tipo: 'invalido', motivo: String(data.motivo ?? 'Código de descuento inválido o vencido.') },
        })
      } catch (e) {
        if ((e as Error).name === 'AbortError') return
        setResultado({ codigo, estado: { tipo: 'invalido', motivo: 'No pudimos validar el código. Revisa tu conexión.' } })
      }
    }, 500)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [codigo])

  const estado: Estado = !codigo
    ? { tipo: 'vacio' }
    : codigo.length < 3
      ? { tipo: 'invalido', motivo: 'El código tiene al menos 3 caracteres.' }
      : resultado?.codigo === codigo
        ? resultado.estado
        : { tipo: 'validando' }

  const borde = error || estado.tipo === 'invalido'
    ? 'border-red-300 focus:ring-red-500'
    : estado.tipo === 'valido'
      ? 'border-emerald-400 focus:ring-emerald-500'
      : 'border-gray-200 focus:ring-green-500 hover:border-green-300'

  return (
    <div>
      <label htmlFor="field-codigo_descuento" className="block text-sm font-semibold text-gray-700 mb-2">
        <span className="flex items-center">🏷️ Código de descuento <span className="ml-1 text-xs font-normal text-gray-400">(opcional)</span></span>
      </label>
      <div className="relative">
        <input
          id="field-codigo_descuento"
          name="codigo_descuento"
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          placeholder="Ej: BIENVENIDO10"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={30}
          className={`block w-full border-2 rounded-xl shadow-sm py-3 px-4 pr-10 text-gray-900 uppercase tracking-wide
            focus:outline-none focus:ring-2 focus:border-transparent transition-all sm:text-sm ${borde}`}
        />
        {estado.tipo === 'validando' && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">…</span>
        )}
        {estado.tipo === 'valido' && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600 font-bold" aria-hidden>✓</span>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!error && estado.tipo === 'valido' && (
        <p className="mt-1 text-xs text-emerald-700">
          ✅ Código válido: <strong>{estado.etiqueta} de descuento</strong>
          {estado.descripcion ? ` · ${estado.descripcion}` : ''}. Se aplica en el último pago de tu servicio (no en el anticipo).
        </p>
      )}
      {!error && estado.tipo === 'invalido' && (
        <p className="mt-1 text-xs text-red-600">{estado.motivo}</p>
      )}
      {!error && (estado.tipo === 'vacio' || estado.tipo === 'validando') && (
        <p className="mt-1 text-xs text-gray-500">
          💡 Si tienes un código promocional, escríbelo aquí. El descuento se aplica en el último pago de tu servicio.
        </p>
      )}
    </div>
  )
}
