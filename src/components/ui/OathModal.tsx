'use client'

import { useRef, useState, useEffect } from 'react'
import Link from 'next/link'

interface Props {
  tecnicoNombre: string
  equipo: string
  onConfirm: (firmaBase64: string) => void
}

/**
 * Modal de juramento del técnico — debe firmar antes de iniciar diagnóstico.
 * Bloquea la pantalla hasta que el técnico firme y acepte.
 */
export default function OathModal({ tecnicoNombre, equipo, onConfirm }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [aceptaJuramento, setAceptaJuramento] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#0f172a'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
  }, [])

  const getPoint = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    if ('touches' in e) {
      const t = e.touches[0]
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY }
    }
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY }
  }

  const start = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext('2d')
    const p = getPoint(e)
    if (!ctx || !p) return
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    const p = getPoint(e)
    if (!ctx || !p) return
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    setHasSignature(true)
  }

  const stop = () => setIsDrawing(false)

  const limpiar = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const confirmar = () => {
    if (!aceptaJuramento || !hasSignature) return
    const canvas = canvasRef.current
    if (!canvas) return
    const firmaBase64 = canvas.toDataURL('image/png')
    onConfirm(firmaBase64)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto p-4">
      <div className="max-w-lg mx-auto my-4 bg-white rounded-2xl shadow-2xl">
        <div className="p-6 border-b border-amber-200 bg-amber-50 rounded-t-2xl">
          <h2 className="text-xl font-bold text-amber-900 flex items-center gap-2">
            ⚠️ Declaración del técnico
          </h2>
          <p className="text-sm text-amber-800 mt-1">Bajo juramento — antes de iniciar el diagnóstico</p>
        </div>

        <div className="p-6 space-y-4 text-sm text-slate-700">
          <p>Hola <strong>{tecnicoNombre}</strong>, antes de iniciar el diagnóstico de <strong>{equipo}</strong> declaro que:</p>

          <ul className="space-y-2 pl-1">
            <li className="flex gap-2"><span>✅</span><span>Estoy <strong>capacitado técnicamente</strong> para realizar este trabajo en {equipo}.</span></li>
            <li className="flex gap-2"><span>✅</span><span>Conozco los <strong>riesgos asociados</strong> (eléctricos, mecánicos, químicos, ergonómicos).</span></li>
            <li className="flex gap-2"><span>✅</span><span>Conozco los <strong>procedimientos estándar y de seguridad</strong> aplicables.</span></li>
            <li className="flex gap-2"><span>✅</span><span>Cuento con el <strong>EPP requerido</strong>: guantes dieléctricos/mecánicos, gafas, calzado antideslizante, multímetro/herramienta calibrada cuando aplique.</span></li>
          </ul>

          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h3 className="font-bold text-blue-900 mb-2">🛡️ Recomendaciones de seguridad</h3>
            <ol className="list-decimal pl-5 space-y-1 text-blue-900 text-xs">
              <li>Desconecta SIEMPRE la energía antes de manipular partes eléctricas</li>
              <li>Verifica ausencia de tensión con multímetro, no asumas</li>
              <li>Si detectas fuga de gas, suspende y evacúa antes de continuar</li>
              <li>Documenta con fotos ANTES y DESPUÉS de intervenir</li>
              <li>No fuerces piezas: si dudas, escala al supervisor</li>
              <li>Hidrátate, no trabajes con fatiga extrema</li>
              <li>Si el cliente solicita algo fuera del alcance, consulta antes de aceptar</li>
            </ol>
          </div>

          <p className="text-xs text-gray-600">
            Acepto plena responsabilidad por seguir estos lineamientos. Entiendo que mi firma compromete mi continuidad
            en la plataforma. Estos términos hacen parte del contrato de prestación de servicios y de los <Link href="/terminos" target="_blank" className="text-blue-600 underline">Términos y Condiciones de Baird Service</Link>.
          </p>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Tu firma digital *
            </label>
            <canvas
              ref={canvasRef}
              width={500}
              height={150}
              className="w-full border-2 border-gray-200 rounded-xl bg-gray-50 touch-none cursor-crosshair"
              onMouseDown={start}
              onMouseMove={draw}
              onMouseUp={stop}
              onMouseLeave={stop}
              onTouchStart={start}
              onTouchMove={draw}
              onTouchEnd={stop}
            />
            <button type="button" onClick={limpiar} className="text-xs text-gray-500 underline mt-1">
              Limpiar firma
            </button>
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={aceptaJuramento}
              onChange={(e) => setAceptaJuramento(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
            />
            <span className="text-sm font-semibold text-slate-900">
              Firmo y juro bajo gravedad de juramento que lo declarado es cierto.
            </span>
          </label>
        </div>

        <div className="p-6 border-t border-gray-200 bg-gray-50 rounded-b-2xl">
          <button
            type="button"
            onClick={confirmar}
            disabled={!aceptaJuramento || !hasSignature}
            className="w-full rounded-xl bg-amber-600 px-6 py-4 font-bold text-white shadow-md hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            ✅ Iniciar diagnóstico
          </button>
        </div>
      </div>
    </div>
  )
}
