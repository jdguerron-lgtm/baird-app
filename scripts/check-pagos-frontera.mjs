#!/usr/bin/env node
/**
 * Guard de la FRONTERA DEL MÓDULO DE PAGOS (2026-10-11).
 *
 * Plan: docs/mejoras-futuras/pagos-aislamiento/README.md § 6. Una vez que el
 * recaudo funciona, estos archivos no se tocan "si no es estrictamente
 * necesario". Este script hace visible y consciente cualquier cambio:
 *
 *   - Corre dentro de `npm run lint`. Si hay cambios (staged o sin stage)
 *     respecto a HEAD en un archivo de la frontera, falla con la lista de
 *     invariantes, salvo que se exporte PAGOS_CAMBIO_AUTORIZADO=1.
 *   - `node scripts/check-pagos-frontera.mjs --commit` revisa el ÚLTIMO
 *     commit: si tocó la frontera, exige "[pagos]" en el mensaje.
 *
 * No bloquea nada por sí solo en Vercel (el build no corre lint): es una
 * barrera para el desarrollador, no para el deploy.
 */
import { execSync } from 'node:child_process'

const FRONTERA = [
  'src/lib/wompi.ts',
  'src/lib/services/pagos.service.ts',
  'src/lib/constants/pagos.ts',
  'src/app/api/wompi/webhook/route.ts',
  'src/app/api/cron/wompi-conciliar/route.ts',
  'src/app/api/admin/pagos/verificar/route.ts',
  'src/app/api/admin/pagos/devolver/route.ts',
  'src/app/api/admin/pagos/externo/route.ts',
  'src/app/pago/anticipo/[token]/page.tsx',
  'src/app/pago/saldo/[token]/page.tsx',
  'src/lib/auth/cron.ts',
  'supabase/migrations/20260818_wompi_pagos.sql',
  'supabase/migrations/20261011_resumen_pago_solicitud.sql',
  'supabase/migrations/20261011_pagos_trigger_resumen_y_auditoria.sql',
  'supabase/migrations/20261011_pg_cron_conciliacion_pagos.sql',
]

const INVARIANTES = `
  1. La referencia es {anticipo|abono|saldo}-{uuid}; nada más se registra.
  2. El monto nunca viene del cliente (checkout firmado + comparación al confirmar).
  3. Una transacción = una fila (transaccion_id único); un momento = un aviso (*_pagado_at IS NULL).
  4. El resumen (monto_pagado_online, ultimo_pago_at) se deriva del ledger (trigger en pagos).
  5. Un fallo de WhatsApp/correo nunca revierte ni bloquea el registro.
  6. Sin WOMPI_* todo es no-op; sin WOMPI_PRIVATE_KEY la conciliación es no-op.
  7. El webhook solo acepta eventos con checksum válido.
`

function git(cmd) {
  try {
    return execSync(`git ${cmd}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

const modoCommit = process.argv.includes('--commit')
const cambiados = (modoCommit
  ? git('diff-tree --no-commit-id --name-only -r HEAD')
  : [git('diff --name-only HEAD'), git('ls-files --others --exclude-standard')].join('\n')
).split('\n').map(s => s.trim()).filter(Boolean)

const tocados = cambiados.filter(f => FRONTERA.includes(f))
if (tocados.length === 0) process.exit(0)

if (modoCommit) {
  const msg = git('log -1 --pretty=%B')
  if (/\[pagos\]/i.test(msg)) process.exit(0)
  console.error('✖ El último commit toca el módulo de pagos sin la etiqueta [pagos] en el mensaje:')
  for (const f of tocados) console.error(`    ${f}`)
  console.error(`\n  Invariantes a conservar:${INVARIANTES}  Corre: npm test -- pagos-contrato  y vuelve a commitear con "[pagos]".`)
  process.exit(1)
}

if (process.env.PAGOS_CAMBIO_AUTORIZADO === '1') {
  console.warn(`⚠ Cambios en el módulo de pagos (autorizados con PAGOS_CAMBIO_AUTORIZADO=1):\n    ${tocados.join('\n    ')}`)
  process.exit(0)
}

console.error('✖ Hay cambios en archivos del MÓDULO DE PAGOS (congelado el 2026-10-11):')
for (const f of tocados) console.error(`    ${f}`)
console.error(`
  Antes de seguir:
    - ¿Es estrictamente necesario? (rotación de llaves, URL de eventos, % comerciales, invariante roto con evidencia)
    - Corre los tests de contrato: npx vitest run src/__tests__/services/pagos-contrato.test.ts
    - Conserva los invariantes:${INVARIANTES}
  Para continuar: PAGOS_CAMBIO_AUTORIZADO=1 npm run lint   (y pon "[pagos]" en el mensaje del commit)
  Doc: docs/mejoras-futuras/pagos-aislamiento/README.md § 6
`)
process.exit(1)
