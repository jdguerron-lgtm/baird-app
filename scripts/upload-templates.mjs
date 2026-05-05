/**
 * Upload WhatsApp message templates to Meta for approval.
 *
 * Usage:
 *   node --env-file=.env.local scripts/upload-templates.mjs              # upload all (skip existing)
 *   node --env-file=.env.local scripts/upload-templates.mjs <name>       # upload one
 *   node --env-file=.env.local scripts/upload-templates.mjs --check      # list current templates
 *   node --env-file=.env.local scripts/upload-templates.mjs --delete <name>
 *
 * Requires:
 *   WHATSAPP_API_TOKEN env var with `whatsapp_business_management` permission.
 *   WABA_ID env var (defaults to Baird Service WABA: 2354953275016882).
 */

const WABA_ID = process.env.WABA_ID || '2354953275016882'
const TOKEN = process.env.WHATSAPP_API_TOKEN
const API_BASE = 'https://graph.facebook.com/v22.0'
const APP_URL = 'https://baird-app.vercel.app'

if (!TOKEN) {
  console.error('❌ WHATSAPP_API_TOKEN missing. Run with --env-file=.env.local')
  process.exit(1)
}

const TEMPLATES = [
  // 1. Cliente elige horario (paso 1 del nuevo flujo customer-first)
  {
    name: 'cliente_seleccion_horario_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Solicitud recibida en Baird Service',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, recibimos tu solicitud para tu {{2}}.\n\n' +
          'Antes de continuar, necesitamos que confirmes tu horario preferido:\n\n' +
          '🕐 Opción 1: {{3}}\n' +
          '🕑 Opción 2: {{4}}\n\n' +
          '⚠️ Importante: al agendar aceptas nuestros Términos y Condiciones, ' +
          'incluyendo que NINGÚN pago se realiza directamente al técnico.',
        example: {
          body_text: [['María', 'Lavadora LG', 'Lunes 8am-12pm', 'Martes 2pm-6pm']],
        },
      },
      { type: 'FOOTER', text: 'Toca el botón para confirmar tu horario' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Confirmar horario',
            url: `${APP_URL}/horario/{{1}}`,
            example: [`${APP_URL}/horario/abc-123`],
          },
        ],
      },
    ],
  },

  // 2. Recordatorio si cliente no confirmó horario tras 24h
  {
    name: 'recordatorio_horario_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, no hemos recibido confirmación del horario para tu {{2}}.\n\n' +
          'Si no confirmas en las próximas 12 horas, tu solicitud se cerrará ' +
          'como "Sin agendar" y deberás crear una nueva.',
        example: { body_text: [['María', 'Lavadora LG']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Confirmar ahora',
            url: `${APP_URL}/horario/{{1}}`,
            example: [`${APP_URL}/horario/abc-123`],
          },
        ],
      },
    ],
  },

  // 3. Cliente recibe datos del técnico asignado (reemplaza v4, agrega link T&C)
  {
    name: 'tecnico_asignado_cliente_v5',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}} 👋, tu técnico verificado para el servicio de {{3}} es:\n\n' +
          '👨‍🔧 {{2}}\n' +
          '🕐 Horario: {{4}}\n' +
          '📞 {{5}}\n\n' +
          '🚨 RECUERDA:\n' +
          '• NO realices pagos en efectivo o directos al técnico\n' +
          '• Tras el diagnóstico DEBES aprobar la siguiente acción aquí en WhatsApp\n' +
          '• Realizar el servicio fuera de la plataforma anula la garantía\n\n' +
          '📋 Términos: ' + APP_URL + '/terminos',
        example: {
          body_text: [
            ['María', 'Pedro Gómez', 'Lavadora LG', 'Lunes 8am-12pm', '+573001234567'],
          ],
        },
      },
      { type: 'FOOTER', text: 'Baird Service - Reparaciones verificadas' },
    ],
  },

  // 4. Diagnóstico completado, esperando repuesto (incluye SKU)
  {
    name: 'esperando_repuesto_cliente_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, el técnico {{2}} terminó el diagnóstico de tu {{3}}.\n\n' +
          '🔧 Se requiere repuesto:\n' +
          '• SKU: {{4}}\n' +
          '• Descripción: {{5}}\n\n' +
          '⏱️ Tiempo estimado de llegada: {{6}}\n\n' +
          'Te avisaremos por WhatsApp en cuanto esté disponible para reagendar.',
        example: {
          body_text: [
            ['María', 'Pedro Gómez', 'Lavadora LG', 'WM-PCB-7421', 'Tarjeta electrónica de control', '5 días hábiles'],
          ],
        },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 5. Repuesto disponible — reanudar flujo
  {
    name: 'repuesto_recibido_cliente_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          '¡Buenas noticias {{1}}! 📦\n\n' +
          'El repuesto para tu {{2}} ya llegó. El técnico {{3}} se contactará ' +
          'pronto para reagendar la visita y completar la reparación.',
        example: { body_text: [['María', 'Lavadora LG', 'Pedro Gómez']] },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 7. Verificación del siguiente paso por el cliente (post-diagnóstico, garantía)
  {
    name: 'verificar_siguiente_paso_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, el técnico {{2}} terminó el diagnóstico de tu {{3}}.\n\n' +
          '🔍 Diagnóstico: {{4}}\n\n' +
          '📋 Acción propuesta: {{5}}\n\n' +
          'Para que el servicio pueda continuar, necesitamos tu confirmación. Si no apruebas, ' +
          'el técnico NO podrá ejecutar esta acción y se considerará incumplimiento.',
        example: {
          body_text: [[
            'María',
            'Pedro Gómez',
            'Lavadora LG',
            'Tarjeta de control quemada por sobretensión',
            'Esperar repuesto SKU WM-PCB-7421 (Tarjeta electrónica). Tiempo estimado 5 días hábiles.',
          ]],
        },
      },
      { type: 'FOOTER', text: 'Toca el botón para revisar y confirmar' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Revisar y confirmar',
            url: `${APP_URL}/verificar-paso/{{1}}`,
            example: [`${APP_URL}/verificar-paso/abc-123`],
          },
        ],
      },
    ],
  },

  // 6. Equipo no reparable (terminal)
  {
    name: 'finalizado_sin_reparacion_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, lamentamos informarte que tu {{2}} no es reparable.\n\n' +
          'Motivo técnico: {{3}}\n\n' +
          'El técnico {{4}} dejó tu equipo en las mismas condiciones. ' +
          'Quedamos atentos a cualquier inquietud.\n\n' +
          'Gracias por confiar en nosotros.',
        example: {
          body_text: [
            ['María', 'Lavadora LG', 'Daño irreparable en estructura interna del tambor', 'Pedro Gómez'],
          ],
        },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },
]

