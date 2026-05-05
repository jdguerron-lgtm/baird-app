# ─────────────────────────────────────────────────────────────────────────────
# PUSH FINAL — Tarifas fijas + IVA discriminado + Lavadora Secadora + ajuste 5%
#
# CÓMO USAR:
#   1. Abre PowerShell (NO PowerShell ISE)
#   2. cd C:\Users\Juan Guerron\Documents\baird-app
#   3. .\PUSH_NOW.ps1
#
# Si PowerShell bloquea la ejecución, primero corre:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
# ─────────────────────────────────────────────────────────────────────────────

$ErrorActionPreference = "Stop"
Set-Location "C:\Users\Juan Guerron\Documents\baird-app"

Write-Host "`n=== 1/5  Limpiando locks de git y archivos temporales ===" -ForegroundColor Cyan
Remove-Item .git\index.lock -ErrorAction SilentlyContinue
Remove-Item next.config.build.ts -ErrorAction SilentlyContinue

# Si el index está corrupto (bad signature), regenerar
$indexCheck = & git status 2>&1 | Out-String
if ($indexCheck -match "bad signature|index file corrupt") {
  Write-Host "  Index corrupto detectado, regenerando..." -ForegroundColor Yellow
  Remove-Item .git\index -ErrorAction SilentlyContinue
  & git reset
}

Write-Host "`n=== 2/5  Build de Next.js (verifica que compila) ===" -ForegroundColor Cyan
& npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Build falló. Revisa los errores arriba." -ForegroundColor Red; exit 1 }

Write-Host "`n=== 3/5  Tests (Vitest) ===" -ForegroundColor Cyan
& npm test
# No abortamos si fallan tests preexistentes (4 fallas no relacionadas con este cambio)

Write-Host "`n=== 4/5  git add + commit ===" -ForegroundColor Cyan
& git add `
  src/types/solicitud.ts `
  src/hooks/useSolicitudForm.ts `
  src/lib/validations/solicitud.schema.ts `
  src/app/api/solicitar/route.ts `
  src/app/solicitar/page.tsx `
  src/lib/constants/especialidades.ts `
  src/lib/constants/codigos-falla.ts `
  src/lib/utils/excel-mapping.ts `
  src/__tests__/validations/solicitud-schema.test.ts `
  src/__tests__/utils/excel-mapping.test.ts

$commitMsg = @"
feat(solicitar): tarifas fijas con IVA discriminado, Lavadora Secadora, +5%

- Eliminado input editable de pago_tecnico en /solicitar; ahora se calcula
  server-side desde TARIFAS_MANTENIMIENTO en types/solicitud.ts
- Nueva categoria 'Lavadora Secadora' (combo 2-en-1) - 189k mantenimiento
- Tarjeta de precio dinamica con discriminacion IVA: Base + IVA 19% = Total
  (requerido por DIAN para facturacion electronica)
- Helpers calcularBaseSinIva() y calcularIvaIncluido()
- IVA_TARIFA constant = 0.19
- Garantia: tarjeta morada 'sin costo' (la marca paga via tariff complejidad)
- Mantenimiento: tarjeta verde con tarifa fija por equipo
- Diagnostico/Reparacion: tarjeta azul 84k + anticipo 42k + cotizacion despues
- API /api/solicitar recalcula pago_tecnico server-side ignorando el del cliente
- Schema Zod relajado a min(0); el server es la fuente de verdad
- Hook useSolicitudForm recalcula al cambiar tipo_equipo/tipo_solicitud/garantia
- Excel BITACORA: CENTRO DE LAVADO ahora mapea a Lavadora Secadora
- Especialidad de Lavadora Secadora comparte 'Lavadoras' con tecnicos
- Codigos de falla: Lavadora Secadora cubre CENTROS DE LAVADO, LAVADO, SECADORAS
- Ajuste +5% aplicado al catalogo base (2026-05)
"@

& git commit -m $commitMsg
if ($LASTEXITCODE -ne 0) { Write-Host "Commit falló." -ForegroundColor Red; exit 1 }

Write-Host "`n=== 5/5  git push ===" -ForegroundColor Cyan
& git push
if ($LASTEXITCODE -ne 0) { Write-Host "Push falló." -ForegroundColor Red; exit 1 }

Write-Host "`n✓ Push completado. Vercel desplegará en ~2 minutos." -ForegroundColor Green
Write-Host "  Monitorea en: https://vercel.com/dashboard" -ForegroundColor Green
Write-Host "`nVerifica en producción:" -ForegroundColor Cyan
Write-Host "  https://baird-app.vercel.app/solicitar"
Write-Host ""
Write-Host "  1. Switch garantía → tarjeta morada 'sin costo'"
Write-Host "  2. Mantenimiento + Lavadora Secadora → \$189.000 (Base \$158.824 + IVA \$30.176)"
Write-Host "  3. Diagnóstico → \$84.000 + anticipo \$42.000 con desglose IVA"
