import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * API Route para triaje de problemas con IA usando Google Gemini
 * POST /api/triaje
 * Body: { novedades_equipo, tipo_equipo, marca_equipo, tipo_solicitud }
 * Returns: TriajeResponse (JSON con diagnóstico, costo, tiempo, etc.)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      novedades_equipo,
      tipo_equipo,
      marca_equipo,
      tipo_solicitud
    } = body

    // Validar que la API key esté configurada
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'API de IA no configurada. Contacta al administrador.' },
        { status: 500 }
      )
    }

    // Validar entrada
    if (!novedades_equipo || novedades_equipo.length < 20) {
      return NextResponse.json(
        { error: 'La descripción es muy corta para realizar un análisis (mínimo 20 caracteres)' },
        { status: 400 }
      )
    }

    // Inicializar Gemini
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' })

    // Construir prompt técnico para el triaje
    const prompt = `Eres un experto técnico en electrodomésticos de línea blanca con más de 20 años de experiencia.
Analiza el siguiente problema reportado y proporciona un diagnóstico técnico preciso.

INFORMACIÓN DEL EQUIPO:
- Tipo de equipo: ${tipo_equipo}
- Marca: ${marca_equipo}
- Tipo de servicio solicitado: ${tipo_solicitud}

DESCRIPCIÓN DEL PROBLEMA REPORTADO:
${novedades_equipo}

INSTRUCCIONES IMPORTANTES:
Responde ÚNICAMENTE con un objeto JSON válido (sin formato markdown, sin \`\`\`json, sin explicaciones adicionales) con esta estructura exacta:
{
  "posible_falla": "Descripción técnica de la falla más probable basada en los síntomas",
  "nivel_complejidad": "baja|media|alta",
  "requiere_repuestos": true|false,
  "repuestos_sugeridos": ["nombre del repuesto 1", "nombre del repuesto 2"],
  "tiempo_estimado_horas": número_decimal,
  "costo_estimado_min": número_entero_en_pesos_colombianos,
  "costo_estimado_max": número_entero_en_pesos_colombianos,
  "recomendaciones": ["recomendación 1", "recomendación 2"],
  "urgencia": "baja|media|alta"
}

CRITERIOS PARA TU ANÁLISIS:
- Complejidad "baja": Problemas simples que requieren menos de 2 horas
- Complejidad "media": Requiere diagnóstico más profundo, 2-4 horas
- Complejidad "alta": Problemas complejos que requieren más de 4 horas
- Urgencia "alta": Si el equipo puede causar daños o afecta necesidades básicas
- Urgencia "media": Problema molesto pero no crítico
- Urgencia "baja": Mantenimiento preventivo o problemas menores
- Costos en pesos colombianos (COP): Considera mano de obra y repuestos
- Sé específico con los nombres de repuestos (ej: "Termostato de nevera", no solo "termostato")
- Las recomendaciones deben ser accionables para el cliente

Considera patrones comunes de fallas para ${tipo_equipo} marca ${marca_equipo}.

IMPORTANTE: Responde SOLO con el JSON, sin texto adicional antes o después.`

    // Llamar a Gemini con timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15 segundos timeout

    try {
      const result = await model.generateContent(prompt)
      clearTimeout(timeout)

      const response = result.response
      const responseText = response.text().trim()

      if (!responseText) {
        throw new Error('No se recibió respuesta de la IA')
      }

      // Limpiar el texto de posibles marcadores de markdown
      let cleanedText = responseText
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.replace(/```json\n?/g, '').replace(/```\n?/g, '')
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.replace(/```\n?/g, '')
      }
      cleanedText = cleanedText.trim()

      // Parsear JSON de la respuesta
      let triaje
      try {
        triaje = JSON.parse(cleanedText)
      } catch (parseError) {
        console.error('Error al parsear JSON:', cleanedText)
        throw new Error('Respuesta de IA en formato inválido')
      }

      // Validar estructura de respuesta
      const requiredFields = [
        'posible_falla',
        'nivel_complejidad',
        'requiere_repuestos',
        'repuestos_sugeridos',
        'tiempo_estimado_horas',
        'costo_estimado_min',
        'costo_estimado_max',
        'recomendaciones',
        'urgencia'
      ]

      const missingFields = requiredFields.filter(field => !(field in triaje))
      if (missingFields.length > 0) {
        console.error('Campos faltantes en respuesta de IA:', missingFields)
        throw new Error('Respuesta de IA incompleta')
      }

      // Validar tipos y valores
      if (!['baja', 'media', 'alta'].includes(triaje.nivel_complejidad)) {
        triaje.nivel_complejidad = 'media' // Default seguro
      }
      if (!['baja', 'media', 'alta'].includes(triaje.urgencia)) {
        triaje.urgencia = 'media' // Default seguro
      }

      return NextResponse.json(triaje)

    } catch (aiError: unknown) {
      clearTimeout(timeout)

      if (aiError instanceof Error && aiError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'El análisis está tomando demasiado tiempo. Inténtalo de nuevo.' },
          { status: 408 }
        )
      }

      throw aiError
    }

  } catch (error: unknown) {
    console.error('Error en triaje:', error)

    // Manejo diferenciado de errores
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Error al procesar la respuesta del análisis' },
        { status: 500 }
      )
    }

    const errorMessage = error instanceof Error
      ? error.message
      : 'Error al analizar el problema'

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
