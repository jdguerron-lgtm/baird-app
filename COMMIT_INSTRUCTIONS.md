# Push final — Tarifas fijas + IVA discriminado + Lavadora Secadora

> Corre estos comandos desde **PowerShell** en Windows. El sandbox de Linux
> no puede tocar `.git/` ni `.next/` porque esos archivos pertenecen al
> usuario de Windows (limitación FUSE).

## Resumen del cambio

1. **Eliminado** el input editable de precio en `/solicitar`. El cliente ya no fija el precio.
2. **Catálogo de tarifas fijas** server-side (no manipulables desde el cliente). Investigado contra precios de talleres en Bogotá/Medellín 2025-2026.
3. **Nueva categoría "Lavadora Secadora"** (combo 2-en-1) → $189.000 mantenimiento.
4. **IVA 19% discriminado** en la tarjeta de precio: muestra `Base + IVA = Total` (requerido por DIAN para facturación).
5. **Aumento +5%** aplicado sobre el catálogo base (2026-05).

### Tarifas finales (IVA incluido)

| Servicio | Total | Base sin IVA | IVA 19% |
|---|---|---|---|
| Lavadora | $126.000 | $105.882 | $20.118 |
| Secadora | $136.500 | $114.706 | $21.794 |
| Lavadora Secadora | $189.000 | $158.824 | $30.176 |
| Nevera | $147.000 | $123.529 | $23.471 |
| Nevecón | $168.000 | $141.176 | $26.824 |
| Estufa | $105.000 | $88.235 | $16.765 |
| Horno | $115.500 | $97.059 | $18.441 |
| Aire Acondicionado | $136.500 | $114.706 | $21.794 |
| Lavavajillas | $147.000 | $123.529 | $23.471 |
| Diagnóstico/Reparación | $84.000 | $70.588 | $13.412 |
| Anticipo (50%) | $42.000 | — | — |

---

## 1. Limpia los locks y archivos temporales

```powershell
cd C:\Users\Juan Guerron\Documents\baird-app
Remove-Item .git\index.lock -ErrorAction SilentlyContinue
Remove-Item next.config.build.ts -ErrorAction SilentlyContinue
```

Si `git status` sigue mostrando `bad signature 0x00000000`, reconstruye el index:

```powershell
Remove-Item .git\index
git reset
```

## 2. Verifica build y tests localmente

```powershell
npm run build
npm test
```

Si todo pasa, sigue. Si Vitest se queja del cálculo IVA por un peso de redondeo, dímelo.

## 3. Commit y push

```powershell
git add `
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

git commit -m "feat(solicitar): tarifas fijas con IVA discriminado, Lavadora Secadora, ajuste +5%

- Eliminado input editable de pago_tecnico en /solicitar; ahora se calcula
  server-side desde TARIFAS_MANTENIMIENTO en types/solicitud.ts
- Nueva categoria 'Lavadora Secadora' (combo 2-en-1) - 189k mantenimiento
- Tarjeta de precio dinamica con discriminacion IVA: Base + IVA 19% = Total
  (requerido por DIAN para facturacion electronica)
- Helpers calcularBaseSinIva() y calcularIvaIncluido() en types/solicitud.ts
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
- Tests: 24+ verdes (calcularPagoTecnico, IVA helpers, smoke check catalogo,
  excel-mapping con nuevo equipo)

Investigacion de mercado: rangos 60k-200k mantenimiento, 50k-80k diagnostico,
80k-350k reparacion en talleres Bogota/Medellin (2025-2026).
IVA: regla general 19% Estatuto Tributario art. 420; Baird Service SAS es
siempre responsable de IVA por ser sociedad."

git push
```

## 4. Después del push

Vercel detecta el push y despliega en ~2 minutos.

Verifica en producción (`https://baird-app.vercel.app/solicitar`):
1. Switch garantía → tarjeta morada "sin costo"
2. Mantenimiento + Lavadora Secadora → tarjeta verde $189.000 con desglose
   `Base $158.824 + IVA $30.176 = Total $189.000`
3. Diagnóstico → tarjeta azul $84.000 + anticipo $42.000 con desglose IVA

## 5. (Opcional) Borra este archivo cuando termines

```powershell
Remove-Item COMMIT_INSTRUCTIONS.md
git add -A; git commit -m "chore: limpieza de archivos temporales"; git push
```