async function listExisting() {
  const res = await fetch(`${API_BASE}/${WABA_ID}/message_templates?limit=100`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  })
  if (!res.ok) throw new Error(`Failed to list: ${res.status} ${await res.text()}`)
  const body = await res.json()
  return body.data
}

async function uploadOne(tpl) {
  const res = await fetch(`${API_BASE}/${WABA_ID}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(tpl),
  })

  const body = await res.json()

  if (!res.ok) {
    console.error(`❌ ${tpl.name}: ${res.status}`)
    console.error(JSON.stringify(body, null, 2))
    return false
  }

  console.log(`✅ ${tpl.name} → status: ${body.status}, id: ${body.id}`)
  return true
}

async function deleteOne(name) {
  const res = await fetch(
    `${API_BASE}/${WABA_ID}/message_templates?name=${encodeURIComponent(name)}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${TOKEN}` },
    }
  )
  const body = await res.json()
  console.log(`Delete ${name}:`, JSON.stringify(body))
}

async function main() {
  const args = process.argv.slice(2)

  if (args[0] === '--check') {
    const existing = await listExisting()
    console.log(`📋 ${existing.length} templates currently in Meta:\n`)
    for (const t of existing.sort((a, b) => a.name.localeCompare(b.name))) {
      const icon = t.status === 'APPROVED' ? '✅' : t.status === 'PENDING' ? '⏳' : '❌'
      console.log(`  ${icon} ${t.name.padEnd(45)} ${t.status}`)
    }
    return
  }

  if (args[0] === '--delete') {
    if (!args[1]) {
      console.error('Provide template name: --delete <name>')
      process.exit(1)
    }
    await deleteOne(args[1])
    return
  }

  const filter = args[0]
  const toUpload = filter ? TEMPLATES.filter(t => t.name === filter) : TEMPLATES

  if (toUpload.length === 0) {
    console.error(`No templates match "${filter}"`)
    process.exit(1)
  }

  console.log(`📤 Uploading ${toUpload.length} template(s) to WABA ${WABA_ID}...\n`)

  const existing = await listExisting()
  const existingNames = new Set(existing.map(e => e.name))

  for (const tpl of toUpload) {
    if (existingNames.has(tpl.name)) {
      const cur = existing.find(e => e.name === tpl.name)
      console.log(`⏭️  ${tpl.name} already exists (status: ${cur?.status}). Skipping.`)
      continue
    }
    await uploadOne(tpl)
    await new Promise(r => setTimeout(r, 500))
  }

  console.log('\n✨ Done. Run with --check to monitor approval status.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
