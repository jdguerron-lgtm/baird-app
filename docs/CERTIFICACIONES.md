# Certificaciones, acreditaciones e idoneidad del técnico

> Última actualización: 2026-10-08 (creación). Código fuente de verdad:
> `src/lib/constants/especialidades.ts` (categorías) y
> `src/lib/constants/certificaciones.ts` (catálogo + estados + helpers).
> Migración: `supabase/migrations/20261008_tecnicos_gasodomesticos_certificaciones.sql`.

## 1. Por qué existe esto

La taxonomía del marketplace es **por tipo de equipo** (4 especialidades). "Gasodoméstico"
es un corte **por fuente de energía** que atraviesa varias especialidades y que en Colombia es
**regulatorio**: quien interviene un artefacto a gas debe tener certificado de competencia
laboral (Resolución 90902 de 2013 del MinMinas, numeral 6.1). Un técnico "de estufas" sin esa
certificación no debería tocar la línea de gas.

Desde 2026-10-08 el sistema:

1. **Describe qué cubre cada especialidad** (el técnico sabe a qué se compromete).
2. **Pregunta explícitamente si el técnico atiende gasodomésticos** (`tecnicos.cubre_gasodomesticos`).
3. **Registra, por certificación, el estado de verificación** (`tecnicos.certificaciones` JSONB) —
   el técnico **declara**, el admin **verifica manualmente**.
4. Deja listo el **gate futuro del matching**: exigir `competencia_gas` verificada para
   notificar solicitudes de equipos a gas (hoy NO implementado — ver § 7).

## 2. Especialidades (categorías) y su alcance

| Especialidad | Cubre (`ESPECIALIDADES_INFO.cubre`) | Incluye equipos a gas |
|---|---|---|
| Lavadoras | Lavadoras, secadoras, lavasecadoras (2 en 1) y lavavajillas | Sí (secadoras a gas) |
| Neveras y Nevecones | Neveras convencionales, no-frost, nevecones side by side y congeladores | No |
| Hornos y Estufas | Estufas y hornos a gas o eléctricos, cubiertas de inducción y campanas | Sí |
| Aires Acondicionados | Minisplits, aires de ventana y portátiles residenciales | No |

Mapa `tipo_equipo` (formulario del cliente) → especialidad: `TIPO_A_ESPECIALIDAD`. Tipos de
equipo que **pueden** ser gasodomésticos: `TIPOS_EQUIPO_POSIBLE_GAS` = Estufa, Horno, Secadora,
Lavadora Secadora. La solicitud **todavía no pregunta gas vs eléctrico** (gap, § 7).

## 3. Modelo de datos

```
tecnicos.cubre_gasodomesticos  BOOLEAN       -- NULL = no informado (registros previos a 2026-10-08)
tecnicos.certificaciones       JSONB NOT NULL DEFAULT '{}'  -- CHECK jsonb_typeof = 'object'
tecnicos.perfil_actualizado_at TIMESTAMPTZ   -- última vez que el técnico guardó desde su portal
```

`certificaciones` es un **mapa por id**:

```json
{
  "competencia_gas": {
    "estado": "verificada",
    "entidad": "SENA",
    "numero": "9405001234567",
    "vence": "2029-03-15",
    "nota": "PDF del certificado recibido por WhatsApp 2026-10-09",
    "actualizado_en": "2026-10-09T14:02:11.000Z",
    "actualizado_por": "jdguerron@bairdservice.com"
  },
  "conte": { "estado": "declarada", "actualizado_por": "portal" }
}
```

Estados (`EstadoCertificacion`):

| Estado | Quién lo pone | Significado |
|---|---|---|
| `sin_revisar` | default / técnico ("no la tengo" deja nota) | Nadie la ha mirado |
| `declarada` | técnico (`/registro`, portal) | Dice tenerla, sin soporte revisado |
| `verificada` | **solo admin** | Admin vio el documento o consultó la entidad |
| `vencida` | admin | Tuvo pero expiró |
| `rechazada` | admin | El soporte no era válido |
| `no_aplica` | admin | No aplica a este técnico |

