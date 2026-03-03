# Baird Service

Marketplace de servicios técnicos para electrodomésticos en Colombia. Conecta clientes con técnicos certificados mediante diagnóstico IA previo y asignación por WhatsApp.

## ¿Qué hace?

- **Cliente** llena un formulario → IA (Google Gemini) diagnostica el problema, estima costos y urgencia en tiempo real
- **Sistema** notifica a técnicos compatibles por WhatsApp con el diagnóstico, la dirección y el pago
- **Primer técnico** que responde "ACEPTO" gana el servicio (asignación atómica anti-race condition)

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19 + Tailwind CSS v4 |
| Lenguaje | TypeScript 5 (strict) |
| Base de datos | Supabase (PostgreSQL) |
| IA | Google Gemini 2.0 Flash |
| Mensajería | WhatsApp Business API (Meta Cloud) |
| Validación | Zod |

## Inicio rápido

```bash
git clone <repositorio>
cd baird-app
npm install
cp .env.example .env.local
# Rellenar .env.local con tus credenciales
npm run dev
```

Ver **[GUIA_RAPIDA.md](./GUIA_RAPIDA.md)** para configuración completa de variables de entorno y base de datos.

## Estado del proyecto

El MVP está en fase activa. El flujo de cliente con triaje IA y el registro de técnicos están implementados. La integración de WhatsApp para asignación automática está en progreso.

Ver **[TODO.md](./TODO.md)** para el estado detallado y próximos pasos.

## Documentación

| Archivo | Contenido |
|---------|-----------|
| [CONTEXTO.md](./CONTEXTO.md) | Por qué existe el proyecto, dominio, convenciones de código |
| [ARQUITECTURA.md](./ARQUITECTURA.md) | Diagrama del sistema, flujos de datos, esquema de BD, decisiones técnicas |
| [MODULOS.md](./MODULOS.md) | Estructura de módulos, dependencias, componentes y hooks |
| [API.md](./API.md) | Endpoints HTTP, requests, responses, errores |
| [GUIA_RAPIDA.md](./GUIA_RAPIDA.md) | Setup, variables de entorno, scripts, troubleshooting |
| [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md) | Guía paso a paso para configurar WhatsApp Business API |
| [TODO.md](./TODO.md) | Roadmap, bugs conocidos, deuda técnica |
