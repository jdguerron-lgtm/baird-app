# GUIA RAPIDA — Baird Service

## Levantar el proyecto

### Requisitos

- Node.js 18+
- Cuenta en [Supabase](https://supabase.com)
- Cuenta en [Google AI Studio](https://aistudio.google.com) (para la API de Gemini)
- (Opcional) Cuenta en Meta for Developers para WhatsApp — ver [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md)

### Pasos

**1. Instalar dependencias**
```bash
git clone <repositorio>
cd baird-app
npm install
```

**2. Configurar variables de entorno**
```bash
cp .env.example .env.local
```

**3. Configurar la base de datos en Supabase**

Ejecutar en el SQL Editor de Supabase en este orden:
```
supabase/migrations/add_solicitud_fields.sql
supabase/migrations/add_verification_fields_safe.sql
```
La tabla base `solicitudes_servicio` debe crearse antes de aplicar `add_solicitud_fields.sql`.

**4. Crear Storage Buckets en Supabase**

Panel de Supabase → Storage → New Bucket:
- `fotos-perfil` (público)
- `fotos-documentos` (privado)

**5. Iniciar el servidor**
```bash
npm run dev
# http://localhost:3000
```

---

## Variables de entorno

Archivo: `.env.local` (nunca commitear)

| Variable | Alcance | Descripción |
|----------|---------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Cliente + Servidor | URL del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente + Servidor | Clave pública anónima de Supabase |
| `GEMINI_API_KEY` | **Solo servidor** | Clave API de Google Gemini |
| `WHATSAPP_API_TOKEN` | **Solo servidor** | Token de autenticación WhatsApp Business API ⏳ |
| `WHATSAPP_PHONE_ID` | **Solo servidor** | ID del número de teléfono en Meta ⏳ |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | **Solo servidor** | Token para verificar handshake de webhook ⏳ |
| `WHATSAPP_WEBHOOK_SECRET` | **Solo servidor** | App Secret para verificar firma HMAC de webhooks ⏳ |
| `NEXT_PUBLIC_APP_URL` | Cliente + Servidor | URL base del sitio (para links de aceptación) ⏳ |

Plantilla completa en `.env.example`.

---

## Scripts

| Script | Comando | Descripción |
|--------|---------|-------------|
| Desarrollo | `npm run dev` | Servidor local con hot-reload en puerto 3000 |
| Build | `npm run build` | Compilación de producción optimizada |
| Producción | `npm start` | Sirve el build de producción |
| Lint | `npm run lint` | Verifica reglas de ESLint |
| TypeScript check | `npx tsc --noEmit` | Verifica tipos sin compilar |

---

## Configuraciones del proyecto

### TypeScript (`tsconfig.json`)
- `strict: true` — tipado estricto activado
- `paths: { "@/*": ["./src/*"] }` — alias para importaciones absolutas

### Next.js (`next.config.ts`)
- `reactCompiler: true` — optimización automática de renders

### Supabase Storage Buckets requeridos
- `fotos-perfil` — fotos de perfil de técnicos
- `fotos-documentos` — fotos de documentos de identidad

---

## Tareas comunes

### Agregar un nuevo tipo de equipo

1. Editar `src/types/solicitud.ts`:
```typescript
export const TIPOS_EQUIPO = [
  'Lavadora',
  'Nevera',
  // agregar aquí
  'Nuevo Equipo',
] as const;
```
El `SelectField` en `solicitar/page.tsx` lo incluirá automáticamente.

### Agregar un nuevo campo al formulario de solicitud

1. Agregar el campo a `SolicitudFormData` en `src/types/solicitud.ts`
2. Agregar validación en `src/lib/validations/solicitud.schema.ts`
3. Agregar campo en `src/hooks/useSolicitudForm.ts` (valor inicial)
4. Crear la migración SQL en `supabase/migrations/`
5. Actualizar `submitSolicitud` en `src/lib/services/solicitud.service.ts`
6. Agregar el componente UI en `src/app/solicitar/page.tsx`

### Modificar el prompt del triaje IA

Editar `src/app/api/triaje/route.ts`, sección del prompt. Si se agrega un campo nuevo a la respuesta, actualizar también `TriajeResponse` en `src/types/solicitud.ts` y `TriajeDisplay.tsx`.

### Agregar un nuevo icono SVG

Editar `src/components/icons/index.tsx`:
```tsx
export function NuevoIcono({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* path SVG */}
    </svg>
  );
}
```

### Ejecutar migraciones en Supabase

Las migraciones se aplican manualmente (Supabase CLI no está configurado):
1. Abrir [app.supabase.com](https://app.supabase.com)
2. Ir a **SQL Editor**
3. Copiar y pegar el contenido del archivo `.sql`
4. Ejecutar

---

## Troubleshooting

### "Supabase credentials are missing"
`.env.local` no existe o tiene valores vacíos.
```bash
cp .env.example .env.local
# Rellenar con valores reales
```

### "relation 'solicitudes_servicio' does not exist"
Las tablas no existen en Supabase. Ejecutar las migraciones SQL en el panel.

### El triaje IA no responde / timeout
- Verificar `GEMINI_API_KEY` en Google AI Studio
- La descripción del problema debe tener al menos 20 caracteres
- Revisar logs del servidor (`npm run dev`) para el error exacto

### Las imágenes no se suben
- Crear los buckets `fotos-perfil` y `fotos-documentos` en Supabase Storage
- Configurar política de acceso (inserción para usuarios anónimos si no hay auth)

### Build falla con error de tipos TypeScript
```bash
npm run lint
npx tsc --noEmit
```

### Problema con estilos de Tailwind (clases no aplicadas)
Verificar `postcss.config.mjs`:
```javascript
const config = {
  plugins: { "@tailwindcss/postcss": {} },
};
export default config;
```

### Webhook de WhatsApp no se verifica
Ver [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md) — sección "Problemas comunes".