**Regla de oro** (`aplicarDeclaracionTecnico`): la declaración del técnico **nunca pisa** una
decisión del admin. Si el admin marcó `verificada`/`rechazada`/`vencida`/`no_aplica`, lo que el
técnico diga después en su portal se ignora para ese ítem.

`certificacionVigente()` = `verificada` **y** (`vence` vacío o ≥ hoy). `estadoGasTecnico()` resume
en 4 valores: `no_informado` · `no_cubre` · `cubre_sin_certificado` (⚠️) · `cubre_certificado`.

## 4. Catálogo de certificaciones (`CERTIFICACIONES`)

| id | Nombre | Aplica a | Vigencia | Entidad / norma | Declarable por el técnico |
|---|---|---|---|---|---|
| `competencia_gas` | Competencia laboral en gas | todos · **solo si atiende gas** · **REQUERIDA para gas** | 36 meses (seguimiento anual) | SENA u OCP acreditado ONAC · Res. 90902/2013 num. 6.1 · NTC 3631 · NCL 280202019 | Sí |
| `firma_instaladora_sic` | Firma instaladora registrada ante la SIC | todos · solo gas | 12 meses | SIC · Res. 90902/2013 | No |
| `refrigeracion_sena` | Formación en refrigeración y A/C | Neveras, Aires | no vence | SENA (titulación 180501009, NCL 280501026) u otra institución | Sí |
| `manejo_refrigerantes` | Manejo ambiental de refrigerantes | Neveras, Aires | 36 meses | SENA / Minambiente UTO · NCL 280501022 · Protocolo de Montreal | Sí |
| `conte` | Matrícula profesional CONTE (TE-6 / TE-1) | todos | no vence | CONTE · Ley 19/1990 · Decreto 991/1991 · Ley 1264/2008 | Sí |
| `trabajo_alturas` | Trabajo seguro en alturas | Aires | 12 meses | Centro autorizado / SENA · Res. 4272/2021 | Sí |
| `formacion_tecnica` | Formación técnica en electrónica / electricidad / electromecánica | todos | no vence | SENA u otra institución | Sí |
| `capacitacion_marca` | Capacitación de fabricante (MABE, Whirlpool, LG, Samsung, Haceb…) | todos | no vence | Fabricante | Sí |
| `antecedentes` | Antecedentes judiciales y disciplinarios | todos | 12 meses | Policía / Procuraduría / Contraloría | No |

`certificacionesAplicables(especialidades, cubreGas)` filtra el catálogo por técnico. Con
`cubreGas = null` (no informado) las de gas **se muestran** pero no se exigen.

## 5. Marco normativo y cómo verificar (investigación 2026-10-08)

### 5.1 Gas — Resolución 90902 de 2013 (MinMinas)

- Reglamento técnico de instalaciones internas de gas. Define **persona competente** como quien
  tiene certificado de competencia laboral para diseñar, instalar, **mantener/reparar**, inspeccionar
  o certificar. Numeral 6.1: la competencia la certifica un **Organismo de Certificación de Personas
  acreditado por ONAC** (ISO/IEC 17024) **o el SENA**. Modificada por Res. 41385/2017.
- Las distribuidoras (Vanti, Alcanos, GDO, Surtigas…) exigen certificado vigente tanto de quien
  construye la instalación como de **quien adecúa el gasodoméstico**, y que las reformas las haga una
  **firma instaladora registrada en la SIC**.
- Esquemas acreditados (ISO 17024): "Instalador de sistemas para suministro de gas a usuarios
  residenciales y comerciales", "Inspector de instalaciones…", y existe alcance de **"mantener y
  reparar artefactos a gas para uso residencial y comercial"**. Requisitos típicos de admisión: curso
  ≥ 40 h + 6 meses de experiencia (o certificado anterior); examen escrito + práctico; **vigencia
  3 años con seguimiento anual**.
- Norma de competencia SENA relacionada: **280202019 "Verificación de artefactos a gas"** (conexión,
  medición de CO en recintos).
