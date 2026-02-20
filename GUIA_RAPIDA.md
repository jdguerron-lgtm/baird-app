# ⚡ GUÍA RÁPIDA — Baird Service

## 🚀 Levantar el proyecto

### Requisitos previos
- Node.js 18+ instalado
- Cuenta en [Supabase](https://supabase.com)
- Cuenta en [Google AI Studio](https://aistudio.google.com) (para la API de Gemini)

### Pasos

**1. Clonar e instalar dependencias**
```bash
git clone <repositorio>
cd baird-app
npm install
```

**2. Configurar variables de entorno**
```bash
cp .env.example .env.local
```
Editar `.env.local` con los valores reales:
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIs...
GEMINI_API_KEY=AIzaSy...
```

**3. Configurar la base de datos en Supabase**

Ejecutar las migraciones en el SQL Editor de Supabase en este orden:
```sql
-- Primero:
supabase/migrations/add_solicitud_fields.sql

-- Luego (opción segura para bases existentes):
supabase/migrations/add_verification_fields_safe.sql
```

**4. Crear los Storage Buckets en Supabase**

En el panel de Supabase → Storage → New Bucket:
- `fotos-perfil` (público)
- `fotos-documentos` (privado recomendado)

**5. Iniciar el servidor de desarrollo**
```bash
npm run dev
```
Abrir [http://localhost:3000](http://localhost:3000)

---

## 📜 Scripts disponibles

| Script | Comando | Descripción |
|--------|---------|-------------|
| Desarrollo | `npm run dev` | Servidor local con hot-reload en puerto 3000 |
| Build | `npm run build` | Compilación de producción optimizada |
| Producción | `npm start` | Sirve el build de producción |
| Lint | `npm run lint` | Verifica reglas de ESLint |

---

## 🔧 Tareas comunes

### Agregar un nuevo tipo de equipo

1. Editar `src/types/solicitud.ts`:
```typescript
export const TIPOS_EQUIPO = [
  'Lavadora',
  'Nevera',
  // ... agregar aquí
  'Nuevo Equipo',
] as const;
```

2. El `SelectField` en `solicitar/page.tsx` lo incluirá automáticamente.

---

### Agregar un nuevo campo al formulario de solicitud

1. Agregar el campo a `SolicitudFormData` en `src/types/solicitud.ts`
2. Agregar validación en `src/lib/validations/solicitud.schema.ts`
3. Agregar campo en `src/hooks/useSolicitudForm.ts` (valor inicial)
4. Agregar la migración SQL en `supabase/migrations/`
5. Actualizar `submitSolicitud` en `src/lib/services/solicitud.service.ts`
6. Agregar el componente UI en `src/app/solicitar/page.tsx`

---

### Modificar el prompt del triaje IA

Editar `src/app/api/triaje/route.ts`, sección del prompt:

```typescript
const prompt = `Eres un técnico experto...
// Modificar instrucciones aquí
`;
```

Los campos del JSON de respuesta están definidos en `TriajeResponse` (`src/types/solicitud.ts`). Si se agrega un campo nuevo, actualizar también `TriajeDisplay.tsx`.

---

### Agregar un nuevo icono SVG

Editar `src/components/icons/index.tsx`:

```tsx
export function NuevoIcono({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      {/* path SVG aquí */}
    </svg>
  );
}
```

---

### Ejecutar las migraciones en Supabase

Supabase no tiene CLI configurado en este proyecto. Las migraciones se aplican manualmente:

1. Abrir el proyecto en [app.supabase.com](https://app.supabase.com)
2. Ir a **SQL Editor**
3. Copiar y pegar el contenido del archivo `.sql`
4. Ejecutar

---

## 🐛 Troubleshooting

### Error: "Supabase credentials are missing"
**Causa:** `.env.local` no existe o tiene valores vacíos.
**Solución:**
```bash
cp .env.example .env.local
# Rellenar con valores reales
```

---

### Error: "relation 'solicitudes_servicio' does not exist"
**Causa:** Las tablas no existen en Supabase.
**Solución:** Ejecutar las migraciones SQL en el panel de Supabase. La tabla base `solicitudes_servicio` debe crearse antes de aplicar `add_solicitud_fields.sql`.

---

### El triaje IA no responde / timeout
**Causa:** `GEMINI_API_KEY` inválida, agotada o la descripción del problema tiene menos de 20 caracteres.
**Solución:**
- Verificar la clave en Google AI Studio
- Asegurarse que el campo "Novedades del equipo" tenga al menos 20 caracteres
- Revisar los logs del servidor (`npm run dev`) para el error exacto

---

### Las imágenes no se suben
**Causa:** Los buckets de Supabase Storage no existen o tienen permisos incorrectos.
**Solución:**
1. Crear los buckets `fotos-perfil` y `fotos-documentos` en Supabase Storage
2. Configurar la política de acceso (al menos inserción para usuarios anónimos si no hay auth)

---

### Build falla con error de tipos TypeScript
**Causa:** Cambios en tipos sin actualizar los componentes dependientes.
**Solución:**
```bash
npm run lint       # Ver errores de ESLint
npx tsc --noEmit  # Ver errores de TypeScript sin compilar
```

---

### Problema con estilos de Tailwind (clases no aplicadas)
**Causa:** Tailwind v4 con PostCSS requiere `@tailwindcss/postcss`.
**Verificar `postcss.config.mjs`:**
```javascript
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
export default config;
```
