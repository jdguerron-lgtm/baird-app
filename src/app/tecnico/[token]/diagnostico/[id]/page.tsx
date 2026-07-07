'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import {
  TARIFAS_MANO_OBRA,
  calcularTotalGarantia,
  type ComplejidadServicio,
} from '@/lib/constants/tarifas/mabe'
import { calcularTarifaParticular } from '@/lib/constants/tarifas/particular'
import { estimarPagoTecnicoGarantia } from '@/lib/utils/pago-tecnico'
import PagoTecnicoBreakdown from '@/components/ui/PagoTecnicoBreakdown'
import { formatCOP } from '@/lib/utils/format'
import { CodigoFallaSelector } from '@/components/ui/CodigoFallaSelector'
import type { CodigoFalla } from '@/lib/constants/codigos-falla'
import OathModal from '@/components/ui/OathModal'
import SiguientePasoSelector, { type SiguientePasoData } from '@/components/ui/SiguientePasoSelector'
import ProductosNecesariosForm from '@/components/ui/ProductosNecesariosForm'
import ProductosRecomendadosForm from '@/components/ui/ProductosRecomendadosForm'
import TiendaRepuestosLink from '@/components/ui/TiendaRepuestosLink'
import { useGps } from '@/hooks/useGps'
import { compressImageIfNeeded, inferExtension, videoSizeAdvice } from '@/lib/utils/media'
import { querySupabase } from '@/lib/utils/retry'
import { trackError } from '@/lib/utils/track-error'
import type { ProductoNecesario, ProductoRecomendado } from '@/types/solicitud'

interface Servicio {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
  novedades_equipo: string
  direccion: string
  zona_servicio: string
  ciudad_pueblo: string
  pago_tecnico: number
  estado: string
  es_garantia: boolean
  created_at: string
  horario_confirmado: string | null
}

const MAX_EVIDENCIAS = 4
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB para fotos y videos

