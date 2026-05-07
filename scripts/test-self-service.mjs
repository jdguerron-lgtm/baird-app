/**
 * Smoke test del flujo self-service (cancelar / reagendar) usando solo TU número.
 *
 * Uso:
 *   1. Asegúrate de tener corriendo `npm run dev` en otra terminal con:
 *        BAIRD_TEST_PHONE_WHITELIST=573XXXXXXXXX
 *      (reemplaza por tu celular completo, con código de país, sin +).
 *      De esta forma cualquier WhatsApp dirigido a otro número será omitido.
 *
 *   2. Corre:
 *        node --env-file=.env.local scripts/test-self-service.mjs 573XXXXXXXXX
 *      O define MY_PHONE en .env.local y omite el argumento.
 *
 * El script:
 *   - Crea una solicitud (es_garantia=false) con TU teléfono como cliente.
 *   - Imprime la URL del portal /servicio/{cliente_token}.
 *   - Sigue dos modos según --mode:
 *       cancelar  — cancela la solicitud automáticamente.
 *       reagendar — reagenda automáticamente para mañana 8am-12pm.
 *       interactivo (default) — solo crea la solicitud y te imprime la URL para que pruebes manualmente.
 *
 * Ejemplos:
 *   node --env-file=.env.local scripts/test-self-service.mjs 573000000000
 *   node --env-file=.env.local scripts/test-self-service.mjs 573000000000 --mode=cancelar
 *   node --env-file=.env.local scripts/test-self-service.mjs 573000000000 --mode=reagendar
 */

const argv = process.argv.slice(2)
const phoneArg = argv.find((a) => /^\d+$/.test(a))
const modeArg = argv.find((a) => a.startsWith('--mode='))?.split('=')[1] ?? 'interactivo'
const baseUrlArg = argv.find((a) => a.startsWith('--baseUrl='))?.split('=')[1]

const APP_URL = baseUrlArg || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const MY_PHONE = phoneArg || process.env.MY_PHONE

if (!MY_PHONE) {
  console.error('❌ Falta tu número. Pásalo como primer argumento o define MY_PHONE en .env.local.')
  process.exit(1)
}
if (!/^57\d{10}$/.test(MY_PHONE)) {
  console.warn(`⚠️  ${MY_PHONE} no luce como número colombiano (esperado 57 + 10 dígitos). Continuando igual.`)
}

console.log(`▶ Base URL: ${APP_URL}`)
console.log(`▶ Mi teléfono: ${MY_PHONE}`)
console.log(`▶ Modo: ${modeArg}`)
console.log('')

// 1. Crear solicitud
const phoneFormateado = `57|${MY_PHONE.slice(2)}`

const solicitudPayload = {
  cliente_nombre: 'Juan Test SelfService',
  cliente_telefono: phoneFormateado,
  direccion: 'Calle Test 123',
  ciudad_pueblo: 'Bogotá',
  zona_servicio: 'Chapinero',
  marca_equipo: 'Mabe',
  tipo_equipo: 'Lavadora',
  tipo_solicitud: 'Mantenimiento',
  novedades_equipo: 'Prueba self-service — generada por scripts/test-self-service.mjs',
  es_garantia: false,
  numero_serie_factura: '',
  pago_tecnico: 0, // server lo recalcula
  horario_visita_1: 'Mañana de mañana 8am-12pm',
  horario_visita_2: 'Mañana de mañana 12pm-3pm',
}

console.log('1) Creando solicitud...')
const createRes = await fetch(`${APP_URL}/api/solicitar`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(solicitudPayload),
})
const createData = await createRes.json()
if (!createRes.ok) {
  console.error('❌ Falló /api/solicitar:', createRes.status, createData)
  process.exit(1)
}
console.log('✅ Solicitud creada:', createData.id)
console.log(`   horario_token: ${createData.horario_token}`)
console.log(`   cliente_token: ${createData.cliente_token}`)
console.log(`   whatsapp_enviado: ${createData.whatsapp_enviado}`)
console.log('')

const portalUrl = `${APP_URL}/servicio/${createData.cliente_token}`
console.log(`🔗 Portal cliente: ${portalUrl}`)
console.log('')

if (modeArg === 'interactivo') {
  console.log('Modo interactivo — abre la URL del portal y prueba cancelar/reagendar manualmente.')
  process.exit(0)
}

// Esperamos ~2s para que la solicitud se persista
await new Promise((r) => setTimeout(r, 1500))

if (modeArg === 'cancelar') {
  console.log('2) Cancelando solicitud...')
  const cancelRes = await fetch(`${APP_URL}/api/solicitud/cancelar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: createData.cliente_token,
      motivo: 'Prueba automatizada — cancelación self-service',
    }),
  })
  const cancelData = await cancelRes.json()
  console.log(cancelRes.ok ? '✅' : '❌', 'cancelar status:', cancelRes.status)
  console.log('   ', cancelData)
} else if (modeArg === 'reagendar') {
  const fecha = new Date(Date.now() + 86400000).toISOString().slice(0, 10) // mañana
  const horario = `${new Date(fecha + 'T00:00:00').toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' })} · 8am-12pm`
  console.log(`2) Reagendando a "${horario}"...`)
  const resRes = await fetch(`${APP_URL}/api/solicitud/reagendar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: createData.cliente_token,
      horario,
      motivo: 'Prueba automatizada — reagendamiento',
    }),
  })
  const resData = await resRes.json()
  console.log(resRes.ok ? '✅' : '❌', 'reagendar status:', resRes.status)
  console.log('   ', resData)
} else {
  console.log(`Modo "${modeArg}" desconocido. Usa --mode=cancelar o --mode=reagendar.`)
  process.exit(1)
}

console.log('')
console.log('Listo. Revisa los WhatsApps en tu celular y la solicitud en el panel admin:')
console.log(`  ${APP_URL}/admin/solicitudes/${createData.id}`)
