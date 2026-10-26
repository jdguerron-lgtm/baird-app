#!/usr/bin/env node
// scripts/e2e/flujos.mjs — pruebas end-to-end de los flujos críticos contra baird-staging.
//
// Recorre por la API real (la misma que usa la UI) los flujos completos y verifica en la base,
// paso a paso, el estado resultante. Cada corrida crea sus propios datos (un técnico y un cliente
// de prueba en una ciudad ficticia, para que nadie más reciba la oferta) y los borra al final.
//
//   A. Particular · reparar:           solicitar → aceptar → diagnóstico → aprobar cotización → completar → confirmar
//   B. Particular · esperar repuesto:  solicitar → aceptar → diagnóstico → precios admin → aprobar → completar → confirmar
//   C. Garantía · reparar:             solicitar → aceptar → diagnóstico → verificar paso → completar → confirmar
//   D. Seguridad:                      token falso, portal falso, admin sin token, doble confirmación
//
// Uso (con la app corriendo contra staging, ver scripts/e2e/preparar-env-staging.mjs):
//   node --env-file=.env.local scripts/e2e/flujos.mjs [--base=http://localhost:3100] [--solo=A,C] [--json] [--conservar]
//
// Guardas: se niega si la base de datos no es baird-staging o si la URL apunta al dominio de producción.
// WhatsApp: la whitelist del servidor bloquea todo envío; por eso la oferta queda en 'error' y la prueba
// la reabre (como si el mensaje hubiera llegado) antes de aceptar.

import { createClient } from '@supabase/supabase-js'
import crypto from 'node:crypto'

const STAGING_REF = 'etsbzxnthpmyvuodrmrh'
const PROD_HOSTS = ['lineablanca.bairdservice.com', 'baird-app.vercel.app']
const E2E_ADMIN = 'e2e-admin@baird-staging.test'

const args = new Map(process.argv.slice(2).map(a => { const [k, v] = a.replace(/^--/, '').split('='); return [k, v ?? true] }))
const BASE = String(args.get('base') ?? 'http://localhost:3100').replace(/\/$/, '')
const SOLO = args.get('solo') ? String(args.get('solo')).split(',') : ['A', 'B', 'C', 'D']
const JSON_OUT = Boolean(args.get('json'))
const CONSERVAR = Boolean(args.get('conservar'))
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET

const abortar = (m) => { console.error(`❌  ${m}`); process.exit(2) }
const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
if (!sbUrl.includes(STAGING_REF)) abortar(`La base no es baird-staging (${STAGING_REF}). NEXT_PUBLIC_SUPABASE_URL=${sbUrl}`)
if (PROD_HOSTS.some(h => BASE.includes(h))) abortar(`BASE apunta a producción (${BASE}). Me niego.`)
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) abortar('Falta SUPABASE_SERVICE_ROLE_KEY (de staging).')

const db = createClient(sbUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(sbUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })

// ── Utilidades ───────────────────────────────────────────────────────────────
const resultados = []
let flujoActual = ''
async function paso(nombre, fn) {
  const t0 = Date.now()
  try {
    const detalle = await fn()
    resultados.push({ flujo: flujoActual, paso: nombre, ok: true, ms: Date.now() - t0, detalle: detalle ?? '' })
    return true
  } catch (e) {
    resultados.push({ flujo: flujoActual, paso: nombre, ok: false, ms: Date.now() - t0, detalle: e?.message ?? String(e) })
    return false
  }
}
function esperar(cond, msg) { if (!cond) throw new Error(msg) }

async function api(path, body, { metodo = 'POST', bearer } = {}) {
  const headers = { 'content-type': 'application/json' }
  if (bearer) headers.authorization = `Bearer ${bearer}`
  if (BYPASS) headers['x-vercel-protection-bypass'] = BYPASS
  const r = await fetch(BASE + path, { method: metodo, headers, body: body ? JSON.stringify(body) : undefined })
  let json = null
  try { json = await r.json() } catch { /* sin cuerpo JSON */ }
  return { status: r.status, json }
}