- **Cómo verificar:** certificado SENA en <https://certificados.sena.edu.co/>; para OCP, consultar el
  directorio de acreditados de ONAC (<https://onac.org.co/>) y el número de certificado en el propio
  organismo. Ojo: Icontec, SGS y Bureau Veritas aparecen acreditados en **producto/sistemas**, no
  necesariamente en **personas** para gas — mirar el alcance exacto.

### 5.2 Refrigeración y aire acondicionado

- **SENA**: titulación **180501009** "Mantenimiento de sistemas de refrigeración y aire acondicionado
  doméstico" (técnico, ~18 meses con etapa productiva, por convocatoria en Sofía Plus); en 2026 abrió
  un técnico de 2.200 h que incluye alturas y manejo ecológico de refrigerantes. NCL **280501026**
  "Corregir fallas y averías en sistemas de refrigeración y A/C doméstico" (Mesa Sectorial de
  Mantenimiento, código 80501).
- **Manejo ambiental de refrigerantes**: NCL **280501022** (Protocolo de Montreal; Minambiente
  tiene línea de "certificación de técnicos del sector de servicios de refrigeración y A/C").
  Marcas y grandes clientes la exigen; ofertas laborales la piden como "deseable".
- **RETSIT** (Res. 40773/2023) regula instalaciones térmicas, pero aplica a capacidades > 5 TR
  (industrial/comercial); **no** al residencial que atiende Baird.
- **Alturas**: Res. 4272/2021 MinTrabajo; condensadoras en fachada → certificado + reentrenamiento
  anual.

### 5.3 Electricidad — CONTE

- Ley 19/1990 + Decreto 991/1991 (clases de matrícula) + Ley 1264/2008 (código de ética). La clase
  **TE-6** cubre "montaje, conexión, mantenimiento y reparación de equipos eléctricos para
  instalaciones especiales, tales como electrodomésticos…"; **TE-1** instalaciones interiores.
- Requiere plan de estudios aprobado en escuela técnica reconocida; trámite ante el comité seccional.
- **Verificar:** <https://www.conte.org.co/> (consulta de matriculados).

### 5.4 Formación general (no regulada)

- No existe un programa SENA llamado exactamente "mantenimiento de electrodomésticos de línea
  blanca"; lo más cercano es refrigeración (arriba) y los técnicos/tecnólogos en electrónica,
  electricidad o electromecánica. Institutos privados (p. ej. Politécnico Industrial Nueva Colombia,
  Bogotá) ofrecen cursos de 4–6 meses en neveras/lavadoras que entregan **constancia de asistencia**,
  no título.
- Certificación de competencias laborales del SENA: gratuita y voluntaria; el candidato demuestra
  desempeño contra la norma; se consulta en el SNFT / <https://certificados.sena.edu.co/>.

### 5.5 Qué pedirle al técnico (checklist operativo)

| Si el técnico… | Pedir | Marcar |
|---|---|---|
| Atiende gas | Certificado de competencia laboral en gas (PDF/foto) + número | `competencia_gas` → verificada + `vence` |
| Reforma instalaciones de gas | Registro de la firma instaladora en SIC | `firma_instaladora_sic` |
| Neveras / aires | Título o NCL de refrigeración + certificado de refrigerantes | `refrigeracion_sena`, `manejo_refrigerantes` |
| Instala A/C en fachada | Certificado de alturas (≤ 12 meses) | `trabajo_alturas` |
| Cualquiera | Matrícula CONTE si la tiene; formación técnica; antecedentes (consulta en línea, gratis) | `conte`, `formacion_tecnica`, `antecedentes` |
| Garantía MABE | Constancia de entrenamiento de la marca | `capacitacion_marca` |

## 6. Dónde vive en la app

| Pieza | Archivo | Qué hace |
|---|---|---|
| Registro | `src/app/registro/page.tsx` | Muestra `cubre` por especialidad; pregunta **obligatoria** gasodomésticos y, si sí, "¿tienes el certificado?" → siembra `competencia_gas` como `declarada`/`sin_revisar`. |
| Portal técnico — perfil | `src/app/tecnico/[token]/perfil/page.tsx` | Autoservicio: especialidades, gas, ARL, declaración de certificaciones aplicables (+ número). Banner "Completa tu perfil" en el portal mientras `perfil_actualizado_at` sea NULL. |
| Redirección | `src/app/tecnico/perfil/[token]/page.tsx` | `/tecnico/perfil/{token}` → `/tecnico/{token}/perfil` (Meta exige el parámetro del botón URL al final). |
| API | `src/app/api/tecnico/perfil/route.ts` | POST autenticado por `portal_token`, service_role; actualiza `tecnicos` y sincroniza `especialidades_tecnico` (insert nuevas / delete quitadas, sin ventana vacía). Solo siembra `declarada`. |
| Admin ficha | `src/app/admin/tecnicos/[id]/page.tsx` | Edita especialidades, fija gasodomésticos (sí/no/no informado), **checklist manual** de certificaciones (estado, entidad, nº, vencimiento, nota, link "Verificar"), alerta si cubre gas sin certificado. |
| Admin listado | `src/app/admin/tecnicos/page.tsx` | Badge `🔥 gas` / `gas: ?`. |
| Plantilla | `tecnico_actualizar_perfil_v1` en `scripts/upload-templates.mjs` | Pide al técnico completar el perfil (botón URL dinámico). |
| Envío masivo | `scripts/enviar-actualizar-perfil-tecnicos.mjs` | `--dry`; va a todos menos `rechazado` (`--solo-sin-completar` para re-envíos), respeta `BAIRD_TEST_PHONE_WHITELIST`. |
| Tests | `src/__tests__/utils/certificaciones.test.ts` | Catálogo, aplicables, vigencia, parse, no-pisar-admin. |

## 7. Pendiente / siguientes pasos

1. **Gate en el matching** (`notificarTecnicos`, `whatsapp.service.ts`): si el equipo es
   `TIPOS_EQUIPO_POSIBLE_GAS` y la solicitud es a gas → notificar solo técnicos con
   `estadoGasTecnico === 'cubre_certificado'`. Prerrequisito: el formulario `/solicitar` debe
   preguntar **gas vs eléctrico** para esos 4 tipos (hoy no lo hace).
2. **Calentador de agua** no existe como `tipo_equipo` (MABE tiene familia "BOILERS" en
   `codigos-falla.ts`). Agregarlo mapeado a Hornos y Estufas con gas obligatorio.
3. **Lavavajillas** está dentro de Lavadoras; evaluar categoría propia si crece la demanda
   (1 solicitud histórica al 2026-10-08).
4. **Adjuntar el soporte** (PDF/foto) a cada certificación — hoy solo texto/nota. Requiere bucket
   privado con signed URLs (misma deuda que `tecnicos-documentos`, ver `docs/SEGURIDAD.md`).
5. **Recordatorio de vencimiento**: cron que avise al admin 30 días antes de `vence`.
6. Mover los writes del admin a una API route con `verificarAdmin` cuando se cierre RLS Fase 2
   (`docs/PLAN-RLS.md`); hoy la ficha escribe client-side como `authenticated` (policy full access).

## Fuentes consultadas (2026-10-08)

- Resolución 90902 de 2013 — [Alcaldía de Bogotá](https://www.alcaldiabogota.gov.co/sisjur/normas/Norma1.jsp?i=70298) · [texto consolidado SIC (PDF)](https://www.sic.gov.co/sites/default/files/files/reglamentos%20tecnicos/RT%20Instalaciones%20de%20Gas%20Resoluci%C3%B3n%2090902%20de%202013%20Con%20modificacion%207-12-17%20(1).pdf) · [CRA gestor normativo](https://normas.cra.gov.co/gestor/docs/resolucion_minminas_90902_2013.htm)
- Resolución 41385 de 2017 (modifica Anexo 2) — [CREG](https://gestornormativo.creg.gov.co/gestor/entorno/docs/resolucion_minminas_41385_2017.htm)
- Requisitos distribuidoras: [Alcanos — preguntas frecuentes](https://alcanosesp.com/experiencia-al-cliente/preguntas-frecuentes) · [GDO P-804](https://www.gdo.com.co/Documents/CREG%20080/P-804%20PROCEDIMIENTO%20SOLICITUD%20DEL%20SERVICIO%20DE%20GAS%20NATURAL,%20PARA%20INSTLACIONES%20CONSTRUCIDAS%20POR%20INDEPENDIENTES%20V004.pdf) · [Surtigas](https://www.surtigas.com.co/requisitos-instalaciones)
- Esquemas ISO 17024 gas (vigencia 3 años): [Certipedia — Instalador](https://www.certipedia.com/quality_marks/0000081040?locale=es) · [Certipedia — Inspector](https://www.certipedia.com/quality_marks/0000081039?qm_locale=es&locale=en) · [ONAC certificado 14-OCP-006](https://onac.org.co/certificados/14-OCP-006.pdf) · [ONAC 19-OCP-012](https://onac.org.co/certificados/19-OCP-012.pdf)
- SENA: [Certificados de competencia laboral (Colombia Ágil)](https://www.colombiaagil.gov.co/tramites/intervenciones/certificados-de-competencia-laboral-del-sena) · [Normas de competencia laboral](https://www.sena.edu.co/es-co/Empresarios/paginas/competenciaslaborales.aspx) · [Normas disponibles para certificar (PDF 2022)](https://www.sena.edu.co/es-co/Noticias/Documents/Normas-disponibles-certificar-04252022.pdf) · [Observatorio laboral](https://observatorio.sena.edu.co/Comportamiento/CnoDetalleFunciones?tags=8371) · [NCL 280202019 (copia Studocu, confirmar en SENA)](https://www.studocu.com/co/document/servicio-nacional-de-aprendizaje/competencia-ciudadana/280202019-sena-competencias/31672676)
- Refrigeración: [Minambiente — sector refrigeración y A/C](https://www.minambiente.gov.co/asuntos-ambientales-sectorial-y-urbana/sector-de-refrigeracion-y-acondicionamiento-de-aire/) · [RETSIT (MinEnergía PDF)](https://www.minenergia.gov.co/documents/6282/1812180222_Se_expide_el_Reglamento_T%C3%A9cnico_de_Instalaciones_T%C3%A9rmicas__RETSIT.pdf) · [Anexo RETSIT Res. 40773/2023](https://www.minenergia.gov.co/documents/11504/Anexo_General_RETSIT_resoluci%C3%B3n_40773_de_29_dic_2023.pdf) · [Titulaciones y NCL (Gestiopolis)](https://www.gestiopolis.com/titulaciones-normas-competencias-laborales-colombia/) · [SENA técnico A/C 2026 (tercero)](https://senaofertaeducativa.com/tecnico-mantenimiento-aire-acondicionado-refrigeracion/)
- CONTE: [Clases de matrícula (MinEnergía)](https://minenergia.gov.co/es/repositorio-normativo/normativa/clases-de-matr%C3%ADcula/) · [Decreto 991 de 1991](https://gestornormativo.creg.gov.co/gestor/entorno/docs/decreto_0991_1991.htm) · [Ley 1264 de 2008 (Rama Judicial PDF)](https://sidn.ramajudicial.gov.co/SIDN/NORMATIVA/TEXTOS_COMPLETOS/7_LEYES/LEYES%202008%20(1182-1269)/Ley%201264%20de%202008%20%20(C%C3%B3digo%20de%20Etica%20de%20los%20T%C3%A9cnicos%20Electricistas).pdf) · [Ley 19 de 1990](https://gestornormativo.creg.gov.co/gestor/entorno/docs/ley_0019_1990.htm)
- Formación privada: [Politécnico Industrial Nueva Colombia — línea blanca (Emagister)](https://www.emagister.com.ar/tecnico-mantenimiento-reparacion-linea-blanca-neveras-lavadoras-cursos-2715414.htm) · [Sofía Plus — preguntas frecuentes](https://portal.senasofiaplus.edu.co/index.php/282-preguntas-frecuentes)
