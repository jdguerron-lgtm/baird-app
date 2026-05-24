/**
 * Upload WhatsApp templates v2 — domain migration to lineablanca.bairdservice.com.
 *
 * Solo contiene las 10 templates que tienen URLs (botones o body text).
 * Las otras 6 templates (sin URLs) NO necesitan re-upload — siguen funcionando.
 *
 * Cada template se sube con número de versión incrementado:
 *   _v1 → _v2,  _v3 → _v4,  _v5 → _v6
 *
 * Usage:
 *   node --env-file=.env.local scripts/upload-templates-v2.mjs           # upload all 10
 *   node --env-file=.env.local scripts/upload-templates-v2.mjs <name>    # upload one
 *   node --env-file=.env.local scripts/upload-templates-v2.mjs --check   # list current templates
 *
 * Después de subir:
 *   - Esperar 1-24h por aprobación Meta
 *   - Cuando todas APPROVED, actualizar whatsapp.service.ts para llamar los nuevos nombres
 *   - Eventualmente borrar las _v1/_v3/_v5 viejas (esperar 1 semana sin issues)
 */

const WABA_ID = process.env.WABA_ID || '2354953275016882'
const TOKEN = process.env.WHATSAPP_API_TOKEN
const API_BASE = 'https://graph.facebook.com/v22.0'
const APP_URL = 'https://lineablanca.bairdservice.com'

if (!TOKEN) {
  console.error('❌ WHATSAPP_API_TOKEN missing. Run with --env-file=.env.local')
  process.exit(1)
}

const TEMPLATES = [
  // 1. Cliente elige horario — _v1 → _v2
  {
    name: 'cliente_seleccion_horario_v2',
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

  // 2. Recordatorio horario — _v1 → _v2
  {
    name: 'recordatorio_horario_v2',
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

  // 3. Técnico asignado cliente — _v5 → _v6 (body contiene URL /terminos)
  {
    name: 'tecnico_asignado_cliente_v6',
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

  // 4. Verificar siguiente paso (post-diagnóstico garantía) — _v1 → _v2
  {
    name: 'verificar_siguiente_paso_v2',
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

  // 5. Nueva solicitud garantía → técnico — _v3 → _v4
  {
    name: 'nueva_solicitud_v4',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Nueva solicitud disponible',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, tienes una nueva solicitud de garantía:\n\n' +
          '🔧 Equipo: {{2}}\n' +
          '⚠️ Problema: {{3}}\n' +
          '📍 Ubicación: {{4}}\n' +
          '🕐 Horario: {{5}}\n' +
          '💰 Pago: {{6}}\n\n' +
          'Si la aceptas, recibirás los datos completos del cliente. Solo el primer técnico que la acepte gana el servicio.',
        example: {
          body_text: [[
            'Carlos',
            'Lavadora Mabe',
            'No centrifuga',
            'Calle 53 #24-18, Chapinero, Bogotá',
            'lunes 6 de mayo · 8am-12pm',
            'GARANTIA - Sin cobro',
          ]],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Aceptar servicio',
            url: `${APP_URL}/aceptar/{{1}}`,
            example: [`${APP_URL}/aceptar/00000000-0000-0000-0000-000000000000`],
          },
        ],
      },
    ],
  },

  // 6. Servicio asignado al técnico ganador — _v3 → _v4
  {
    name: 'servicio_asignado_tecnico_v4',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: '¡Servicio asignado!',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, has aceptado el servicio:\n\n' +
          '👤 Cliente: {{2}}\n' +
          '🔧 Equipo: {{3}}\n' +
          '📍 Dirección: {{4}}\n' +
          '💰 Pago: {{5}}\n' +
          '📞 Contacto: {{6}}\n\n' +
          'Coordina la visita con el cliente. Antes de iniciar, abre el portal para firmar el oath y registrar el diagnóstico.',
        example: {
          body_text: [[
            'Carlos',
            'Juan Pérez',
            'Lavadora Mabe',
            'Calle 100 #15-20, Chapinero',
            'GARANTIA - Sin cobro',
            '+573001234567',
          ]],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Abrir portal',
            url: `${APP_URL}/tecnico/{{1}}`,
            example: [`${APP_URL}/tecnico/00000000-0000-0000-0000-000000000000`],
          },
        ],
      },
    ],
  },

  // 7. Solicitud particular → técnico — _v1 → _v2
  {
    name: 'solicitud_particular_tecnico_v2',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Nueva solicitud particular',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, tienes una nueva solicitud particular (no garantía):\n\n' +
          '🔧 Equipo: {{2}}\n' +
          '⚠️ Problema: {{3}}\n' +
          '📍 Ubicación: {{4}}\n' +
          '🕐 Horario: {{5}}\n' +
          '💰 Pago diagnóstico: {{6}}\n\n' +
          'El cliente paga via Baird Service tras tu diagnóstico — nunca aceptes pago directo en efectivo. Solo el primer técnico que acepte gana el servicio.',
        example: {
          body_text: [[
            'Carlos',
            'Nevera LG',
            'No enfría',
            'Carrera 9 #140-30, Cedritos, Bogotá',
            'martes 7 de mayo · 2pm-5pm',
            '$80,000 COP',
          ]],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Aceptar servicio',
            url: `${APP_URL}/aceptar/{{1}}`,
            example: [`${APP_URL}/aceptar/00000000-0000-0000-0000-000000000000`],
          },
        ],
      },
    ],
  },

  // 8. Cotización al cliente (particular) — _v1 → _v2
  {
    name: 'cotizacion_cliente_v2',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Cotización lista para tu aprobación',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, el técnico {{2}} terminó el diagnóstico de tu {{3}}:\n\n' +
          '🔍 Diagnóstico: {{4}}\n\n' +
          '💰 Mano de obra: {{5}} COP\n' +
          '🔩 Repuestos: {{6}} COP\n' +
          '🧾 Total: {{7}} COP\n\n' +
          'Si apruebas, el técnico procede con la reparación. Todos los pagos se gestionan via Baird Service.',
        example: {
          body_text: [[
            'Juan',
            'Carlos',
            'Nevera LG',
            'Compresor en mal estado, requiere reemplazo',
            '150,000',
            '280,000',
            '430,000',
          ]],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Aprobar cotización',
            url: `${APP_URL}/cotizacion/{{1}}`,
            example: [`${APP_URL}/cotizacion/00000000-0000-0000-0000-000000000000`],
          },
        ],
      },
    ],
  },

  // 9. Cotización aprobada → técnico — _v1 → _v2
  {
    name: 'cotizacion_aprobada_tecnico_v2',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          '✅ Hola {{1}}, el cliente {{2}} aprobó la cotización para {{3}}.\n\n' +
          'Total aprobado: {{4}} COP\n\n' +
          'Procede con la reparación según lo acordado. Cuando termines, abre el portal para subir fotos, checklist y firma del cliente.',
        example: { body_text: [['Carlos', 'Juan Pérez', 'Nevera LG', '430,000']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Abrir portal',
            url: `${APP_URL}/tecnico/{{1}}`,
            example: [`${APP_URL}/tecnico/00000000-0000-0000-0000-000000000000`],
          },
        ],
      },
    ],
  },

  // 10. Confirmar servicio post-completar — _v3 → _v4
  {
    name: 'confirmar_servicio_v4',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Servicio completado — confirma',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, el técnico {{2}} terminó el servicio de tu {{3}}.\n\n' +
          'Por favor confirma si quedaste satisfecho/a o reporta cualquier problema. Tu calificación nos ayuda a mantener la calidad del servicio.',
        example: { body_text: [['Juan', 'Carlos Pérez', 'Lavadora Mabe']] },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Confirmar servicio',
            url: `${APP_URL}/confirmar/{{1}}`,
            example: [`${APP_URL}/confirmar/00000000-0000-0000-0000-000000000000`],
          },
        ],
      },
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