async function fila(tabla, filtros, cols = '*') {
  let q = db.from(tabla).select(cols)
  for (const [k, v] of Object.entries(filtros)) q = q.eq(k, v)
  const { data, error } = await q.maybeSingle()
  if (error) throw new Error(`${tabla}: ${error.message}`)
  return data
}
async function estadoDe(id) { return (await fila('solicitudes_servicio', { id }, 'estado'))?.estado }

// Horario válido y determinista: día hábil (lun–vie, no festivo) entre 20 y 60 días adelante.
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const FRANJAS = ['8am-12pm', '12pm-3pm', '3pm-6pm']
function horarioHabil(desplazamiento = 0) {
  const d = new Date(Date.now() + (20 + crypto.randomInt(0, 40) + desplazamiento) * 86_400_000)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} · ${FRANJAS[crypto.randomInt(0, FRANJAS.length)]}`
}

const sufijo = crypto.randomBytes(3).toString('hex')
const CIUDAD = `E2E Ciudad ${sufijo}`
const FOTO = `${sbUrl}/storage/v1/object/public/evidencias-servicio/e2e/placa-${sufijo}.jpg`
const creadas = { solicitudes: [], tecnicoId: null }

// ── Fixtures ────────────────────────────────────────────────────────────────
async function crearTecnico() {
  const { data, error } = await db.from('tecnicos').insert({
    nombre_completo: `Técnico E2E ${sufijo}`,
    whatsapp: `573000${crypto.randomInt(100000, 999999)}`,
    ciudad_pueblo: CIUDAD,
    ciudades_cobertura: [CIUDAD],
    especialidad_principal: 'Neveras y Nevecones',
    estado_verificacion: 'verificado',
    acepta_garantias: true,
    // true: así lo lista /api/tecnicos-disponibles y la guarda canario puede comprobar que la
    // app bajo prueba lee ESTA base. La ciudad es ficticia: en staging no lo ve nadie más.
    visible_para_cliente: true,
  }).select('id, portal_token').single()
  if (error) throw new Error(`crear técnico: ${error.message}`)
  const { error: e2 } = await db.from('especialidades_tecnico').insert({ tecnico_id: data.id, especialidad: 'Neveras y Nevecones' })
  if (e2) throw new Error(`crear especialidad: ${e2.message}`)
  creadas.tecnicoId = data.id
  return data
}

// Guarda canario: el técnico recién creado en baird-staging debe aparecer en la app bajo prueba.
// Si no aparece, la app está leyendo OTRA base (p.ej. una preview que sigue conectada a producción)
// y no se debe correr nada contra ella.
async function canarioStaging() {
  const url = `${BASE}/api/tecnicos-disponibles?ciudad=${encodeURIComponent(CIUDAD)}&tipo_equipo=Nevera`
  const r = await fetch(url, { headers: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {} })
  const j = await r.json().catch(() => null)
  const visto = Array.isArray(j?.tecnicos) && j.tecnicos.some(t => t.id === creadas.tecnicoId)
  if (!visto) throw new Error(`la app no lista el técnico canario (status ${r.status}, ${j?.tecnicos?.length ?? '?'} técnicos)`)
  return 'la app lee baird-staging'
}

async function tokenAdmin() {
  // Crea (o reusa) la cuenta admin de pruebas y le pone una clave nueva en cada corrida.
  const clave = crypto.randomBytes(24).toString('base64url')
  const { data: lista } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  const existente = lista?.users?.find(u => u.email === E2E_ADMIN)
  if (existente) {
    const { error } = await db.auth.admin.updateUserById(existente.id, { password: clave, email_confirm: true })
    if (error) throw new Error(`actualizar admin e2e: ${error.message}`)
  } else {
    const { error } = await db.auth.admin.createUser({ email: E2E_ADMIN, password: clave, email_confirm: true })
    if (error) throw new Error(`crear admin e2e: ${error.message}`)
  }
  const { data, error } = await anon.auth.signInWithPassword({ email: E2E_ADMIN, password: clave })
  if (error || !data.session) throw new Error(`login admin e2e: ${error?.message}`)
  return data.session.access_token
}

// ── Pasos reutilizables ─────────────────────────────────────────────────────
async function solicitar({ esGarantia, tipoSolicitud = 'Reparación' }) {
  const telefono = `3000${crypto.randomInt(100000, 999999)}`
  const { status, json } = await api('/api/solicitar', {
    cliente_nombre: `Cliente E2E ${sufijo}`,
    cliente_telefono: telefono,
    cliente_cedula: esGarantia ? '' : `10${crypto.randomInt(10000000, 99999999)}`,
    direccion: 'Calle 1 # 2-3 (prueba e2e)',
    ciudad_pueblo: CIUDAD,
    zona_servicio: 'Norte',
    marca_equipo: 'Mabe',
    tipo_equipo: 'Nevera',
    tipo_solicitud: tipoSolicitud,
    novedades_equipo: 'Prueba automatizada e2e: la nevera no enfría y hace ruido.',
    es_garantia: esGarantia,
    numero_serie_factura: esGarantia ? `E2E-${sufijo}` : '',
    pago_tecnico: 0,
    horario_visita_1: horarioHabil(),
    horario_visita_2: horarioHabil(3),
  })
  esperar(status === 200 && json?.success, `status ${status} ${JSON.stringify(json)?.slice(0, 200)}`)
  creadas.solicitudes.push(json.id)
  esperar(json.agendado === true, `no auto-agendó: ${JSON.stringify(json).slice(0, 200)}`)
  const est = await estadoDe(json.id)
  esperar(est === 'notificada', `estado=${est}, esperado notificada`)
  return json.id
}

async function aceptar(solicitudId) {
  const notif = await fila('notificaciones_whatsapp', { solicitud_id: solicitudId, tecnico_id: creadas.tecnicoId }, 'id, token, estado')
  esperar(notif, 'la oferta no llegó al técnico de prueba (sin fila en notificaciones_whatsapp)')
  // La whitelist bloqueó el WhatsApp → la fila queda en 'error'. Reabrirla simula la entrega real.
  if (notif.estado !== 'enviado') {
    const { error } = await db.from('notificaciones_whatsapp').update({ estado: 'enviado', enviado_at: new Date().toISOString() }).eq('id', notif.id)
    if (error) throw new Error(`reabrir oferta: ${error.message}`)
  }
  const { status, json } = await api('/api/whatsapp/accept', { token: notif.token })
  esperar(status === 200 && json?.ganado === true, `accept: ${status} ${JSON.stringify(json)}`)
  const s = await fila('solicitudes_servicio', { id: solicitudId }, 'estado, tecnico_asignado_id')
  esperar(s.estado === 'asignada' && s.tecnico_asignado_id === creadas.tecnicoId, `estado=${s.estado}, técnico=${s.tecnico_asignado_id}`)
  return `oferta ${notif.estado === 'enviado' ? 'entregada' : 'reabierta tras whitelist'}`
}

async function portalToken() {
  return (await fila('tecnicos', { id: creadas.tecnicoId }, 'portal_token')).portal_token
}

function cuerpoDiagnostico(solicitudId, portal, extra) {
  return {
    solicitudId, portalToken: portal,
    diagnostico: 'Prueba e2e: compresor con falla de arranque.',
    complejidad: 'media',
    oathFirma: 'Técnico E2E', oathFirmadoAt: new Date().toISOString(),
    fotoPlacaUrl: FOTO,
    productosNecesarios: [], productosRecomendados: [], evidenciaUrls: [FOTO],
    ...extra,
  }
}

async function completarYConfirmar(solicitudId, portal, estadoPrevio) {
  await paso('completar (evidencia + confirmación pendiente)', async () => {
    // Replica lo que hace /tecnico/[token]/completar/[id] en el navegador antes de llamar la API.
    const { error } = await db.from('evidencias_servicio').update({
      fotos: [FOTO], firma_url: FOTO, completado_at: new Date().toISOString(),
      checklist: { diagnostico_realizado: true, pieza_reemplazada: true, prueba_encendido: true, prueba_ciclo_completo: true, limpieza_area: true, explicacion_cliente: true },
    }).eq('solicitud_id', solicitudId)
    if (error) throw new Error(`evidencia: ${error.message}`)
    const { error: e2 } = await db.from('solicitudes_servicio').update({ estado: 'confirmacion_pendiente' }).eq('id', solicitudId)
    if (e2) throw new Error(`estado: ${e2.message}`)
    const { status, json } = await api('/api/completar-servicio', { solicitudId, portalToken: portal, estadoPrevio })
    esperar(status === 200 && json?.success, `completar: ${status} ${JSON.stringify(json)}`)
    return json.whatsapp_filtered ? 'WhatsApp al cliente bloqueado por whitelist (esperado)' : `whatsapp_sent=${json.whatsapp_sent}`
  })
  await paso('cliente confirma → completada', async () => {
    const ev = await fila('evidencias_servicio', { solicitud_id: solicitudId }, 'confirmacion_token')
    esperar(ev?.confirmacion_token, 'sin confirmacion_token')
    const { status, json } = await api('/api/confirmar-servicio', { confirmacionToken: ev.confirmacion_token, confirmado: true, comentario: 'Calificacion: 10/10 prueba e2e' })
    esperar(status === 200 && json?.success, `confirmar: ${status} ${JSON.stringify(json)}`)
    const est = await estadoDe(solicitudId)
    esperar(est === 'completada', `estado=${est}`)
    return 'completada'
  })
  await paso('historial de estados registrado', async () => {
    const { count } = await db.from('solicitud_eventos').select('id', { count: 'exact', head: true }).eq('solicitud_id', solicitudId)
    esperar(count >= 4, `solo ${count} eventos`)
    return `${count} eventos`
  })
}

// ── Flujos ──────────────────────────────────────────────────────────────────
async function flujoA() {
  flujoActual = 'A · Particular reparar'
  let id, portal, tokenCot
  if (!await paso('solicitar (auto-agenda y oferta)', async () => { id = await solicitar({ esGarantia: false }); return id })) return
  if (!await paso('técnico acepta', () => aceptar(id))) return
  portal = await portalToken()
  if (!await paso('diagnóstico reparar → cotización enviada', async () => {
    const { status, json } = await api('/api/diagnostico', cuerpoDiagnostico(id, portal, { siguientePaso: 'reparar', costoTecnico: 100000 }))
    esperar(status === 200 && json?.success && json.flow === 'particular', `diagnóstico: ${status} ${JSON.stringify(json)}`)
    esperar(json.estado === 'cotizacion_enviada', `estado=${json.estado}`)
    tokenCot = json.cotizacionToken
    esperar(tokenCot, 'sin cotizacionToken')
    return `total cliente $${json.totalCliente} · pago técnico $${json.pagoTecnico}`
  })) return
  if (!await paso('cliente aprueba cotización → en proceso', async () => {
    const { status, json } = await api('/api/aprobar-cotizacion', { token: tokenCot, aprobado: true })
    esperar(status === 200 && json?.success && json.estado === 'en_proceso', `aprobar: ${status} ${JSON.stringify(json)}`)
    return json.estado
  })) return
  await completarYConfirmar(id, portal, 'en_proceso')
}

async function flujoB(adminToken) {
  flujoActual = 'B · Particular repuesto + precios admin'
  let id, portal, tokenCot
  if (!await paso('solicitar', async () => { id = await solicitar({ esGarantia: false }); return id })) return
  if (!await paso('técnico acepta', () => aceptar(id))) return
  portal = await portalToken()
  if (!await paso('diagnóstico esperar repuesto → pendiente de precios', async () => {
    const { status, json } = await api('/api/diagnostico', cuerpoDiagnostico(id, portal, {
      siguientePaso: 'esperar_repuesto', costoTecnico: 80000,
      productosNecesarios: [{ sku: `e2e${sufijo}`, descripcion: 'Relé de arranque (prueba e2e)', cantidad: 1 }],
    }))
    esperar(status === 200 && json?.estado === 'pendiente_pricing', `diagnóstico: ${status} ${JSON.stringify(json)}`)
    const { count } = await db.from('repuestos_pendientes').select('id', { count: 'exact', head: true }).eq('solicitud_id', id)
    esperar(count === 1, `repuestos_pendientes=${count}`)
    return 'pendiente_pricing + 1 repuesto'
  })) return
  if (!await paso('admin fija precios → cotización enviada', async () => {
    const { status, json } = await api('/api/cotizacion-precios', {
      solicitudId: id, manoObra: 80000, tiempoEntrega: '3-5 días hábiles',
      productosPrecios: [{ sku: `E2E${sufijo}`.toUpperCase(), precio_unitario: 50000 }],
    }, { bearer: adminToken })
    esperar(status === 200 && json?.success, `precios: ${status} ${JSON.stringify(json)}`)
    const s = await fila('solicitudes_servicio', { id }, 'estado, cotizacion')
    esperar(s.estado === 'cotizacion_enviada', `estado=${s.estado}`)
    tokenCot = s.cotizacion?.token
    esperar(tokenCot, 'sin cotizacion.token')
    return `total cliente $${json.total_cliente}`
  })) return
  if (!await paso('cliente aprueba → esperando repuesto', async () => {
    const { status, json } = await api('/api/aprobar-cotizacion', { token: tokenCot, aprobado: true })
    esperar(status === 200 && json?.estado === 'esperando_repuesto', `aprobar: ${status} ${JSON.stringify(json)}`)
    return json.estado
  })) return
  await completarYConfirmar(id, portal, 'esperando_repuesto')
  await paso('repuestos cerrados al completar', async () => {
    const { data } = await db.from('repuestos_pendientes').select('estado').eq('solicitud_id', id)
    esperar(data?.length && data.every(r => r.estado !== 'pendiente'), `estados=${JSON.stringify(data)}`)
    return data.map(r => r.estado).join(',')
  })
}

async function flujoC() {
  flujoActual = 'C · Garantía reparar'
  let id, portal, tokenVer
  if (!await paso('solicitar garantía', async () => { id = await solicitar({ esGarantia: true }); return id })) return
  if (!await paso('técnico acepta', () => aceptar(id))) return
  portal = await portalToken()
  if (!await paso('diagnóstico garantía → aprobación de paso pendiente', async () => {
    const { status, json } = await api('/api/diagnostico', cuerpoDiagnostico(id, portal, {
      siguientePaso: 'reparar', codigoComplejidad: 'B', tarifaManoObra: 50000, bonoIncentivo: 10000, totalServicio: 60000, diasTranscurridos: 0,
    }))
    esperar(status === 200 && json?.flow === 'garantia' && json.estado === 'aprobacion_paso_pendiente', `diagnóstico: ${status} ${JSON.stringify(json)}`)
    tokenVer = json.verificacion_paso_token
    esperar(tokenVer, 'sin verificacion_paso_token')
    return json.estado
  })) return
  if (!await paso('cliente aprueba el paso → en proceso', async () => {
    const { status, json } = await api('/api/verificar-paso', { token: tokenVer, decision: 'aprobado' })
    esperar(status === 200 && json?.estado === 'en_proceso', `verificar: ${status} ${JSON.stringify(json)}`)
    return json.estado
  })) return
  await completarYConfirmar(id, portal, 'en_proceso')
}

async function flujoD() {
  flujoActual = 'D · Seguridad'
  await paso('aceptar con token inexistente → no gana', async () => {
    const { status, json } = await api('/api/whatsapp/accept', { token: crypto.randomUUID() })
    esperar(status === 200 && json?.ganado === false, `${status} ${JSON.stringify(json)}`)
    return 'ganado=false'
  })
  await paso('diagnóstico con portal falso → 401', async () => {
    const { status } = await api('/api/diagnostico', cuerpoDiagnostico(crypto.randomUUID(), crypto.randomUUID(), { siguientePaso: 'reparar', costoTecnico: 1 }))
    esperar(status === 401, `status ${status}`)
    return '401'
  })
  await paso('precios admin sin token → 401', async () => {
    const { status } = await api('/api/cotizacion-precios', { solicitudId: crypto.randomUUID(), manoObra: 1, tiempoEntrega: 'x' })
    esperar(status === 401, `status ${status}`)
    return '401'
  })
  await paso('cron sin secreto → 401', async () => {
    const { status } = await api('/api/cron/oferta-escalonada', null, { metodo: 'GET' })
    esperar(status === 401, `status ${status}`)
    return '401'
  })
  await paso('confirmar dos veces el mismo servicio → rechazado', async () => {
    const id = creadas.solicitudes[0]
    // Necesita un servicio ya confirmado por A, B o C en esta misma corrida.
    if (!id) return 'omitido (corre junto con A, B o C)'
    const ev = await fila('evidencias_servicio', { solicitud_id: id }, 'confirmacion_token')
    const { status } = await api('/api/confirmar-servicio', { confirmacionToken: ev.confirmacion_token, confirmado: true })
    esperar(status === 400, `status ${status}`)
    return '400'
  })
}

// ── Limpieza ────────────────────────────────────────────────────────────────
async function limpiar() {
  if (CONSERVAR) return 'conservado (--conservar)'
  if (creadas.solicitudes.length) {
    const { error } = await db.from('solicitudes_servicio').delete().in('id', creadas.solicitudes)
    if (error) throw new Error(`borrar solicitudes: ${error.message}`)
  }
  if (creadas.tecnicoId) {
    const { error } = await db.from('tecnicos').delete().eq('id', creadas.tecnicoId)
    if (error) throw new Error(`borrar técnico: ${error.message}`)
  }
  return `${creadas.solicitudes.length} solicitudes y ${creadas.tecnicoId ? 1 : 0} técnico(s) borrados (cascada)`
}

// ── Main ────────────────────────────────────────────────────────────────────
const t0 = Date.now()
flujoActual = 'Preparación'
let admin = null
const okPrep = await paso('app responde (/api/health)', async () => {
  const r = await fetch(`${BASE}/api/health`, { redirect: 'manual', headers: BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {} })
  const cuerpo = await r.text()
  // Exigir el JSON de la app: una preview protegida responde 302 / HTML de login con status 200.
  esperar(r.status === 200 && cuerpo.includes('"healthy"'),
    `status ${r.status}${r.status === 302 || r.status === 401 ? ' (preview protegida: falta VERCEL_AUTOMATION_BYPASS_SECRET)' : ''} · ${cuerpo.slice(0, 60)}`)
  return cuerpo.slice(0, 60)
}) && await paso('técnico de prueba en ciudad ficticia', async () => { const t = await crearTecnico(); return `${t.id} · ${CIUDAD}` })

// Si la guarda canario falla, se limpia el técnico y se aborta sin tocar la app bajo prueba.
if (okPrep && !await paso('canario: la app bajo prueba usa baird-staging', canarioStaging)) {
  flujoActual = 'Limpieza'
  await paso('borrar datos de la corrida', limpiar)
  console.error('❌  La app bajo prueba no está conectada a baird-staging: no corro nada')
  for (const r of resultados) console.error(`  ${r.ok ? '✅' : '❌'}  ${r.paso}  ${r.detalle}`)
  process.exit(2)
}
const okAdmin = okPrep && (!SOLO.includes('B') || await paso('cuenta admin de pruebas', async () => { admin = await tokenAdmin(); return E2E_ADMIN }))

if (okAdmin) {
  if (SOLO.includes('A')) await flujoA()
  if (SOLO.includes('B')) await flujoB(admin)
  if (SOLO.includes('C')) await flujoC()
  if (SOLO.includes('D')) await flujoD()
}
flujoActual = 'Limpieza'
await paso('borrar datos de la corrida', limpiar)

const fallos = resultados.filter(r => !r.ok)
if (JSON_OUT) {
  console.log(JSON.stringify({ base: BASE, staging: STAGING_REF, ms: Date.now() - t0, ok: fallos.length === 0, resultados }, null, 2))
} else {
  console.log(`E2E · ${BASE} → ${STAGING_REF} · ${new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' })}`)
  let ultimo = ''
  for (const r of resultados) {
    if (r.flujo !== ultimo) { console.log(`\n${r.flujo}`); ultimo = r.flujo }
    console.log(`  ${r.ok ? '✅' : '❌'}  ${r.paso.padEnd(52)} ${String(r.ms).padStart(6)} ms  ${String(r.detalle).slice(0, 140)}`)
  }
  console.log(fallos.length === 0 ? `\n✅  ${resultados.length}/${resultados.length} pasos OK en ${((Date.now() - t0) / 1000).toFixed(1)} s` : `\n❌  ${fallos.length} de ${resultados.length} pasos fallaron`)
}
process.exit(fallos.length === 0 ? 0 : 1)
