// Sondea qué migraciones pendientes ya están aplicadas en producción.
// Usa el anon key (solo lectura, sin escribir nada).
//   node --env-file=.env.local scripts/_verify-migrations.mjs
import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)

// Prueba si una columna existe pidiéndola en un select limitado a 1 fila.
async function col(tabla, columna) {
  const { error } = await sb.from(tabla).select(columna).limit(1)
  if (error) return { ok: false, msg: error.message }
  return { ok: true }
}

const checks = [
  // migración -> [tabla, columna]
  ['20260506_cliente_self_service', 'solicitudes_servicio', 'cliente_token'],
  ['20260506_cliente_self_service', 'solicitudes_servicio', 'reagendamientos_count'],
  ['20260508_fix_cotizacion_column', 'solicitudes_servicio', 'cotizacion'],
  ['20260508_fix_tecnicos_columns', 'tecnicos', 'acepta_garantias'],
  ['20260508_fix_tecnicos_columns', 'tecnicos', 'especialidad_principal'],
  ['20260510_no_show_protocolo', 'solicitudes_servicio', 'evidencia_no_show'],
  ['20260510_no_show_protocolo', 'solicitudes_servicio', 'dias_solucion_efectivos'],
  ['20260513_tracking_ta', 'solicitudes_servicio', 'diagnosticado_at'],
  ['20260513_tracking_ta', 'solicitudes_servicio', 'cumple_ta'],
]

console.log('=== Columnas (pending migrations) ===')
for (const [mig, tabla, columna] of checks) {
  const r = await col(tabla, columna)
  console.log(`${r.ok ? '✅' : '❌'}  ${mig.padEnd(34)} ${tabla}.${columna}${r.ok ? '' : '  → ' + r.msg}`)
}

// Estados nuevos: verifica si hay filas usando estados que solo existen
// tras 20260507 / 20260510. Si el CHECK constraint no los permite, no
// habría filas, pero eso no prueba que falte; solo lo reportamos informativo.
console.log('\n=== Estados en uso ===')
const { data: estados } = await sb
  .from('solicitudes_servicio')
  .select('estado')
  .in('estado', ['pendiente_pricing', 'no_show_cliente', 'reagendamiento_pendiente'])
console.log('Filas con estados nuevos:', estados?.length ?? 0, estados ?? '')
