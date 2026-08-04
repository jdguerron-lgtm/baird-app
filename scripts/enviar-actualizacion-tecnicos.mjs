// Envía las NOVEDADES de la plataforma a los TÉCNICOS verificados por
// WhatsApp en TEXTO LIBRE (no hay plantilla de actualizaciones para técnicos).
//
// ⚠️ Limitación de Meta: el texto libre solo se entrega si la ventana de 24h
// del técnico está abierta (interactuó con el número del negocio en las
// últimas 24h). Fuera de ventana, la API responde error 131047 (re-engagement)
// — el script lo cuenta y lista para reintentar otro día o migrar a plantilla.
//
// Uso:
//   node --env-file=.env.local scripts/enviar-actualizacion-tecnicos.mjs [--dry]
//
// Editar MENSAJE abajo en cada envío ({nombre} se reemplaza por el primer nombre).
import { createClient } from '@supabase/supabase-js'

const API = 'https://graph.facebook.com/v22.0'
const TOKEN = process.env.WHATSAPP_API_TOKEN
const PHONE_ID = process.env.WHATSAPP_PHONE_ID
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SB_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// ── EDITAR EN CADA ENVÍO ─────────────────────────────────────────────────────
const MENSAJE = (nombre) =>
  `🔧 Hola ${nombre}, actualizamos la plataforma Baird Service. Lo importante para ti:\n\n` +
  `🏷️ *Foto de la placa del producto*: ahora es obligatoria y tiene su propia sección en el formulario de diagnóstico — sin ella no podrás enviarlo.\n\n` +
  `📦 *Repuestos en garantía, más rápido*: al registrar el diagnóstico con repuesto, el pedido le llega de inmediato al supervisor de la marca (ya no hay espera de aprobación ni de "tiempo de entrega"). Te avisaremos cuando el repuesto vaya en camino, con su número de guía, y cuando el cliente agende la visita de finalización.\n\n` +
  `👀 El servicio queda siempre visible en tu portal con su estado: Esperando repuesto → Repuesto en camino → En proceso.\n\n` +
  `Mira la guía con capturas de antes y después:\n` +
  `https://lineablanca.bairdservice.com/guia-actualizacion-2026-08.html`
// ─────────────────────────────────────────────────────────────────────────────

const DRY = process.argv.includes('--dry')

if (!TOKEN || !PHONE_ID) { console.error('Faltan WHATSAPP_API_TOKEN / WHATSAPP_PHONE_ID'); process.exit(1) }
if (!SB_URL || !SB_KEY) { console.error('Faltan NEXT_PUBLIC_SUPABASE_URL / ANON_KEY'); process.exit(1) }

function normalizeCO(raw) {
  let d = String(raw).replace(/\D/g, '')
  if (d.length === 10 && d.startsWith('3')) d = '57' + d
  return d
}

const supabase = createClient(SB_URL, SB_KEY)
const { data: tecs, error } = await supabase
  .from('tecnicos')
  .select('nombre_completo, whatsapp, estado_verificacion')
  .eq('estado_verificacion', 'verificado')
if (error) { console.error('Query tecnicos falló:', error.message); process.exit(1) }
console.log(`Técnicos verificados: ${tecs.length}${DRY ? ' (dry-run)' : ''}\n`)

let ok = 0
const fueraVentana = []
const otrosErrores = []

for (const t of tecs) {
  const to = normalizeCO(t.whatsapp)
  const nombre = String(t.nombre_completo || '').trim().split(/\s+/)[0] || 'técnico'
  if (DRY) { console.log(`[dry] ${t.nombre_completo} → ${to}`); continue }
  const r = await fetch(`${API}/${PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp', recipient_type: 'individual', to,
      type: 'text', text: { preview_url: true, body: MENSAJE(nombre) },
    }),
  })
  const b = await r.json().catch(() => ({}))
  if (!r.ok || b.error) {
    const code = b.error?.code
    if (code === 131047) {
      fueraVentana.push(`${t.nombre_completo} (${to})`)
      console.log(`⏳ ${t.nombre_completo} (${to}): fuera de ventana 24h (131047)`)
    } else {
      otrosErrores.push(`${t.nombre_completo} (${to}): ${JSON.stringify(b.error || b)}`)
      console.error(`❌ ${t.nombre_completo} (${to}):`, JSON.stringify(b.error || b))
    }
  } else {
    ok++
    console.log(`✅ ${t.nombre_completo} (${to}) → ${b.messages?.[0]?.id}`)
  }
  await new Promise(res => setTimeout(res, 400))
}

if (!DRY) {
  console.log(`\nResumen: ${ok} enviados · ${fueraVentana.length} fuera de ventana 24h · ${otrosErrores.length} otros errores`)
  if (fueraVentana.length) console.log('Fuera de ventana (reintentar otro día):\n  ' + fueraVentana.join('\n  '))
}
console.log('Listo.')
