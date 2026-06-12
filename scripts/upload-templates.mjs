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
  //     garantía. Incluye los datos de gestión del repuesto ante la marca:
  //     No. de garantía, SKU(s) y dirección del cliente. En particular se
  //     mantiene la plantilla genérica de cambio de estado.
  //     {{1}}=nombre supervisor, {{2}}=novedad (Repuesto requerido | Repuesto
  //     entregado al cliente), {{3}}=cliente, {{4}}=equipo, {{5}}=No. garantía,
  //     {{6}}=SKU(s), {{7}}=dirección.
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
          '📋 No. de garantía: {{5}}\n' +
          '📦 SKU: {{6}}\n' +
          '📍 Dirección del cliente: {{7}}\n\n' +
          'Revisa el panel de supervisión para más detalles.',
        example: {
          body_text: [
            ['Andrés', 'Repuesto requerido', 'María Gómez', 'Lavadora Mabe', '9415091231', 'WM-PCB-7421', 'Calle 53 #24-18, Chapinero, Bogotá'],
          ],
        },
      },
      { type: 'FOOTER', text: 'Baird Service — Supervisión' },
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
