# Baird Service — Platform Diagnostic Report
**Date:** April 5, 2026
**Tested URL:** https://baird-app.vercel.app/solicitar
**Test data:** nombre: `nombre`, phone: `+573183723213`

---

## Test Results Summary

| Area | Status | Details |
|------|--------|---------|
| API Health | ✅ PASS | `/api/health` returns healthy |
| API Solicitar | ✅ PASS | POST creates solicitud, notifies 3 technicians |
| Form UI Load | ✅ PASS | Page loads correctly, all fields render |
| Form Validation | ✅ PASS | Shows proper error messages for empty/invalid fields |
| Calendar Widget | ⚠️ ISSUE | Date clicks cause CDP screenshot timeouts; time slots may not appear reliably |
| Form Input (React) | ⚠️ ISSUE | `form_input` tool (DOM-level setValue) does NOT trigger React state — values appear filled but are empty on submit |
| WhatsApp Notifications | ✅ PASS | 3 technicians matched and notified via API |

---

## Detailed Findings

### 1. API Backend — WORKING CORRECTLY

Direct API test via curl:
```
POST /api/solicitar → 200 OK
{
  "success": true,
  "id": "14c18fc8-f2a5-48d7-8d51-2842bfc92df2",
  "notificados": 3,
  "matched": 3
}
```

The backend pipeline works end-to-end: Zod validation → Supabase insert → WhatsApp customer confirmation → technician notifications. 3 technicians were matched for Bogotá/Lavadora and all received WhatsApp alerts.

### 2. Form UI — LOADS CORRECTLY

The `/solicitar` page renders properly with:
- All form fields (name, phone, address, city, zone, brand, type, service type, description, dates, price)
- Country code selector (CO +57 default, with 8 other countries)
- Two `DateTimeSlotPicker` calendar components for preferred visit times
- Geolocation button ("Usar mi ubicación actual")
- Trust sidebar with how-it-works, trust badges, and CTA for technicians
- Submit button with loading state

### 3. Form Validation — WORKING

When submitting with empty fields, validation correctly shows:
- "El nombre debe tener al menos 3 caracteres"
- "Ingresa un número de teléfono válido (mínimo 7 dígitos)"
- "La dirección debe ser más específica"
- "La ciudad es requerido" (grammatical note: should be "requerida")
- "La zona o barrio es requerido" (same: should be "requerida")
- Scrolls to top with "Por favor corrige los errores en el formulario" alert

### 4. Calendar DateTimeSlotPicker — POTENTIAL ISSUE

**Observed behavior:** Clicking calendar date buttons repeatedly caused the Chrome DevTools Protocol (CDP) to report screenshot timeouts ("renderer may be frozen or unresponsive"). This happened consistently across multiple attempts.

**Code review of `DateTimeSlotPicker.tsx`:** The component code itself looks clean — `handleDateClick` only calls `setSelectedDate(d)` and `setSelectedSlot(null)`. However:

- **`toDateKey()` uses unpadded month (0-indexed):** Returns keys like `"2026-3-7"` instead of `"2026-04-07"`. While not causing a crash, this creates inconsistent keys that could confuse React reconciliation.
- **Date comparison uses `>=` / `<=` on Date objects:** `isDateEnabled()` compares Date objects with `>=` and `<=`. While this works in JavaScript (compares timestamps), it's fragile and non-obvious.
- **No explicit `key` normalization:** Calendar day objects created in `calendarDays` use `new Date(year, month, d)` which sets time to midnight, matching `minDate`/`maxDate` — this should be safe but could be an edge case issue around timezone boundaries.

**Recommendation:** The CDP freezes may be a Chrome automation artifact rather than a real user-facing bug. Recommend manual testing to confirm. If confirmed, consider memoizing the calendar day buttons more aggressively with `React.memo`.

---

## Improvement Opportunities (prioritized)

### HIGH Priority

1. **Validation message grammar:** "La ciudad es requerido" → "La ciudad es requerida", same for zona. Spanish adjective agreement.

2. **`toDateKey()` should use ISO-format keys:**
   ```typescript
   // Current (buggy):
   function toDateKey(d: Date) {
     return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
   }
   // Fixed:
   function toDateKey(d: Date) {
     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
   }
   ```
   Note: `getMonth()` is 0-indexed, so April = 3 in current code. This doesn't cause visible bugs (keys are only compared internally) but is a maintenance hazard.

3. **Phone input handling:** The `PhoneInput` component uses `setField('cliente_telefono', v)` (programmatic setter) while all other inputs use `handleChange` (DOM event handler). This inconsistency works but makes the code harder to reason about.

### MEDIUM Priority

4. **Missing `aria-label` on date buttons:** Calendar buttons just show numbers (e.g., "7"). Screen readers would benefit from labels like "7 de abril de 2026".

5. **No loading skeleton:** The page shows "Cargando..." text briefly. A skeleton UI would feel more polished.

6. **Price field accepts 0:** The `pago_tecnico` field defaults to 0 and the validation minimum is $20,000 COP, but the field shows empty string when 0. The UX around this could be clearer.

### PREVIOUSLY IDENTIFIED (from earlier diagnostic)

These issues from the April 5 earlier diagnostic remain:
- **HIGH:** Zod validation missing in 7/10 API routes
- **HIGH:** No Content-Security-Policy header
- **HIGH:** Zero API route integration tests
- **MEDIUM:** Rate limiter in-memory only (won't work on Vercel)
- **MEDIUM:** All 5 Supabase tables have NO RLS
- **MEDIUM:** 21+ console.log in production code
- **REMINDER:** Meta Access Verification deadline May 31, 2026

---

## What's Working Well

- Clean, professional UI design with trust-building elements
- WhatsApp notification pipeline is operational (3 techs notified in real-time)
- Zod validation on the solicitar route catches invalid input
- Geolocation feature for address auto-fill
- Country code selector with sensible LATAM defaults
- Responsive layout (2-column on desktop, stacked on mobile)
- Atomic technician acceptance pattern (first-wins)