export default function DiagnosticoPage() {
  const { token, id } = useParams<{ token: string; id: string }>()
  const router = useRouter()
  // 3 refs separados:
  // - fotoInputRef: abre la cámara en modo foto (accept=image/* + capture=environment).
  //   No usamos accept="image/*,video/*" en el camera shortcut porque Android puede
  //   defaultear a modo video y confundir al técnico nuevo.
  // - videoInputRef: abre la cámara en modo video (capture=environment).
  // - galeriaInputRef: NO usa capture, así iOS/Android muestran el picker de la
  //   biblioteca con fotos y videos existentes. Esto soluciona el problema en iOS
  //   donde capture="environment" oculta la opción "Photo Library".
  const fotoInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const galeriaInputRef = useRef<HTMLInputElement>(null)

  const [tecnico, setTecnico] = useState<{ id: string; nombre_completo: string } | null>(null)
  const [servicio, setServicio] = useState<Servicio | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [exito, setExito] = useState(false)
  const [waSent, setWaSent] = useState<boolean | null>(null)
  const [waError, setWaError] = useState<string | null>(null)
  // Particular + reparar: total al cliente que devolvió /api/diagnostico
  // (fuente de verdad server-side) para mostrárselo al técnico al terminar.
  const [totalClienteApi, setTotalClienteApi] = useState<number | null>(null)
  const [progreso, setProgreso] = useState('')

  // Form state
  const [diagnosticoTexto, setDiagnosticoTexto] = useState('')
  const [complejidad, setComplejidad] = useState<ComplejidadServicio | null>(null)
  const [evidencias, setEvidencias] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])

  // Fault code (warranty only)
  const [codigoFalla, setCodigoFalla] = useState<CodigoFalla | null>(null)

  // Productos necesarios (SKU + desc + cantidad) y recomendados.
  // En GARANTÍA + esperar_repuesto el admin fija tiempo_entrega.
  // En PARTICULAR: el técnico ingresa costoTecnico abajo y el sistema calcula
  // el total al cliente (× 1.19 IVA × 1.10 margen Baird). Ver docs/TARIFAS.md.
  const [productosNecesarios, setProductosNecesarios] = useState<ProductoNecesario[]>([])
  const [productosRecomendados, setProductosRecomendados] = useState<ProductoRecomendado[]>([])

  // Particular only: costo total que el técnico cobrará (mano de obra + repuestos).
  // El cliente NO ve este valor — solo ve el Total al cliente con IVA.
  const [costoTecnico, setCostoTecnico] = useState<string>('')
  const costoTecnicoNum = useMemo(() => {
    const n = parseInt(costoTecnico.replace(/[^0-9]/g, ''), 10)
    return Number.isFinite(n) && n > 0 ? n : 0
  }, [costoTecnico])
  const tarifaParticular = useMemo(() => {
    if (costoTecnicoNum <= 0) return null
    return calcularTarifaParticular({ costoTecnico: costoTecnicoNum })
  }, [costoTecnicoNum])

  // Oath del técnico — debe firmarse antes de iniciar el diagnóstico
  const [oathFirma, setOathFirma] = useState<string | null>(null)

  // Siguiente paso post-diagnóstico (4 opciones)
  const [siguientePaso, setSiguientePaso] = useState<SiguientePasoData | null>(null)

  // GPS hook
  const { enviarPing } = useGps()

  // Extract model from novedades. Normalizamos a mayúsculas + trim porque
  // Serviplus es case-sensitive en el parámetro ?p= y los códigos de modelo
  // de Mabe/GE convencionalmente son uppercase. Eliminamos espacios para
  // evitar URL con %20 al final que el portal puede no manejar.
  const modeloEquipo = useMemo(() => {
    const match = servicio?.novedades_equipo?.match(/^\[Modelo:\s*(.+?)\]\s*/)
    if (!match) return null
    const normalizado = match[1].trim().replace(/\s+/g, '').toUpperCase()
    return normalizado || null
  }, [servicio])

  const novedadesSinModelo = useMemo(() => {
    if (!servicio) return ''
    const match = servicio.novedades_equipo.match(/^\[Modelo:\s*.+?\]\s*/)
    return match ? servicio.novedades_equipo.replace(match[0], '').trim() : servicio.novedades_equipo
  }, [servicio])

  // Calculate days since creation
  const diasTranscurridos = useMemo(() => {
    if (!servicio) return 0
    const created = new Date(servicio.created_at)
    const now = new Date()
    return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
  }, [servicio])

  // Pago al técnico (garantía): se muestra como rango antes de elegir
  // complejidad, y como proyección detallada después. Nunca expone lo que
  // paga MABE ni el margen Baird — solo el neto al técnico. Ver
  // docs/TARIFAS.md § "Garantía MABE" y src/lib/utils/pago-tecnico.ts.
  const pagoBreakdown = useMemo(() => {
    if (!servicio?.es_garantia) return null
    return estimarPagoTecnicoGarantia({
      complejidad: complejidad ?? null,
      diasSolucion: diasTranscurridos,
      horarioConfirmado: servicio.horario_confirmado,
      asumirOptimista: true,
    })
  }, [servicio, complejidad, diasTranscurridos])

  useEffect(() => {
    const cargar = async () => {
      // Las dos queries son independientes — paralelizamos para ahorrar
      // un round-trip. La validación de pertenencia (tecnico_asignado_id ===
      // tec.id) se hace client-side abajo. Con anon key + sin RLS la
      // diferencia de seguridad es nula y la ganancia ~200-500ms en 4G.
      // querySupabase reintenta con backoff en fetch errors transitorios
      // (4G/3G inestable es común para el técnico abriendo el link en la calle).
      const [tecResult, solResult] = await Promise.all([
        querySupabase(() =>
          supabase
            .from('tecnicos')
            .select('id, nombre_completo')
            .eq('portal_token', token)
            .single()
        ),
        querySupabase(() =>
          supabase
            .from('solicitudes_servicio')
            .select('id, cliente_nombre, tipo_equipo, marca_equipo, novedades_equipo, direccion, zona_servicio, ciudad_pueblo, pago_tecnico, estado, es_garantia, created_at, horario_confirmado, tecnico_asignado_id')
            .eq('id', id)
            .single()
        ),
      ])

      const tec = tecResult.data
      if (!tec) {
        trackError({
          error_type: 'page_load_error',
          error_message: tecResult.error?.message ?? 'tecnico not found by portal_token',
          actor: 'tecnico',
        })
        setError('Enlace invalido')
        setCargando(false)
        return
      }
      setTecnico(tec)

      const sol = solResult.data
      if (!sol || sol.tecnico_asignado_id !== tec.id) {
        trackError({
          error_type: 'page_load_error',
          error_message: solResult.error?.message ?? (sol ? 'sol not assigned to tec' : 'sol not found'),
          actor: 'tecnico',
        })
        setError('Servicio no encontrado')
        setCargando(false)
        return
      }

      // Valid states: 'asignada' (warranty) or 'diagnostico_pendiente' (non-warranty)
      if (sol.estado !== 'asignada' && sol.estado !== 'diagnostico_pendiente') {
        setError('Este servicio ya fue diagnosticado')
        setCargando(false)
        return
      }

      setServicio(sol)
      setCargando(false)
    }
    cargar()
  }, [token, id])

  // Handle file selection (photos/videos).
  // Las fotos se comprimen luego (en enviarDiagnostico), acá solo validamos tamaño
  // y tipo. El límite de 10 MB se aplica tras la compresión para imágenes (una
  // foto HEIC iPhone 6 MB termina en ~700 KB), pero antes para videos (no se
  // comprimen client-side). Por eso el mensaje accionable solo se muestra cuando
  // el archivo grande es un video.
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return
    const newFiles: File[] = []
    const newPreviews: string[] = []
    let advice: string | null = null

    for (let i = 0; i < files.length && evidencias.length + newFiles.length < MAX_EVIDENCIAS; i++) {
      const file = files[i]
      const isVideo = file.type.startsWith('video/')
      const isImage = file.type.startsWith('image/')
      if (!isImage && !isVideo) continue

      // Solo rechazamos por tamaño *antes* si es video — las imágenes las comprime
      // compressImageIfNeeded antes del upload.
      if (isVideo && file.size > MAX_FILE_SIZE) {
        advice = videoSizeAdvice()
        continue
      }
      newFiles.push(file)
      newPreviews.push(isImage ? URL.createObjectURL(file) : 'video')
    }

    setEvidencias(prev => [...prev, ...newFiles])
    setPreviews(prev => [...prev, ...newPreviews])
    setError(advice) // null si todos los archivos pasaron; mensaje guía si rechazamos un video grande
  }

  const removeEvidencia = (idx: number) => {
    setEvidencias(prev => prev.filter((_, i) => i !== idx))
    setPreviews(prev => {
      const url = prev[idx]
      if (url && url !== 'video') URL.revokeObjectURL(url)
      return prev.filter((_, i) => i !== idx)
    })
  }

  const enviarDiagnostico = async () => {
    if (!complejidad || !diagnosticoTexto.trim() || diagnosticoTexto.length < 10) return
    if (!servicio || !tecnico) return
    if (evidencias.length === 0) {
      setError('Debes adjuntar al menos una foto o video del fallo')
      return
    }
    if (!oathFirma) {
      setError('Debes firmar la declaración bajo juramento antes de continuar')
      return
    }
    if (!siguientePaso) {
      setError('Debes elegir el siguiente paso (4 opciones)')
      return
    }
    if (siguientePaso.paso === 'esperar_repuesto' && productosNecesarios.length === 0) {
      setError('Si seleccionaste "esperar repuesto" debes agregar al menos un producto necesario con SKU.')
      return
    }
    const productoIncompleto = productosNecesarios.find(p => !p.sku.trim() || !p.descripcion.trim() || !p.cantidad)
    if (productoIncompleto) {
      setError('Cada producto necesario debe tener SKU, descripción y cantidad.')
      return
    }
    const recomendadoIncompleto = productosRecomendados.find(p => !p.nombre.trim())
    if (recomendadoIncompleto) {
      setError('Cada recomendación debe tener al menos un nombre.')
      return
    }
    if ((siguientePaso.paso === 'no_reparable' || siguientePaso.paso === 'negativa_cliente') && !siguientePaso.detalle?.trim()) {
      setError('Debes describir el motivo del cierre del servicio')
      return
    }
    // Particular: si el siguiente paso es reparar o esperar_repuesto, el técnico
    // debe ingresar su costo total para que el sistema calcule la cotización.
    if (
      !servicio.es_garantia &&
      (siguientePaso.paso === 'reparar' || siguientePaso.paso === 'esperar_repuesto') &&
      costoTecnicoNum <= 0
    ) {
      setError('Ingresa tu costo total (mano de obra + repuestos) para generar la cotización al cliente')
      return
    }

    setEnviando(true)
    setError(null)

    // Capturar GPS de la fase diagnóstico (no bloqueante en caso de fallo)
    enviarPing(servicio.id, 'diagnostico', token).catch(() => {})

    try {
      // 1. Comprimir imágenes y subir a Supabase Storage en paralelo.
      //
      // Cambios respecto al loop secuencial anterior:
      //
      // - Compresión client-side antes del upload: una foto iPhone HEIC 5 MB
      //   termina en ~700 KB JPEG. Reduce 5-10× el tiempo de upload Y arregla
      //   el problema de que Chrome/Firefox del admin no decodifican HEIC.
      // - `Promise.all` en vez de `for await`: subir 4 fotos en serie a 4G era
      //   30-60 s; en paralelo el bottleneck es la conexión, no la latencia.
      // - Extensión inferida desde `file.type` (vía inferExtension) en vez de
      //   `file.name.split('.').pop()` — iOS a veces no pone extensión en el
      //   nombre del archivo de `capture="environment"`.
      // - Timestamp + idx + random suffix evita colisiones si el técnico hace
      //   submit dos veces seguidas tras un error de red.
      setProgreso('Procesando evidencias...')
      const stamp = Date.now()
      const rand = Math.random().toString(36).slice(2, 8)

      const uploadPromises = evidencias.map(async (rawFile, i) => {
        const file = await compressImageIfNeeded(rawFile, { maxDimension: 2560, quality: 0.9 })
        const ext = inferExtension(file)
        const path = `${servicio.id}/diagnostico_${stamp}_${rand}_${i}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('evidencias-servicio')
          .upload(path, file, {
            cacheControl: '3600',
            upsert: false,
            contentType: file.type || undefined,
          })

        if (uploadErr) {
          console.error(`[diagnostico] upload archivo ${i} falló:`, uploadErr)
          return null
        }
        const { data: urlData } = supabase.storage.from('evidencias-servicio').getPublicUrl(path)
        return urlData?.publicUrl ?? null
      })

      setProgreso('Subiendo evidencias...')
      const results = await Promise.all(uploadPromises)
      const evidenciaUrls = results.filter((u): u is string => !!u)

      if (evidenciaUrls.length === 0) {
        setError('Error al subir las evidencias. Intenta de nuevo.')
        setEnviando(false)
        setProgreso('')
        return
      }

      // 2. Build request body based on flow type
      setProgreso('Guardando diagnostico...')

      let bodyPayload: Record<string, unknown>

      // Datos comunes a ambos flujos
      const oathData = {
        oathFirma,
        oathFirmadoAt: new Date().toISOString(),
      }
      const siguientePasoData = {
        siguientePaso: siguientePaso!.paso,
        siguientePasoDetalle: siguientePaso!.detalle?.trim() || null,
        // El técnico ya no envía precio ni tiempo de entrega del repuesto.
        // El equipo Baird (admin) los fija desde /admin/cotizaciones-pendientes
        // o /admin/repuestos antes de notificar al cliente.
        productosNecesarios: productosNecesarios.map(p => ({
          sku: p.sku.trim().toUpperCase(),
          descripcion: p.descripcion.trim(),
          cantidad: Math.max(1, p.cantidad || 1),
          imagen_url: p.imagen_url || undefined,
        })),
        productosRecomendados: productosRecomendados.map(p => ({
          nombre: p.nombre.trim(),
          descripcion: p.descripcion.trim(),
        })),
      }

      if (servicio.es_garantia) {
        // WARRANTY: calculate tariffs (hidden from technician)
        const calculo = calcularTotalGarantia(complejidad, 0, diasTranscurridos)
        bodyPayload = {
          solicitudId: servicio.id,
          portalToken: token,
          diagnostico: diagnosticoTexto.trim(),
          complejidad,
          codigoComplejidad: calculo.complejidadInfo.codigo,
          tarifaManoObra: calculo.manoObra,
          bonoIncentivo: calculo.bono,
          totalServicio: calculo.total,
          evidenciaUrls,
          diasTranscurridos,
          codigoFalla: codigoFalla ? {
            codigo: codigoFalla.codigo,
            descripcion: codigoFalla.descripcion,
            familia: codigoFalla.familia,
            sistema: codigoFalla.sistema,
            componente: codigoFalla.componente,
            complejidad: codigoFalla.complejidad,
          } : null,
          ...oathData,
          ...siguientePasoData,
        }
      } else {
        // NON-WARRANTY (PARTICULAR): el técnico ingresa su costo total y el
        // sistema calcula automáticamente el total al cliente con IVA + margen
        // Baird. Ya NO pasa por admin pricing gate (cambio 2026-05-10, ver
        // docs/TARIFAS.md § "Particular").
        bodyPayload = {
          solicitudId: servicio.id,
          portalToken: token,
          diagnostico: diagnosticoTexto.trim(),
          complejidad,
          evidenciaUrls,
          // Si el siguiente paso es no_reparable o negativa_cliente, costoTecnico
          // puede ser 0; la API lo maneja correctamente (no genera cotización).
          costoTecnico: costoTecnicoNum,
          // codigoFalla disponible en ambos flujos (habilitado 2026-05-13).
          // En particular sirve para análisis posterior — no afecta cálculo.
          codigoFalla: codigoFalla ? {
            codigo: codigoFalla.codigo,
            descripcion: codigoFalla.descripcion,
            familia: codigoFalla.familia,
            sistema: codigoFalla.sistema,
            componente: codigoFalla.componente,
            complejidad: codigoFalla.complejidad,
          } : null,
          ...oathData,
          ...siguientePasoData,
        }
      }

      // 3. Send diagnostic to API (handles DB update + WhatsApp notification)
      const res = await fetch('/api/diagnostico', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Error al guardar el diagnóstico')
        setEnviando(false)
        return
      }

      // Surface si el WhatsApp al cliente se envió o quedó pendiente
      if (typeof data.whatsapp_sent === 'boolean') {
        setWaSent(data.whatsapp_sent)
        if (!data.whatsapp_sent && data.whatsapp_error) {
          setWaError(String(data.whatsapp_error))
        }
      }
      if (typeof data.totalCliente === 'number' && data.totalCliente > 0) {
        setTotalClienteApi(data.totalCliente)
      }
      setExito(true)
    } catch {
      setError('Error de conexion')
    }

    setEnviando(false)
    setProgreso('')
  }

  // Can submit?
  const productosCompletos = productosNecesarios.every(p => p.sku.trim() && p.descripcion.trim() && p.cantidad > 0)
  const recomendadosCompletos = productosRecomendados.every(p => p.nombre.trim())

  const siguientePasoListo = !!siguientePaso && (
    siguientePaso.paso === 'reparar' ||
    (siguientePaso.paso === 'esperar_repuesto' && productosNecesarios.length > 0 && productosCompletos) ||
    ((siguientePaso.paso === 'no_reparable' || siguientePaso.paso === 'negativa_cliente') && !!siguientePaso.detalle?.trim())
  )

  // Particular: el costo del técnico solo es obligatorio si va a haber cotización
  // (reparar o esperar_repuesto). Para no_reparable o negativa_cliente no hace falta.
  const requiereCostoParticular = !!servicio && !servicio.es_garantia && !!siguientePaso && (
    siguientePaso.paso === 'reparar' || siguientePaso.paso === 'esperar_repuesto'
  )
  const costoParticularListo = !requiereCostoParticular || costoTecnicoNum > 0

  const canSubmit = complejidad && diagnosticoTexto.length >= 10 && evidencias.length > 0
    && oathFirma && siguientePasoListo && productosCompletos && recomendadosCompletos
    && costoParticularListo

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-gray-200 border-t-slate-900 rounded-full" />
      </div>
    )
  }

  if (error && !servicio) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-slate-900 mb-2">Error</h1>
          <p className="text-sm text-gray-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-slate-900 text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-slate-800"
          >
            Reintentar
          </button>
          <p className="text-[10px] text-gray-400 mt-3">Verificá tu conexión y volvé a cargar.</p>
        </div>
      </div>
    )
  }

  if (exito) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <header className="bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-lg mx-auto px-4 h-14 flex items-center">
            <div className="relative w-28 h-8">
              <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
            </div>
          </div>
        </header>
        <div className="flex-1 flex items-start justify-center p-4 pt-12">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 max-w-md w-full text-center">
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold text-green-700 mb-2">Diagnostico registrado</h1>
            <p className="text-gray-500 text-sm mb-4">
              {servicio?.es_garantia
                ? 'Tu diagnóstico fue registrado. El equipo Baird coordina con el cliente la aprobación del siguiente paso (incluyendo tiempo de entrega si requiere repuesto).'
                : siguientePaso?.paso === 'esperar_repuesto'
                  ? 'Tu diagnóstico fue registrado. El equipo Baird revisará y fijará el precio final de los repuestos antes de enviar la cotización al cliente.'
                  : 'Tu diagnóstico y la cotización quedaron registrados.'}
            </p>
            {/* Particular + cotización directa (reparar): el técnico ve el
                precio final que se le cobrará al cliente YA CALCULADO, junto a
                su pago neto — claridad total para ambos. */}
            {!servicio?.es_garantia && totalClienteApi !== null && (
              <div className="mb-4 rounded-xl bg-purple-50 border-2 border-purple-200 p-4 text-left">
                <p className="text-xs font-bold text-purple-900 uppercase tracking-wide mb-2">🧾 Cotización generada</p>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600">Total que pagará el cliente</span>
                  <span className="font-bold text-purple-900">${formatCOP(totalClienteApi)} COP</span>
                </div>
                <p className="text-[11px] text-gray-500 mb-2">Incluye tu pago, utilidad Baird 13% e IVA 19%.</p>
                {costoTecnicoNum > 0 && (
                  <div className="flex justify-between text-sm border-t border-purple-200 pt-2">
                    <span className="text-gray-600">Tu pago si el cliente aprueba</span>
                    <span className="font-bold text-emerald-700">${formatCOP(costoTecnicoNum)} COP</span>
                  </div>
                )}
              </div>
            )}
            {waSent === true && (
              <div className="mb-4 rounded-xl bg-green-50 border border-green-200 p-3 text-xs text-green-900 text-left">
                📤 <strong>WhatsApp enviado al cliente</strong> — recibirá la {servicio?.es_garantia ? 'verificación del siguiente paso' : 'cotización con el diagnóstico y el total'} para aprobar o rechazar.
              </div>
            )}
            {waSent === false && siguientePaso?.paso !== 'esperar_repuesto' && (
              <div className="mb-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 text-left">
                ⚠️ <strong>WhatsApp NO se envió al cliente.</strong> El diagnóstico quedó guardado, pero el equipo de Baird tendrá que reenviar el mensaje manualmente desde el panel admin.{waError ? ` Detalle: ${waError}` : ''}
              </div>
            )}
            {!servicio?.es_garantia && siguientePaso?.paso === 'esperar_repuesto' && (
              <div className="mb-4 rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-900 text-left">
                ⏳ <strong>En revisión por el equipo Baird.</strong> El cliente recibirá la cotización por WhatsApp una vez que admin fije el precio de los repuestos.
              </div>
            )}
            <button
              onClick={() => router.push(`/tecnico/${token}`)}
              className="w-full bg-slate-900 text-white font-semibold py-3 px-6 rounded-xl hover:bg-slate-800 transition-colors"
            >
              Volver a mis servicios
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Oath modal — bloquea hasta que el técnico firme */}
      {!oathFirma && servicio && tecnico && (
        <OathModal
          tecnicoNombre={tecnico.nombre_completo.split(' ')[0]}
          equipo={`${servicio.tipo_equipo} ${servicio.marca_equipo}`}
          onConfirm={(firma) => {
            setOathFirma(firma)
            // Capturar GPS de llegada cuando firma
            enviarPing(servicio.id, 'llegada', token).catch(() => {})
          }}
        />
      )}

      {/* Header */}
      <header className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="relative w-28 h-8">
            <Image src="/Baird_Service_Logo.png" alt="Baird Service" fill className="object-contain object-left" />
          </div>
          <span className="text-xs text-purple-700 bg-purple-100 px-2 py-1 rounded-full font-medium">
            Diagnostico
          </span>
        </div>
      </header>

      <div className="flex-1 max-w-lg mx-auto px-4 py-6 w-full">
        {/* Service summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="text-lg font-bold text-slate-900 mb-3">Datos del servicio</h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Equipo</span>
              <span className="font-semibold text-slate-900">{servicio!.tipo_equipo} {servicio!.marca_equipo}</span>
            </div>
            {modeloEquipo && (
              <div className="flex justify-between">
                <span className="text-gray-500">Modelo</span>
                <span className="font-mono text-xs text-slate-700 bg-gray-100 px-2 py-0.5 rounded">{modeloEquipo}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-500">Cliente</span>
              <span className="text-slate-700">{servicio!.cliente_nombre}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Zona</span>
              <span className="text-slate-700">{servicio!.zona_servicio}, {servicio!.ciudad_pueblo}</span>
            </div>
            <div>
              <span className="text-gray-500">Problema reportado:</span>
              <p className="text-slate-700 text-xs mt-1">{novedadesSinModelo}</p>
            </div>
          </div>
        </div>

        {/* WARRANTY: Pago al técnico (rango antes de diagnóstico, proyección después). */}
        {servicio!.es_garantia && pagoBreakdown && (
          <div className="mb-4">
            <PagoTecnicoBreakdown breakdown={pagoBreakdown} />
          </div>
        )}

        {/* NON-WARRANTY: Particular service info banner */}
        {!servicio!.es_garantia && (
          <div className="rounded-2xl shadow-sm border-2 border-blue-300 bg-blue-50 p-5 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">💼</span>
              <h3 className="text-sm font-bold text-slate-900">Servicio particular</h3>
            </div>
            <p className="text-xs text-gray-600">
              Este es un servicio particular (sin garantía). Indica tu costo total — el sistema agrega IVA y comisión Baird automáticamente.
            </p>
            <p className="text-xs text-blue-900 mt-2 bg-blue-100 rounded-lg p-2">
              ℹ️ <strong>Si necesitas repuesto:</strong> tu cotización pasará primero por revisión del equipo Baird para fijar el costo final de los repuestos. El cliente recibirá la cotización una vez que admin la complete.
            </p>
          </div>
        )}

        {/* Diagnostic form */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Diagnostico del tecnico</h2>
          <p className="text-xs text-gray-400 mb-4">Registra el problema real identificado en el equipo</p>

          {/* Problem description */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Problema real identificado *
            </label>
            <textarea
              value={diagnosticoTexto}
              onChange={(e) => setDiagnosticoTexto(e.target.value)}
              placeholder="Describe detalladamente el problema real encontrado en el equipo..."
              rows={4}
              className="w-full border border-gray-200 rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            {diagnosticoTexto.length > 0 && diagnosticoTexto.length < 10 && (
              <p className="text-xs text-red-500 mt-1">Minimo 10 caracteres</p>
            )}
          </div>

          {/* Fault code selector (warranty + particular).
              Hasta 2026-05-13 solo aparecía en garantía. Se habilitó también en
              particular para que las familias REFRIGERACION / LAVADO / CENTROS DE
              LAVADO / etc. queden disponibles al técnico independientemente del
              flujo. La API persiste `codigo_falla` en triaje_resultado y
              cotizacion (para particular) para consulta posterior. */}
          <CodigoFallaSelector
            tipoEquipo={servicio!.tipo_equipo}
            diagnosticoTexto={diagnosticoTexto}
            value={codigoFalla}
            onChange={setCodigoFalla}
          />

          {/* Complexity selection — NO prices shown */}
          <div className="mb-5">
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Nivel de complejidad de la reparacion *
            </label>
            <div className="space-y-2">
              {(Object.entries(TARIFAS_MANO_OBRA) as [ComplejidadServicio, typeof TARIFAS_MANO_OBRA['baja']][]).map(([key, tarifa]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setComplejidad(key)}
                  className={`w-full text-left px-4 py-3.5 rounded-xl border-2 transition-all ${
                    complejidad === key
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
                      complejidad === key ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {/* Inicial de la complejidad (B/M/A) en lugar del código
                          interno MABE — el técnico no necesita ver el código. */}
                      {tarifa.label[0]}
                    </div>
                    <div>
                      <span className={`text-sm font-bold ${complejidad === key ? 'text-purple-800' : 'text-slate-900'}`}>
                        {tarifa.label}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">{tarifa.descripcion}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Nota: el precio y tiempo de entrega de repuestos los fija el equipo Baird tras revisar el diagnóstico */}
          <div className="mb-5 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs text-amber-900">
              💡 <strong>Nuevo flujo:</strong> tú indicas qué repuestos se necesitan; el equipo Baird fija precio y tiempo de entrega antes de enviar la cotización al cliente.
            </p>
          </div>
        </div>

        {/* Productos necesarios (SKUs requeridos) */}
        <ProductosNecesariosForm
          productos={productosNecesarios}
          onChange={setProductosNecesarios}
          marcaEquipo={servicio!.marca_equipo}
          modeloEquipo={modeloEquipo}
          solicitudId={servicio!.id}
        />

        {/* Productos recomendados (limpiadores, accesorios — opcional) */}
        <ProductosRecomendadosForm
          productos={productosRecomendados}
          onChange={setProductosRecomendados}
        />

        {/* Link al store oficial — útil para conseguir SKUs de repuestos */}
        {(productosNecesarios.length > 0 || productosRecomendados.length > 0) && (
          <div className="mb-4">
            <TiendaRepuestosLink
              variant="banner"
              tone="emerald"
              texto="Consigue los repuestos listados en tienda.bairdservice.com — productos originales con factura DIAN."
            />
          </div>
        )}

        {/* Particular only: lo que el técnico quiere ganar (mano de obra + repuestos).
            El cliente paga = costo × 1.13 utilidad Baird × 1.19 IVA. Solo se muestra
            cuando el siguiente paso es reparar o esperar_repuesto (los otros
            cierran el servicio sin cotización). */}
        {!servicio!.es_garantia && requiereCostoParticular && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
            <h2 className="text-lg font-bold text-slate-900 mb-1">¿Cuánto quieres ganar por esta reparación? <span className="text-red-500">*</span></h2>
            <p className="text-xs text-gray-400 mb-4">
              <strong>Valor en COP requerido.</strong> Mano de obra + repuestos — este monto es TU PAGO y lo recibes completo. El cliente NO ve este valor: a él le llega el total con utilidad Baird e IVA.
            </p>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-medium">$</span>
              <input
                type="text"
                inputMode="numeric"
                value={costoTecnico}
                onChange={(e) => {
                  const v = e.target.value.replace(/[^0-9]/g, '')
                  setCostoTecnico(v ? parseInt(v, 10).toLocaleString('es-CO') : '')
                }}
                placeholder="0"
                className="w-full border border-gray-200 rounded-xl py-3 pl-8 pr-14 text-base focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 text-sm font-semibold">COP</span>
            </div>
            {costoTecnicoNum <= 0 && (
              <p className="text-xs text-amber-700 mt-1">⚠️ Ingresa un valor mayor a 0 en COP.</p>
            )}
            {tarifaParticular && (
              <div className="mt-4 bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs">
                <div className="flex justify-between text-gray-600 mb-1">
                  <span>Tu pago (lo que recibes)</span>
                  <span className="font-medium text-slate-800">${formatCOP(tarifaParticular.costoTecnico)}</span>
                </div>
                <div className="flex justify-between text-gray-600 mb-1">
                  <span>+ Utilidad Baird 13%</span>
                  <span className="text-slate-700">${formatCOP(tarifaParticular.margenBaird)}</span>
                </div>
                <div className="flex justify-between text-gray-600 mb-2">
                  <span>+ IVA 19%</span>
                  <span className="text-slate-700">${formatCOP(tarifaParticular.ivaCliente)}</span>
                </div>
                <div className="flex justify-between font-bold text-purple-900 border-t border-purple-200 pt-2">
                  <span>Total al cliente (incluye IVA)</span>
                  <span>${formatCOP(tarifaParticular.totalCliente)}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Evidence upload */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
          <h2 className="text-lg font-bold text-slate-900 mb-1">Evidencia del fallo *</h2>
          <p className="text-xs text-gray-400 mb-3">
            Toma fotos del problema con la cámara o súbelas desde la galería. También puedes adjuntar un video.
          </p>

          {/* Recordatorio: foto de la placa con el modelo. La placa (etiqueta
              del fabricante) trae el modelo exacto del equipo — sin ella el
              admin no puede validar repuestos ni la tarifa de garantía. */}
          <div className="flex gap-2.5 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
            <span className="text-base leading-none mt-0.5">🏷️</span>
            <p className="text-xs text-amber-900 leading-relaxed">
              <strong>Incluye siempre una foto de la placa del equipo</strong> —
              la etiqueta del fabricante donde se vea claramente el modelo. Es
              clave para validar repuestos y la garantía.
            </p>
          </div>

          {/* File grid */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            {previews.map((preview, idx) => (
              <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-gray-100 border border-gray-200">
                {preview === 'video' ? (
                  <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white">
                    <span className="text-3xl mb-1">🎬</span>
                    <span className="text-xs font-medium">{evidencias[idx]?.name?.substring(0, 20)}</span>
                    <span className="text-[10px] text-gray-300 mt-0.5">
                      {(evidencias[idx]?.size / (1024 * 1024)).toFixed(1)} MB
                    </span>
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={`Evidencia ${idx + 1}`} className="w-full h-full object-cover" />
                )}
                <button
                  onClick={() => removeEvidencia(idx)}
                  className="absolute top-1.5 right-1.5 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center text-sm font-bold shadow-lg hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ))}

            {evidencias.length < MAX_EVIDENCIAS && (
              <button
                onClick={() => fotoInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center hover:border-purple-400 hover:bg-purple-50/50 transition-colors"
              >
                <span className="text-2xl mb-1">📷</span>
                <span className="text-xs text-gray-500 font-medium">Tomar foto</span>
                <span className="text-[10px] text-gray-400 mt-0.5">Max 10MB</span>
              </button>
            )}
          </div>

          {/* Input principal — solo fotos. accept="image/*" + capture="environment"
              hace que Android abra la cámara trasera en modo foto directamente.
              Sin esto, accept="image/*,video/*" causa que algunos Android abran
              en modo video por default, lo que confunde a técnicos nuevos. */}
          <input
            ref={fotoInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          {/* Input opcional para video desde cámara — explícito, secundario. */}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            capture="environment"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          {/* Input para galería — sin capture para que iOS/Android muestren la
              biblioteca de fotos y videos existentes. Acepta múltiples. */}
          <input
            ref={galeriaInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files)}
          />

          {evidencias.length < MAX_EVIDENCIAS && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
              <button
                type="button"
                onClick={() => galeriaInputRef.current?.click()}
                className="text-xs text-gray-600 underline hover:text-purple-700"
              >
                🖼️ Elegir foto o video de galería
              </button>
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                className="text-xs text-gray-600 underline hover:text-purple-700"
              >
                🎬 Grabar video con cámara
              </button>
            </div>
          )}

          <p className="text-[10px] text-gray-400">
            {evidencias.length}/{MAX_EVIDENCIAS} archivos · Fotos del fallo (o video corto opcional)
          </p>
        </div>

        {/* Siguiente paso — 4 opciones (los detalles del repuesto van en Productos necesarios) */}
        <SiguientePasoSelector
          data={siguientePaso}
          onChange={setSiguientePaso}
          tieneProductosNecesarios={productosNecesarios.length > 0}
        />

        {/* Error message */}
        {error && servicio && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Progress */}
        {progreso && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-4">
            <p className="text-sm text-blue-700 flex items-center gap-2">
              <span className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
              {progreso}
            </p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={enviarDiagnostico}
          disabled={enviando || !canSubmit}
          className={`w-full font-bold py-4 px-6 rounded-xl text-base transition-all shadow-sm mb-8 ${
            canSubmit && !enviando
              ? 'bg-purple-600 hover:bg-purple-700 active:scale-[0.99] text-white'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {enviando ? (
            <span className="flex items-center justify-center gap-2">
              <span className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              {progreso || 'Guardando...'}
            </span>
          ) : (
            'Registrar diagnostico'
          )}
        </button>

        {!canSubmit && !enviando && (() => {
          // Cover ALL validation conditions in canSubmit + show first failing
          const motivo =
            !diagnosticoTexto || diagnosticoTexto.length < 10
              ? 'Describe el problema encontrado (mínimo 10 caracteres)'
              : !complejidad
                ? 'Selecciona el nivel de complejidad'
                : evidencias.length === 0
                  ? 'Adjunta al menos una foto o video del fallo'
                  : !oathFirma
                    ? 'Firma la declaración bajo juramento (botón al inicio)'
                    : !siguientePaso
                      ? 'Elige el siguiente paso (4 opciones)'
                      : siguientePaso.paso === 'esperar_repuesto' && productosNecesarios.length === 0
                        ? 'Agrega al menos un repuesto con SKU en la sección "Productos necesarios"'
                        : !productosCompletos
                          ? 'Completa SKU, descripción y cantidad en cada repuesto'
                          : !recomendadosCompletos
                            ? 'Cada recomendación debe tener nombre'
                            : (siguientePaso.paso === 'no_reparable' || siguientePaso.paso === 'negativa_cliente') && !siguientePaso.detalle?.trim()
                              ? 'Describe el motivo del cierre del servicio'
                              : requiereCostoParticular && !costoParticularListo
                                ? 'Ingresa tu costo total para generar la cotización'
                                : 'Faltan datos por completar'
          return (
            <p className="text-center text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 -mt-4 mb-8">
              ⚠️ {motivo}
            </p>
          )
        })()}
      </div>
    </div>
  )
}
