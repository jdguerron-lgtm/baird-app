# Baird Service

Marketplace de reparación de electrodomésticos de línea blanca en Colombia. Conecta clientes con técnicos verificados vía coordinación por WhatsApp, con dos flujos de servicio: **garantía** (paga la marca) y **particular** (paga el cliente tras aprobar cotización).

**En producción:** [lineablanca.bairdservice.com](https://lineablanca.bairdservice.com) (Vercel; `baird-app.vercel.app` sigue vivo como alias del mismo deployment).

## ¿Qué hace?

- **Cliente** crea una solicitud → elige horario de visita (customer-first scheduling)
- **Sistema** notifica a técnicos compatibles por WhatsApp con los datos del servicio
- **Primer técnico** que acepta gana el servicio (asignación atómica anti-race)
- **Post-diagnóstico:** garantía sigue tarifa fija MABE; particular pasa por cotización que el cliente aprueba
- Supervisores de marca reciben avisos de cambios de estado y un resumen semanal en PDF

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | Next.js 16 (App Router) + React 19 |
| UI | Tailwind CSS v4 |
| Lenguaje | TypeScript 5 (strict) |
| Base de datos | Supabase (PostgreSQL) |
| IA | Google Gemini 2.0 Flash (triaje — temporalmente deshabilitado) |
| Mensajería | WhatsApp Business API (Meta Cloud API v22.0) |
| Validación | Zod v4 |
| Deploy | Vercel |

## Inicio rápido

```bash
git clone <repositorio>
cd baird-app
npm install
cp .env.example .env.local   # rellenar credenciales
npm run dev
```

Ver [GUIA_RAPIDA.md](./GUIA_RAPIDA.md) para setup completo y [CLAUDE.md](./CLAUDE.md) § "Environment Variables" para la lista canónica de variables de entorno.

## Documentación

> 🧭 **La documentación canónica vive en [`docs/INDEX.md`](./docs/INDEX.md)** — hub de navegación con la tabla "¿qué doc abro para…?". Empezá siempre por ahí.

| Doc | Contenido |
|---------|-----------|
| [docs/INDEX.md](./docs/INDEX.md) | **Hub de navegación** — tareas comunes ↔ doc específico |
| [docs/ARQUITECTURA.md](./docs/ARQUITECTURA.md) | Mapa de archivos, API routes, páginas, servicios |
| [docs/MAQUINA-DE-ESTADOS.md](./docs/MAQUINA-DE-ESTADOS.md) | Los dos flujos (`es_garantia`) y la state machine |
| [docs/FLOWS.md](./docs/FLOWS.md) | Flujos end-to-end con plantillas WhatsApp en contexto |
| [docs/SUPABASE.md](./docs/SUPABASE.md) | Tablas, RLS, storage, patrones de query |
| [docs/TARIFAS.md](./docs/TARIFAS.md) | Doc canónico de tarifas (garantía MABE + particular) |
| [docs/GOTCHAS.md](./docs/GOTCHAS.md) | Trampas conocidas — leer antes de tocar código sensible |
| [GUIA_RAPIDA.md](./GUIA_RAPIDA.md) | Setup local, scripts, troubleshooting |
| [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md) | Configurar WhatsApp Business API (dev local) |
| [TODO.md](./TODO.md) | Roadmap y deuda técnica |

## Estado del proyecto

MVP en producción con ciclo de vida dual completo (garantía + particular). WhatsApp Cloud API operativa con token permanente y número propio (+57 313 4951164), 25 plantillas Meta aprobadas. Ver [TODO.md](./TODO.md) para el roadmap.