async function main() {
  const args = process.argv.slice(2)

  if (args[0] === '--check') {
    const existing = await listExisting()
    const v2names = new Set(TEMPLATES.map(t => t.name))
    const relevant = existing.filter(e => v2names.has(e.name))
    console.log(`📋 Estado de las ${TEMPLATES.length} templates v_next:\n`)
    for (const t of relevant.sort((a, b) => a.name.localeCompare(b.name))) {
      const icon = t.status === 'APPROVED' ? '✅' : t.status === 'PENDING' ? '⏳' : '❌'
      console.log(`  ${icon} ${t.name.padEnd(45)} ${t.status}`)
    }
    const missing = TEMPLATES.filter(t => !relevant.find(r => r.name === t.name))
    if (missing.length) {
      console.log(`\n⚠️  Aún no subidas: ${missing.map(m => m.name).join(', ')}`)
    }
    return
  }

  const filter = args[0]
  const toUpload = filter ? TEMPLATES.filter(t => t.name === filter) : TEMPLATES

  if (toUpload.length === 0) {
    console.error(`No templates match "${filter}"`)
    process.exit(1)
  }

  console.log(`📤 Uploading ${toUpload.length} template(s) v_next to WABA ${WABA_ID}...`)
  console.log(`   APP_URL = ${APP_URL}\n`)

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
  console.log('   Cuando todas estén APPROVED, actualizar whatsapp.service.ts para llamar los nuevos nombres.')
}

main().catch(err => {
  console.error('Fatal:', err)
  process.exit(1)
})
