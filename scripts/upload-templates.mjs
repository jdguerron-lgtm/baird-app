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

import { readFileSync, existsSync, statSync } from 'node:fs'

const WABA_ID = process.env.WABA_ID || '2354953275016882'
const TOKEN = process.env.WHATSAPP_API_TOKEN
const API_BASE = 'https://graph.facebook.com/v22.0'
const APP_URL = 'https://lineablanca.bairdservice.com'

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

  // 5. Repuesto disponible — el cliente elige una NUEVA fecha tentativa.
  //    v2 (2026-05-29): agrega botón URL → /reprogramar-repuesto/{token} y deja
  //    claro que la fecha es tentativa (sujeta a disponibilidad del técnico).
  //    Llamado por: enviarRepuestoRecibidoCliente()
  {
    name: 'repuesto_recibido_cliente_v2',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          '¡Buenas noticias {{1}}! 📦\n\n' +
          'El repuesto para tu {{2}} ya llegó. Para continuar, elige una nueva fecha ' +
          'para la visita del técnico {{3}}.\n\n' +
          '🗓️ La fecha que elijas es *tentativa*: el técnico la confirmará según su ' +
          'disponibilidad y coordinará contigo.',
        example: { body_text: [['María', 'Lavadora LG', 'Pedro Gómez']] },
      },
      { type: 'FOOTER', text: 'Toca el botón para elegir tu nueva fecha' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Elegir nueva fecha',
            url: `${APP_URL}/reprogramar-repuesto/{{1}}`,
            example: [`${APP_URL}/reprogramar-repuesto/00000000-0000-0000-0000-000000000000`],
          },
        ],
      },
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

  // ─────────────────────────────────────────────────────────────────────
  // BACKFILL 2026-05-08 — plantillas que ya estaban aprobadas en Meta
  // pero no estaban registradas como código aquí. Las definiciones reflejan
  // el contrato que ya consume `whatsapp.service.ts` y los endpoints del
  // proyecto. Si Meta tiene una versión ligeramente distinta de body, esta
  // se acepta como nueva versión cuando se sube con el mismo nombre.
  // ─────────────────────────────────────────────────────────────────────

  // 7. Notificar a técnicos garantía — oferta inicial
  // Llamado por: notificarTecnicos() cuando es_garantia=true
  {
    name: 'nueva_solicitud_v3',
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

  // 8. Notificar técnico que llegó tarde a aceptar
  // Llamado por: procesarAceptacion() — perdedores
  {
    name: 'servicio_no_disponible_v3',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, otro técnico aceptó esta solicitud antes que tú. ' +
          'Te avisaremos por WhatsApp cuando llegue una nueva oportunidad en tu zona. ¡Suerte la próxima!',
        example: { body_text: [['Carlos']] },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 9. Confirmar asignación al técnico ganador
  // Llamado por: procesarAceptacion() — ganador
  {
    name: 'servicio_asignado_tecnico_v3',
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

  // 10. Notificar a técnicos particular — oferta inicial
  // Llamado por: notificarTecnicos() cuando es_garantia=false
  {
    name: 'solicitud_particular_tecnico_v1',
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

  // 11. Confirmar al cliente que tiene técnico asignado (particular)
  // Llamado por: procesarAceptacion() cuando es_garantia=false
  {
    name: 'tecnico_asignado_particular_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Tu técnico Baird Service',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, ya tienes técnico asignado:\n\n' +
          '👨‍🔧 Técnico: {{2}}\n' +
          '🔧 Equipo: {{3}}\n' +
          '🕐 Horario: {{4}}\n' +
          '📞 Contacto: {{5}}\n\n' +
          '💰 Tarifa diagnóstico: {{6}} COP\n' +
          '💵 Anticipo (50%): {{7}} COP\n\n' +
          'Tu técnico llegará en el horario acordado. Tras el diagnóstico recibirás la cotización para aprobar antes de cualquier reparación. Nunca pagues en efectivo al técnico — todo se factura via Baird Service.',
        example: {
          body_text: [[
            'Juan',
            'Carlos Pérez',
            'Nevera LG',
            'martes 7 de mayo · 2pm-5pm',
            '+573001234567',
            '80,000',
            '40,000',
          ]],
        },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 12. Cotización al cliente para aprobar (particular)
  // Llamado por: enviarCotizacionCliente() — POST admin pricing
  {
    name: 'cotizacion_cliente_v1',
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

  // 13. Notificar técnico que cliente aprobó cotización (particular)
  // Llamado por: notificarCotizacionAprobada()
  {
    name: 'cotizacion_aprobada_tecnico_v1',
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

  // 13b. Cotización al cliente para aprobar — v3 (2026-07-05).
  //      Reemplaza a cotizacion_cliente_v2: elimina las líneas "Mano de obra"
  //      y "Repuestos" (desde 2026-05-12 se persisten en 0 y el cliente veía
  //      "$0 + $0 = total", que generaba desconfianza) y agrega tiempo
  //      estimado (backlog H). {{1}}=cliente, {{2}}=técnico, {{3}}=equipo,
  //      {{4}}=diagnóstico (200 chars), {{5}}=total, {{6}}=tiempo estimado
  //      (fallback "inmediato tras tu aprobación" cuando no hay repuesto).
  //      ✅ APPROVED y CABLEADA (2026-07-06): enviarCotizacionCliente() envía
  //      v3 con fallback a _v2 si Meta rechaza el envío.
  {
    name: 'cotizacion_cliente_v3',
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
          '🧾 Total: {{5}} COP (incluye repuestos, mano de obra e IVA)\n' +
          '⏱ Inicio de la reparación: {{6}}\n\n' +
          'Si apruebas, el técnico procede con la reparación. Todos los pagos se gestionan via Baird Service.',
        example: {
          body_text: [[
            'Juan',
            'Carlos',
            'Nevera LG',
            'Compresor en mal estado, requiere reemplazo',
            '430,000',
            'inmediato tras tu aprobación',
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

  // 13c. Cliente aprobó cotización → técnico — v3 (2026-07-05).
  //      Reemplaza a cotizacion_aprobada_tecnico_v2, que enviaba en {{4}} el
  //      TOTAL AL CLIENTE (con utilidad Baird + IVA) rotulado "Total aprobado"
  //      — el técnico creía que ese era su pago y luego recibía menos. v3
  //      separa explícitamente su pago del total del cliente.
  //      {{1}}=técnico, {{2}}=cliente, {{3}}=equipo, {{4}}=pago NETO al
  //      técnico (pago_tecnico), {{5}}=total que paga el cliente.
  //      ✅ APPROVED y CABLEADA (2026-07-06): notificarCotizacionAprobada()
  //      envía v3 con fallback a _v2 si Meta rechaza el envío.
  {
    name: 'cotizacion_aprobada_tecnico_v3',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          '✅ Hola {{1}}, el cliente {{2}} aprobó la cotización para {{3}}.\n\n' +
          '💰 Tu pago por este servicio: {{4}} COP\n' +
          '🧾 Total que paga el cliente a Baird: {{5}} COP (incluye IVA y comisión de plataforma)\n\n' +
          'Procede con la reparación según lo acordado. Cuando termines, abre el portal para subir fotos, checklist y firma del cliente.',
        example: { body_text: [['Carlos', 'Juan Pérez', 'Nevera LG', '320,000', '430,000']] },
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

  // 14. Pedir confirmación al cliente tras completar el servicio
  // Llamado por: POST /api/completar-servicio
  {
    name: 'confirmar_servicio_v3',
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

  // 15. Bienvenida al técnico recién registrado
  // Llamado por: notificarRegistroTecnico()
  {
    name: 'registro_bienvenida_v3',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Bienvenido a Baird Service',
      },
      {
        type: 'BODY',
        text:
          '👋 Hola {{1}}, gracias por registrarte como técnico en Baird Service.\n\n' +
          '📍 Ciudad: {{2}}\n' +
          '🔧 Especialidad: {{3}}\n\n' +
          'Tu cuenta está pendiente de verificación por el equipo de Baird Service. ' +
          'Una vez aprobada, comenzarás a recibir solicitudes de servicio en tu zona. ' +
          'Te avisaremos por WhatsApp cuando estés activo/a.',
        example: { body_text: [['Carlos', 'Bogotá', 'Lavadoras']] },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 16. Notificar a un supervisor que un servicio cambió de estado
  // Llamado por: notificarCambioEstado() — para cada supervisor activo cuyo
  // filtro (ambito/marca/estados) matchea la solicitud. Sin botón: informativo.
  {
    name: 'supervisor_cambio_estado_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Actualización de servicio',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, un servicio que supervisas cambió de estado:\n\n' +
          '👤 Cliente: {{2}}\n' +
          '🔧 Equipo: {{3}}\n' +
          '📍 Ciudad: {{4}}\n' +
          '📋 Tipo: {{5}}\n' +
          '🔄 Nuevo estado: {{6}}\n\n' +
          'Revisa el panel de supervisión para más detalles.',
        example: {
          body_text: [['Andrés', 'María Gómez', 'Lavadora Mabe', 'Bogotá', 'Garantía', 'En proceso']],
        },
      },
      { type: 'FOOTER', text: 'Baird Service — Supervisión' },
    ],
  },

  // 17. Repuesto recibido — notificar al TÉCNICO la nueva fecha tentativa.
  //     v1 (2026-05-29): reemplaza el texto libre de notificarTecnicoVisitaReprogramada.
  //     Motivo: entre diagnóstico y llegada del repuesto pasan semanas → la ventana
  //     24h del técnico casi siempre está cerrada → el texto libre fallaba en silencio.
  //     Una plantilla funciona fuera de la ventana. {{1}}=nombre, {{2}}=equipo,
  //     {{3}}=cliente, {{4}}=fecha tentativa; botón URL → /tecnico/{portal_token}.
  //     Llamado por: notificarTecnicoVisitaReprogramada()
  {
    name: 'repuesto_recibido_tecnico_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          '📅 Hola {{1}}, los repuestos para {{2}} ya llegaron y {{3}} eligió una nueva fecha ' +
          'tentativa para la visita:\n\n' +
          '🗓️ *{{4}}*\n\n' +
          'Es una fecha *tentativa*: coordina con el cliente y confírmala según tu ' +
          'disponibilidad. El servicio ya está *en proceso*; puedes completar la reparación ' +
          'cuando coordines. Abre el portal para subir las evidencias.',
        example: {
          body_text: [['Carlos', 'Lavadora Mabe', 'Juan Pérez', 'Martes 3 de junio, 9:00 AM']],
        },
      },
      { type: 'FOOTER', text: 'Baird Service' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Abrir portal',
            url: `${APP_URL}/tecnico/{{1}}`,
            example: [`${APP_URL}/tecnico/abc123def456`],
          },
        ],
      },
    ],
  },

  // 18. Valor del servicio actualizado — notificar al CLIENTE (particular).
  //     v1 (2026-05-30): admin ajusta el valor a pagar desde el detalle de
  //     solicitud (/admin/solicitudes/[id]) y reabre la aprobación. La plantilla
  //     informa el nuevo valor y lleva al cliente a re-aprobar.
  //     {{1}}=nombre, {{2}}=equipo, {{3}}=nuevo valor; botón URL → /cotizacion/{token}.
  //     Llamado por: enviarValorActualizadoCliente()
  {
    name: 'valor_actualizado_cliente_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Actualización de tu cotización',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, el valor de tu servicio de {{2}} se actualizó.\n\n' +
          '💰 Nuevo valor: ${{3}} COP\n\n' +
          'Ingresa para ver el detalle y confirmar tu aprobación. Todos los pagos se gestionan vía Baird Service.',
        example: {
          body_text: [['Juan', 'Nevera LG', '430,000']],
        },
      },
      { type: 'FOOTER', text: 'Baird Service' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Ver y aprobar',
            url: `${APP_URL}/cotizacion/{{1}}`,
            example: [`${APP_URL}/cotizacion/00000000-0000-0000-0000-000000000000`],
          },
        ],
      },
    ],
  },

  // 19. Bienvenida a un nuevo SUPERVISOR.
  //     v1 (2026-05-30): al crear un supervisor (POST /api/admin/supervisores y
  //     activo) se le avisa que ya es supervisor, de qué ámbito/marca, y que
  //     recibirá los cambios de estado por este medio. Sin botón: informativo.
  //     {{1}}=nombre, {{2}}=ámbito descrito (p.ej. "todos los servicios y marcas"
  //     o "los servicios de garantía de la marca MABE").
  //     Llamado por: enviarBienvenidaSupervisor()
  {
    name: 'supervisor_bienvenida_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Bienvenido al equipo de supervisión',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, te damos la bienvenida como supervisor de Baird Service. 🎉\n\n' +
          'A partir de ahora supervisas {{2}}.\n\n' +
          'Te notificaremos por este mismo chat cada cambio de estado de los servicios bajo tu supervisión.',
        example: {
          body_text: [['Andrés', 'todos los servicios y marcas']],
        },
      },
      { type: 'FOOTER', text: 'Baird Service — Supervisión' },
    ],
  },

  // 19b. Acceso al PANEL de supervisor (solo lectura) — link mágico.
  //      {{1}}=nombre supervisor, {{2}}=alcance (describirAmbitoSupervisor).
  //      Botón URL dinámico: APP_URL/supervisor/{{1}} donde {{1}} = portal_token.
  //      Llamado por: enviarAccesoSupervisor()
  {
    name: 'supervisor_acceso_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Tu acceso al panel de supervisión',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}} 👋, este es tu acceso privado al panel de Baird Service.\n\n' +
          'Desde aquí puedes ver, en tiempo real y solo lectura, {{2}}.\n\n' +
          'Toca el botón para entrar. No compartas este enlace: es personal.',
        example: {
          body_text: [['Andrés', 'todos los servicios y marcas']],
        },
      },
      { type: 'FOOTER', text: 'Baird Service — Supervisión' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Entrar al panel',
            url: `${APP_URL}/supervisor/{{1}}`,
            example: [`${APP_URL}/supervisor/abc-123`],
          },
        ],
      },
    ],
  },

  // 19c. Código OTP de acceso al panel de supervisor (entrada de autoservicio
  //      /supervisor: número de WhatsApp → código de 6 dígitos → link al panel).
  //      Categoría AUTHENTICATION: Meta fija el copy del body/footer — solo se
  //      configuran security_recommendation, expiración y el botón COPY_CODE.
  //      Al enviar: body param {{1}} = código y button url param = código.
  //      Llamado por: enviarCodigoSupervisor() (whatsapp.service.ts)
  {
    name: 'supervisor_codigo_v1',
    category: 'AUTHENTICATION',
    language: 'es',
    components: [
      { type: 'BODY', add_security_recommendation: true },
      { type: 'FOOTER', code_expiration_minutes: 10 },
      {
        type: 'BUTTONS',
        buttons: [{ type: 'OTP', otp_type: 'COPY_CODE', text: 'Copiar código' }],
      },
    ],
  },

  // 19d. Novedades / actualizaciones de la plataforma — para SUPERVISORES.
  //      Canal recurrente de mejoras: {{1}}=nombre supervisor, {{2}}=lista de
  //      novedades EN UNA SOLA LÍNEA separadas por " • " (los parámetros de
  //      Meta no aceptan saltos de línea). Botón URL fijo a la Guía del
  //      Supervisor (pública, sin token — compartible).
  //      Llamado por: scripts/enviar-actualizacion-supervisores.mjs
  {
    name: 'supervisor_actualizaciones_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Novedades de Baird Service',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}} 👋, te contamos las mejoras recientes de la plataforma:\n\n' +
          '{{2}}\n\n' +
          'En la Guía del Supervisor está el detalle de cada etapa y etiqueta. Cualquier duda, escríbenos por este chat.',
        example: {
          body_text: [[
            'Andrés',
            'Panel de supervisión en tiempo real • Etiquetas de estado más claras • Nueva Guía del Supervisor',
          ]],
        },
      },
      { type: 'FOOTER', text: 'Baird Service — Supervisión' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Ver la guía',
            url: `${APP_URL}/guia-supervisores.html`,
          },
        ],
      },
    ],
  },

  // 20. Espera de repuesto aprobada — notificar al TÉCNICO (solo GARANTÍA).
  //     v1 (2026-06-12): incluye los datos de gestión del repuesto ante la marca:
  //     No. de garantía (numero_serie_factura), SKU(s) y dirección del cliente
  //     (la marca despacha el repuesto a esa dirección). En particular NO se
  //     envía — el técnico ya recibe cotizacion_aprobada_tecnico_v2.
  //     {{1}}=nombre técnico, {{2}}=equipo, {{3}}=cliente, {{4}}=No. garantía,
  //     {{5}}=SKU(s), {{6}}=dirección.
  //     Llamado por: enviarEsperandoRepuestoTecnico()
  {
    name: 'esperando_repuesto_tecnico_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, quedó aprobada la espera del repuesto para continuar la reparación 📦\n\n' +
          '🔧 Equipo: {{2}}\n' +
          '👤 Cliente: {{3}}\n' +
          '📋 No. de garantía: {{4}}\n' +
          '📦 SKU: {{5}}\n' +
          '📍 Dirección de entrega: {{6}}\n\n' +
          'Te avisaremos por este medio cuando el repuesto sea entregado al cliente.',
        example: {
          body_text: [
            ['Carlos', 'Lavadora Mabe', 'Juan Pérez', '9415091231', 'WM-PCB-7421', 'Calle 53 #24-18, Chapinero, Bogotá'],
          ],
        },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 21. Repuesto entregado al cliente — notificar al TÉCNICO (AMBOS flujos).
  //     v1 (2026-06-12): se dispara cuando admin marca el último repuesto como
  //     recibido (/api/repuesto-recibido), en paralelo al aviso al cliente.
  //     Informativo: la fecha tentativa llega después vía
  //     repuesto_recibido_tecnico_v1 cuando el cliente la elige.
  //     {{1}}=nombre técnico, {{2}}=equipo, {{3}}=cliente.
  //     Llamado por: enviarRepuestoLlegadoTecnico()
  {
    name: 'repuesto_llegado_tecnico_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, el repuesto para la reparación de {{2}} del cliente {{3}} ya fue entregado ✅\n\n' +
          'El cliente está eligiendo una nueva fecha tentativa para la visita. Te avisaremos por ' +
          'este medio cuando la confirme para que coordines y completes la reparación.',
        example: {
          body_text: [['Carlos', 'Lavadora Mabe', 'Juan Pérez']],
        },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 22. Novedad de repuesto en GARANTÍA — notificar a SUPERVISORES.
  //     v1 (2026-06-12): reemplaza a supervisor_cambio_estado_v1 SOLO para las
  //     transiciones a esperando_repuesto / repuesto_recibido de servicios en
  //     garantía. Incluye los datos de gestión del repuesto ante la marca.
  //     En particular se mantiene la plantilla genérica de cambio de estado.
  //     2026-06-16: ampliada de 7 a 9 params — se agregan Modelo y Diagnóstico
  //     del técnico (nunca llegó a subirse a Meta, así que se amplía en sitio).
  //     {{1}}=nombre supervisor, {{2}}=novedad (Repuesto requerido | Repuesto
  //     entregado al cliente), {{3}}=cliente, {{4}}=equipo, {{5}}=modelo,
  //     {{6}}=No. garantía, {{7}}=SKU(s), {{8}}=dirección, {{9}}=diagnóstico.
  //     Llamado por: notificarCambioEstado()
  {
    name: 'supervisor_repuesto_garantia_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Actualización de repuesto',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, novedad de repuesto en un servicio de garantía que supervisas:\n\n' +
          '📌 Novedad: {{2}}\n' +
          '👤 Cliente: {{3}}\n' +
          '🔧 Equipo: {{4}}\n' +
          '🏷️ Modelo: {{5}}\n' +
          '📋 No. de garantía: {{6}}\n' +
          '📦 SKU: {{7}}\n' +
          '📍 Dirección del cliente: {{8}}\n' +
          '🩺 Diagnóstico del técnico: {{9}}\n\n' +
          'Revisa el panel de supervisión para más detalles.',
        example: {
          body_text: [
            ['Andrés', 'Repuesto requerido', 'María Gómez', 'Lavadora Mabe', 'WM-3000-X', '9415091231', 'WM-PCB-7421', 'Calle 53 #24-18, Chapinero, Bogotá', 'Tarjeta de control quemada; no enciende. Requiere reemplazo de la PCB principal.'],
          ],
        },
      },
      { type: 'FOOTER', text: 'Baird Service — Supervisión' },
    ],
  },

  // 24. Reprogramación de FECHA por el admin — notificar a SUPERVISORES.
  //     v1 (2026-06-26): cuando el admin cambia la fecha del servicio desde el
  //     panel (POST /api/admin/reagendar-solicitud), los supervisores con
  //     visibilidad del servicio reciben la nueva fecha. No es un cambio de
  //     estado, así que no la cubre supervisor_cambio_estado_v1. Funciona fuera
  //     de la ventana 24h (los supervisores no chatean con el número).
  //     {{1}}=nombre supervisor, {{2}}=cliente, {{3}}=equipo, {{4}}=ciudad,
  //     {{5}}=tipo (Garantía|Particular), {{6}}=nueva fecha.
  //     Llamado por: notificarReagendamientoSupervisores() en whatsapp.service.
  {
    name: 'supervisor_reagendamiento_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'HEADER',
        format: 'TEXT',
        text: 'Servicio reprogramado',
      },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, se reprogramó la fecha de un servicio que supervisas:\n\n' +
          '👤 Cliente: {{2}}\n' +
          '🔧 Equipo: {{3}}\n' +
          '📍 Ciudad: {{4}}\n' +
          '📋 Tipo: {{5}}\n' +
          '📅 Nueva fecha: {{6}}\n\n' +
          'Es solo para tu visibilidad; no necesitas hacer nada.',
        example: {
          body_text: [['Andrés', 'María Gómez', 'Lavadora Mabe', 'Bogotá', 'Garantía', 'lunes, 6 de julio · 8am-12pm']],
        },
      },
      { type: 'FOOTER', text: 'Baird Service — Supervisión' },
    ],
  },

  // 23. Resumen semanal de operaciones — para SUPERVISORES. Header de DOCUMENTO (PDF).
  //     v1 (2026-06-24): el PDF real se adjunta en el ENVÍO como header.document.link
  //     (URL pública del Storage); acá solo va una MUESTRA para que Meta apruebe —
  //     el `header_handle` se genera al vuelo desde `_sampleDoc` (Resumable Upload API).
  //     Funciona fuera de la ventana 24h (los supervisores no chatean con el número).
  //     {{1}}=nombre supervisor, {{2}}=semana/corte. Sin botón.
  //     Enviar con: scripts/enviar-resumen-supervisores.mjs (solo si está APPROVED).
  {
    name: 'resumen_semanal_supervisores_v1',
    category: 'UTILITY',
    language: 'es',
    _sampleDoc: 'Resumen_Semanal_Baird_2026-06-21.pdf',
    components: [
      { type: 'HEADER', format: 'DOCUMENT' },
      {
        type: 'BODY',
        text:
          'Hola {{1}}, te compartimos el resumen semanal de operaciones de Baird Service correspondiente a {{2}}.\n\n' +
          'Incluye el estado de los servicios activos, los repuestos en espera y las inconsistencias a revisar. Cualquier novedad, quedamos atentos.',
        example: { body_text: [['Andrés', 'la semana del 15 al 21 de junio de 2026']] },
      },
      { type: 'FOOTER', text: 'Baird Service — Supervisión' },
    ],
  },

  // ──────────────────────────────────────────────────────────────────
  // 26–32. Plantillas del ex-"backlog de gaps" (docs/WHATSAPP_TEMPLATES.md).
  // Ya estaban APPROVED en Meta desde antes de registrarse acá (subidas por
  // fuera del script, pre-migración de dominio) — se registran 2026-07-06 con
  // el contenido EXACTO aprobado para que el script vuelva a ser la fuente
  // canónica. ⚠️ Las que llevan botón URL apuntan a baird-app.vercel.app
  // (alias vivo del mismo deployment — funcionan); al re-subirlas algún día,
  // bumpear a _v2 con APP_URL (lineablanca). Cableadas en código 2026-07-06
  // (gaps 1, 3-6, 8, H1). `gestionar_servicio_v1` quedó SIN disparo automático
  // a propósito: horario_confirmado_cliente_v1 ya entrega el mismo botón.
  // ──────────────────────────────────────────────────────────────────

  // 26. Solicitud expirada (sin_agendar) — CLIENTE. Cableada en cron
  //     horario-recordatorio (enviarSolicitudExpiradaCliente). Botón estático.
  {
    name: 'solicitud_expirada_cliente_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, no recibimos la confirmación de horario para tu {{2}} y por eso cerramos la solicitud. ' +
          'Si todavía necesitas el servicio, puedes crear una nueva en cualquier momento.',
        example: { body_text: [['Juan', 'Lavadora Mabe']] },
      },
      { type: 'FOOTER', text: 'Baird Service' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Crear nueva solicitud',
            url: 'https://baird-app.vercel.app/solicitar',
            example: ['https://baird-app.vercel.app/solicitar'],
          },
        ],
      },
    ],
  },

  // 27. Paso aprobado — CLIENTE. Cableada en /api/verificar-paso para
  //     `reparar` y `negativa_cliente` (enviarPasoAprobadoCliente).
  //     {{1}}=nombre, {{2}}=equipo, {{3}}=acción, {{4}}=detalle.
  {
    name: 'paso_aprobado_cliente_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          '✅ Hola {{1}}, registramos tu aprobación para tu {{2}}.\n\n' +
          'Acción: {{3}}\n\n' +
          'Detalle: {{4}}\n\n' +
          'Gracias por confiar en Baird Service. Quedamos atentos a cualquier inquietud por este mismo canal.',
        example: {
          body_text: [['Juan', 'Lavadora Mabe', 'Proceder con la reparación', 'El técnico Carlos procederá según lo acordado. Te avisaremos al completar el servicio.']],
        },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 28. Paso rechazado — CLIENTE. Cableada en /api/verificar-paso rama
  //     'rechazado' (enviarPasoRechazadoCliente). {{1}}=nombre, {{2}}=equipo.
  {
    name: 'paso_rechazado_cliente_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, registramos tu rechazo del siguiente paso propuesto para tu {{2}}.\n\n' +
          'El equipo de Baird Service se pondrá en contacto contigo en las próximas horas para resolver la situación. Mientras tanto, no realices ningún pago al técnico.',
        example: { body_text: [['Juan', 'Lavadora Mabe']] },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 29. Decisión del cliente sobre el paso — TÉCNICO. Cableada en
  //     /api/verificar-paso (enviarPasoResueltoTecnico). {{1}}=técnico,
  //     {{2}}=cliente, {{3}}=decisión (APROBÓ|RECHAZÓ), {{4}}=equipo,
  //     {{5}}=detalle. Botón → /tecnico/{portal_token}.
  {
    name: 'paso_resuelto_tecnico_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, recibimos la respuesta del cliente {{2}} sobre el siguiente paso propuesto para {{4}}.\n\n' +
          'Decisión del cliente: {{3}}\n\n' +
          'Detalle adicional para tu seguimiento del servicio: {{5}}\n\n' +
          'Si tienes dudas o necesitas apoyo del equipo Baird, contáctanos por este chat antes de proceder.',
        example: {
          body_text: [['Carlos', 'Juan Pérez', 'APROBÓ', 'Lavadora Mabe', 'Procede según lo acordado. Si llegas a sospechar algo, contacta a Baird Service antes de actuar.']],
        },
      },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Abrir portal',
            url: 'https://baird-app.vercel.app/tecnico/{{1}}',
            example: ['https://baird-app.vercel.app/tecnico/00000000-0000-0000-0000-000000000000'],
          },
        ],
      },
    ],
  },

  // 30. Link permanente de gestión — CLIENTE. APROBADA pero SIN disparo
  //     automático (el botón de horario_confirmado_cliente_v1 ya entrega el
  //     mismo link — enviarla además sería redundante). Disponible para
  //     reenvíos manuales. Botón → /servicio/{cliente_token}.
  {
    name: 'gestionar_servicio_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}}, este es tu enlace permanente para gestionar el servicio de tu {{2}}.\n\n' +
          '🔧 Desde acá puedes cancelar o cambiar la fecha en cualquier momento mientras el técnico no haya completado el servicio.',
        example: { body_text: [['Juan', 'Lavadora Mabe']] },
      },
      { type: 'FOOTER', text: 'Baird Service' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Gestionar servicio',
            url: 'https://baird-app.vercel.app/servicio/{{1}}',
            example: ['https://baird-app.vercel.app/servicio/00000000-0000-0000-0000-000000000000'],
          },
        ],
      },
    ],
  },

  // 31. Cliente confirmó satisfacción — TÉCNICO. Cableada en
  //     confirmarServicioCliente (enviarServicioConfirmadoTecnico).
  //     {{1}}=técnico, {{2}}=cliente, {{3}}=equipo, {{4}}=calificación.
  {
    name: 'servicio_confirmado_tecnico_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          '✅ Hola {{1}}, el cliente {{2}} confirmó satisfacción del servicio de {{3}}. Calificación: {{4}}/10.\n\n' +
          'Servicio cerrado exitosamente. Próxima liquidación te llegará en el ciclo correspondiente.',
        example: { body_text: [['Carlos', 'Juan Pérez', 'Lavadora Mabe', '10']] },
      },
      { type: 'FOOTER', text: 'Baird Service' },
    ],
  },

  // 32. Horario confirmado — CLIENTE. Cableada en confirmarHorarioSolicitud
  //     (enviarHorarioConfirmadoCliente). {{1}}=nombre, {{2}}=equipo,
  //     {{3}}=horario. Botón → /servicio/{cliente_token} (cubre también el
  //     acceso permanente al portal de gestión).
  {
    name: 'horario_confirmado_cliente_v1',
    category: 'UTILITY',
    language: 'es',
    components: [
      {
        type: 'BODY',
        text:
          'Hola {{1}} 👋, confirmamos que tu servicio de {{2}} quedó agendado para {{3}}.\n\n' +
          'Estamos contactando a los técnicos verificados de tu zona. Te avisaremos por este mismo chat tan pronto uno acepte la solicitud. Si necesitas cancelar o cambiar la fecha, usa el botón de abajo.',
        example: { body_text: [['Juan', 'Lavadora Mabe', 'lunes 12 de mayo · 8am-12pm']] },
      },
      { type: 'FOOTER', text: 'Baird Service' },
      {
        type: 'BUTTONS',
        buttons: [
          {
            type: 'URL',
            text: 'Gestionar servicio',
            url: 'https://baird-app.vercel.app/servicio/{{1}}',
            example: ['https://baird-app.vercel.app/servicio/00000000-0000-0000-0000-000000000000'],
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

let _appIdCache = null
async function getAppId() {
  if (_appIdCache) return _appIdCache
  if (process.env.WHATSAPP_APP_ID) return (_appIdCache = process.env.WHATSAPP_APP_ID)
  const r = await fetch(`${API_BASE}/debug_token?input_token=${encodeURIComponent(TOKEN)}&access_token=${encodeURIComponent(TOKEN)}`)
  const b = await r.json()
  if (!b?.data?.app_id) throw new Error('No pude obtener app_id via debug_token: ' + JSON.stringify(b))
  return (_appIdCache = b.data.app_id)
}

// Resumable Upload API: sube un archivo de muestra y devuelve el header_handle
// que exige Meta para aprobar plantillas con header de DOCUMENTO.
async function getHeaderHandle(sampleFile) {
  if (!existsSync(sampleFile)) throw new Error('Falta archivo de muestra: ' + sampleFile)
  const appId = await getAppId()
  const buf = readFileSync(sampleFile)
  const size = statSync(sampleFile).size
  const cs = await fetch(`${API_BASE}/${appId}/uploads?file_name=muestra.pdf&file_length=${size}&file_type=application%2Fpdf&access_token=${encodeURIComponent(TOKEN)}`, { method: 'POST' })
  const csb = await cs.json()
  if (!cs.ok || !csb.id) throw new Error('Crear sesión de subida falló: ' + JSON.stringify(csb))
  const up = await fetch(`${API_BASE}/${csb.id}`, { method: 'POST', headers: { Authorization: `OAuth ${TOKEN}`, file_offset: '0' }, body: buf })
  const upb = await up.json()
  if (!up.ok || !upb.h) throw new Error('Subir muestra falló: ' + JSON.stringify(upb))
  return upb.h
}

async function uploadOne(tpl) {
  // Header de documento: generar un header_handle fresco desde el archivo de muestra.
  let payload = tpl
  if (tpl._sampleDoc) {
    const handle = await getHeaderHandle(tpl._sampleDoc)
    payload = JSON.parse(JSON.stringify(tpl))
    delete payload._sampleDoc
    const header = payload.components.find(c => c.type === 'HEADER')
    if (header) header.example = { header_handle: [handle] }
  }
  const res = await fetch(`${API_BASE}/${WABA_ID}/message_templates`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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
