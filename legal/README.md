# Documentos Legales - Baird Service SAS

Generados: 13 de abril de 2026

## Archivos Incluidos

### 1. 01-terminos-y-condiciones.docx
**Términos y Condiciones de Uso**
- Objeto y naturaleza del servicio (Baird Service SAS como intermediaria)
- Registro y acceso de usuarios
- Flujo del servicio completo
- Aceptación de términos
- Propiedad intelectual
- Usos prohibidos
- Modificaciones a los términos
- Limitación de responsabilidad
- Indemnización
- Ley aplicable (Colombia)
- Resolución de disputas
- Terminación de cuenta
- Disposiciones generales

### 2. 02-politica-de-privacidad.docx
**Política de Privacidad**
- Identificación del responsable (Baird Service SAS)
- Marco legal: Ley 1581 de 2012, Decreto 1377 de 2013
- Tipos de datos: personales, sensibles, técnicos
- Propósitos del tratamiento
- Derechos ARCO (Acceso, Rectificación, Cancelación, Oposición)
- Transferencias y terceros (Supabase, Meta/WhatsApp, Google AI, Vercel)
- Períodos de retención
- Medidas de seguridad
- Cookies y seguimiento
- Ejercicio de derechos
- Cambios a la política

### 3. 03-contrato-tecnico.docx
**Contrato de Prestación de Servicios con Técnico**
- Partes contratantes
- Naturaleza independiente de la relación (NO empleado)
- Requisitos de registro
- Mecanismo de aceptación (atomic assignment - primer-llega-primero-obtiene)
- Obligaciones del técnico
  - Prestación de servicio con calidad profesional
  - Carga de evidencia (fotos, checklist, firma, GPS)
  - Comunicación profesional
- Acceso a portal (portal token UUID)
- Confirmación y disputas
- Términos de pago (directo con cliente)
- Confidencialidad
- No-competencia y no-solicitud
- Terminación
- Indemnización
- Responsabilidades
- Ley aplicable
- Cumplimiento de independencia laboral

### 4. 04-acuerdo-cliente.docx
**Acuerdo de Servicio al Cliente**
- Partes contratantes
- Naturaleza intermediaria de Baird Service SAS
- Proceso de solicitud
  - Ingreso de solicitud
  - Notificación a técnicos
  - Asignación automática
- Obligaciones del cliente
  - Información precisa
  - Disponibilidad
  - Confirmación oportuna
- Confirmación y disputas
- Términos de pago (directo con técnico)
- Limitación de responsabilidad
- Consentimiento WhatsApp
- Cancelación de solicitud
- Protección de datos
- Ley aplicable
- Modificaciones

## Características Técnicas

- Formato: Microsoft Word 2007+ (.docx)
- Idioma: Español
- Tamaño: ~13 KB cada documento
- Fuente: Arial, 11pt
- Tamaño de página: US Letter (8.5" x 11")
- Márgenes: 1 pulgada
- Encabezado: "BAIRD SERVICE SAS"
- Pie de página: Número de página
- Numeración: Artículos/Cláusulas numerados profesionalmente

## Campos de Completar

Los siguientes campos deben completarse antes de uso final:

- [NIT] — Número de Identificación Tributaria de Baird Service SAS
- [DIRECCIÓN REGISTRADA] — Dirección de domicilio registrada
- [REPRESENTANTE LEGAL] — Nombre del representante legal
- [CÉDULA] — Cédula del representante legal
- [CIUDAD DE CONSTITUCIÓN] — Ciudad donde fue constituida la empresa
- [CÉDULA DEL TÉCNICO] — Completado al firmar contrato con cada técnico

## Notas Legales

- Estos documentos cumplen con legislación colombiana
- Ley 1581 de 2012 sobre protección de datos personales
- Decreto 1377 de 2013 (reglamentario)
- Jurisdicción: Bogotá, D.C.
- Aplicables a relaciones entre Baird Service SAS, clientes y técnicos independientes

## Próximas Acciones

1. Completar campos de marcador
2. Revisar con asesor legal colombiano
3. Publicar en sitio web y aplicación
4. Requerir aceptación de términos al registrarse
5. Implementar proceso de consentimiento para datos personales
6. Documentar cumplimiento en auditorías internas

## Cambios pendientes para sincronizar con `.docx`

La página pública [`/terminos`](../src/app/terminos/page.tsx) avanza más rápido que estos documentos `.docx`. Cuando regenere los `.docx`, asegúrese de que reflejen estos cambios:

- **Versión vigente: 2026.05.10** (constante `TYC_VERSION` en `src/types/solicitud.ts`).
- **Nueva sección 8 "Visita programada y compromiso de presencia"** — cláusula informativa de no-show:
  - Compromiso de presencia del cliente en la franja horaria.
  - Cancelación o reagendamiento sin costo hasta 4 horas antes.
  - Si el cliente no está y no canceló a tiempo: el servicio se cierra y debe solicitarse de nuevo. **No hay penalidad económica** — pero ni MABE, ni Baird, ni el cliente cubren el costo del desplazamiento del técnico.
  - 2 inasistencias → confirmación obligatoria por llamada en futuras solicitudes.
  - 3+ inasistencias → suspensión del acceso a la plataforma.
  - Excepciones: emergencia médica, fuerza mayor declarada por autoridad, error del técnico/Baird (dirección errónea, llegada fuera de franja).
- **Renumeración**: las secciones 8-14 anteriores ahora son 9-15.

Para el detalle del protocolo operativo de no-show (lado técnico, evidencia obligatoria, etc.) ver [`docs/PROTOCOLO-VISITA.md`](../docs/PROTOCOLO-VISITA.md).

---

Generado mediante script Node.js con librería `docx` el 13 de abril de 2026.
