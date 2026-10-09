# Guia de prueba — Carga Masiva de Servicios

> **2026-08-31:** la carga masiva también acepta el **PDF "TALLER" de MABE**
> (órdenes de servicio de garantía). Ver §7 al final. Además, desde esa fecha
> las órdenes de garantía **duplicadas se saltan** (mismo N° de orden ya en BD
> o repetido dentro del archivo) — aplica a Excel y PDF, cierra el gap §5.5.

## Requisitos previos

1. Tener acceso al panel admin: `https://lineablanca.bairdservice.com/admin/login`
2. Migración SQL ejecutada en Supabase (tabla `solicitudes_servicio` activa)
3. Si se quiere probar notificación WhatsApp: al menos 1 técnico verificado en la ciudad correspondiente

---

## 1. Preparar el archivo Excel

El sistema acepta archivos `.xlsx` en formato **BITÁCORA SERVICIOS PROGRAMADOS** (Mabe/GE).

### Estructura requerida

El archivo debe tener una fila de encabezados que contenga las palabras **ORDEN**, **Nombre** y **Telefono**. Las filas de datos deben estar debajo, con un número secuencial en la columna B.

### Columnas (en orden)

| Col | Campo | Ejemplo | Obligatorio |
|-----|-------|---------|-------------|
| A | (vacío) | | |
| B | N° | 1 | Si |
| C | ORDEN | 9415091231 | Si |
| D | Nombre del consumidor | EDNA MILENA CORREDOR | Si (min 3 chars) |
| E | (vacío) | | |
| F | Tipo de Servicio | GARANTÍA DE FÁBRICA | Si |
| G | Teléfonos de Contacto | 3005640184 / | Si (min 7 dígitos) |
| H | Dirección | BOGOTA / CL 21 81B 30 / MODELIA/FONTIBON / Detalle | Si |
| I | Modelo | PM6042GV0 / CUBIERTA EMPOTRE 60 CM MABE NEG | Si |
| J | Familia | ESTUFAS | Si (debe ser mapeable) |
| K | Retorno | NO RETORNO | No |
| L | Total Días Abierta | 1 | No |
| M | Síntoma/Notas | NO GENERA CHISPA - CHISPA DEBIL | Si (min 20 chars con modelo) |
| N-Q | (vacíos) | | |
| R | Pre-diagnóstico | FOGON MAS GRANDE DEMORA EN ENCENDER | No |

### Formato de dirección (columna H)

Separar con ` / ` (espacio-slash-espacio):

```
CIUDAD / CALLE / BARRIO/LOCALIDAD / DETALLE ADICIONAL
```

Ejemplos:
- `BOGOTA / CL 21 81B 30 INT 10 / MODELIA/FONTIBON / Residencial Portal`
- `MEDELLIN / CRA 50 33-10 / LAURELES/COMUNA 11`
- `CALI / AV 6N 23-45`

### Formato de teléfono (columna G)

Formatos aceptados:
- `3005640184 / ` (con slash)
- ` / 3123420354` (segundo número)
- `3005640184` (sin slash)
- `3005640184 / 3123420354` (dos números, se toma el primero)

El sistema agrega automáticamente el prefijo `57|`.

### Valores de Familia (columna J)

| Valor en Excel | Mapea a |
|----------------|---------|
| ESTUFAS | Estufa |
| REFRIGERADORES | Nevera |
| AIRES ACONDICIONADOS | Aire Acondicionado |
| CENTRO DE LAVADO | Lavadora |
| LAVAVAJILLAS | Lavavajillas |
| LAVADORAS | Lavadora |
| SECADORAS | Secadora |
| HORNOS | Horno |
| BOILERS | Horno |
| NEVECONES | Nevecón |
| NEVERAS | Nevera |

Cualquier otro valor genera error en esa fila.

### Valores de Tipo de Servicio (columna F)

- Si contiene `GARANTÍA` o `GARANTIA` → se marca como garantía (`es_garantia: true`)
- Cualquier otro valor → no es garantía

---

## 2. Archivo de prueba de ejemplo

Crear un archivo `prueba_carga.xlsx` con esta estructura:

**Filas de encabezado** (filas 1-8):

| | A | B | C | D | E | F | G | H | I | J | K | L | M | ... | R |
|--|---|---|---|---|---|---|---|---|---|---|---|---|---|-----|---|
| 1 | | | | | | | | | | | | | | | |
| 2 | | | | | | FORMATO | | | | | | | | | |
| 3 | | | | | | BITÁCORA SERVICIOS | | | | | | | | | |
| 4 | | | | | | | | | | | | | | | |
| 5 | | | | | | | | | | | | | | | |
| 6 | | | | | | | | | | | | | | | |
| 7 | | | | | | | | | | | | | | | |
| 8 | | N° | ORDEN | Nombre del consumidor | | Tipo de Servicio | Telefonos de Contacto | Direccion | Modelo | Familia | Retorno | Total Dias | Sintoma/Notas | | Pre diagnóstico |

**Filas de datos** (a partir de fila 10):

| | B | C | D | F | G | H | I | J | K | L | M | R |
|--|---|---|---|---|---|---|---|---|---|---|---|---|
| 10 | 1 | ORD-001 | JUAN PEREZ GARCIA | GARANTÍA DE FÁBRICA | 3001234567 / | BOGOTA / CRA 7 45-10 / CHAPINERO/CHAPINERO / Apto 301 | WF20T6000 / LAVADORA SAMSUNG 20KG BLA | LAVADORAS | NO RETORNO | 1 | LA LAVADORA NO CENTRIFUGA Y HACE RUIDO FUERTE AL GIRAR EL TAMBOR | RODAMIENTO DESGASTADO |
| 11 | 2 | ORD-002 | MARIA LOPEZ RODRIGUEZ | GARANTÍA DE FÁBRICA | 3109876543 / | BOGOTA / CL 100 15-20 APTO 502 / SANTA BARBARA/USAQUEN / Conj Residencial Norte | RMP420FZSS / NEVERA MABE NF 420L INX | REFRIGERADORES | NO RETORNO | 2 | NO ENFRIA CORRECTAMENTE EL CONGELADOR SE FORMA ESCARCHA EN LA PARED POSTERIOR | SISTEMA DE DESCONGELAMIENTO |
| 12 | 3 | ORD-003 | CARLOS RODRIGUEZ MARTINEZ | SERVICIO REGULAR | 3204567890 / | MEDELLIN / CRA 43A 1-50 / EL POBLADO/COMUNA 14 | EMC5150SNX / COCINA MABE 51CM NEGRO-INOX | ESTUFAS | NO RETORNO | 1 | HORNO NO ENCIENDE Y LOS QUEMADORES TARDAN EN GENERAR CHISPA PARA ENCENDER | IGNITOR DEFECTUOSO |
| 13 | 4 | ORD-004 | ANA MARIA GONZALEZ | GARANTÍA DE FÁBRICA | 3157891234 / | BOGOTA / AV 68 72-43 / LAS FERIAS/ENGATIVA / Centro Comercial | MMI12CDBW / AIRE ACONDICIONADO MABE INV 12K BTU | AIRES ACONDICIONADOS | NO RETORNO | 3 | NO ENFRIA EL EQUIPO ENCIENDE PERO NO BAJA LA TEMPERATURA DEL AMBIENTE | COMPRESOR SIN CARGA |
| 14 | 5 | ORD-005 | PEDRO SANCHEZ RIOS | GARANTÍA DE FÁBRICA | / 3118765432 | CALI / CL 5 38-25 / SAN FERNANDO/COMUNA 19 | GLV1460FSS / LAVAVAJILLAS GE INX | LAVAVAJILLAS | NO RETORNO | 1 | EL LAVAVAJILLAS NO DRENA EL AGUA QUEDA AGUA ESTANCADA EN EL FONDO | BOMBA DE DRENAJE |
| 15 | 6 | ORD-006 | INVALIDO | GARANTÍA | 123 / | | XYZ / EQUIPO DESCONOCIDO | ASPIRADORAS | | | Corta | |

La fila 6 (ORD-006) tiene errores intencionales para verificar la validación:
- Nombre muy corto (< 3 chars): `INVALIDO` tiene 8, OK. Cambiar a `AB` para probar
- Teléfono inválido: `123` (< 7 dígitos)
- Dirección vacía
- Familia no mapeable: `ASPIRADORAS`
- Descripción muy corta

---

## 3. Paso a paso de la prueba

### 3.1 Subir el archivo

1. Ir a `https://lineablanca.bairdservice.com/admin/carga-masiva`
2. Arrastrar el archivo `.xlsx` al área de carga (o click para seleccionar)
3. Verificar que aparece el nombre del archivo y su tamaño

### 3.2 Revisar el preview

Verificar que la tabla muestra:

| Fila | Estado | Orden | Cliente | Equipo | Ciudad | Zona |
|------|--------|-------|---------|--------|--------|------|
| 10 | OK | ORD-001 | JUAN PEREZ | LAVADORAS | BOGOTA | CHAPINERO |
| 11 | OK | ORD-002 | MARIA LOPEZ | REFRIGERADORES | BOGOTA | SANTA BARBARA |
| 12 | OK | ORD-003 | CARLOS RODRIGUEZ | ESTUFAS | MEDELLIN | EL POBLADO |
| 13 | OK | ORD-004 | ANA MARIA GONZALEZ | AIRES ACOND. | BOGOTA | LAS FERIAS |
| 14 | OK | ORD-005 | PEDRO SANCHEZ | LAVAVAJILLAS | CALI | SAN FERNANDO |
| 15 | Error | ORD-006 | (nombre) | ASPIRADORAS | — | — |

**Verificar barra de resumen:**
- 5 válidas (verde)
- 1 con errores (rojo)
- 6 filas detectadas

### 3.3 Configurar opciones

- **Valor del servicio:** cambiar a `$80.000` (o el valor deseado)
- **Horario 1:** `Lunes a Viernes 8:00 AM - 12:00 PM`
- **Horario 2:** `Lunes a Viernes 2:00 PM - 5:00 PM`
- **Notificar técnicos:** dejar desactivado para primera prueba

### 3.4 Cargar

1. Click **"Cargar 5 solicitudes"**
2. Esperar el spinner de procesamiento
3. Verificar los resultados:

**Resultado esperado:**
| Métrica | Valor |
|---------|-------|
| Total filas | 6 |
| Insertadas | 5 |
| Errores | 1 |
| Notificados | 0 (si no se activó) |

### 3.5 Verificar en base de datos

1. Ir a `https://lineablanca.bairdservice.com/admin/solicitudes`
2. Verificar que aparecen las 5 solicitudes nuevas con estado `pendiente`
3. Abrir una solicitud y verificar:
   - Nombre, teléfono (formato `57|300...`), dirección, ciudad, zona
   - Tipo de equipo mapeado correctamente
   - Marca extraída del modelo
   - `es_garantia: true` para las que dicen GARANTÍA
   - Número de serie = número de orden

### 3.6 Verificar en dashboard de garantías

1. Ir a `https://lineablanca.bairdservice.com/admin/garantias`
2. Verificar que aparecen 4 servicios de garantía (ORD-003 es "SERVICIO REGULAR")
3. Verificar resumen por marca (SAMSUNG: 1, MABE: 2, GE: 1)
4. Verificar resumen por tipo de equipo

---

## 4. Prueba con notificación WhatsApp

**Prerrequisitos:**
- Token de WhatsApp configurado en Vercel
- Al menos 1 técnico verificado en BOGOTA con especialidad "Lavadoras"

### Pasos:
1. Repetir carga con **"Notificar técnicos por WhatsApp"** activado
2. Verificar que el contador de "Notificados" > 0
3. Verificar que el técnico recibe mensaje de WhatsApp

---

## 5. Prueba de errores

### 5.1 Archivo no Excel
- Subir un `.pdf` o `.txt` → debe rechazar con "Formato no soportado"

### 5.2 Archivo vacío
- Subir un `.xlsx` sin datos → debe mostrar "No se encontraron datos válidos"

### 5.3 Archivo muy grande
- Subir un archivo > 10MB → debe rechazar con "excede el tamaño máximo"

### 5.4 Sin autenticación
- Cerrar sesión e intentar subir → debe redirigir al login

### 5.5 Duplicados
- Subir el mismo archivo dos veces → la segunda carga debe insertar nuevas filas (no hay constraint de duplicados por orden)

---

## 6. Checklist de validación

- [ ] El archivo se lee correctamente (preview muestra datos)
- [ ] Las filas válidas se marcan como OK (verde)
- [ ] Las filas inválidas se marcan como Error (rojo) con mensaje descriptivo
- [ ] El conteo de válidas/inválidas es correcto
- [ ] Los valores de configuración (pago, horarios) se aplican
- [ ] Las solicitudes se insertan en la base de datos
- [ ] El estado inicial es `pendiente`
- [ ] El teléfono tiene formato `57|XXXXXXXXXX`
- [ ] La ciudad se extrae correctamente de la dirección compuesta
- [ ] La zona se extrae correctamente
- [ ] La familia se mapea al tipo de equipo correcto
- [ ] La marca se extrae del modelo
- [ ] `es_garantia` es `true` para servicios de garantía
- [ ] `numero_serie_factura` contiene el número de orden
- [ ] Las filas con errores NO se insertan
- [ ] El detalle de errores se muestra para filas inválidas
- [ ] El botón "Cargar otro archivo" reinicia el formulario
- [ ] La notificación WhatsApp funciona cuando está activada (si WhatsApp está configurado)
- [ ] El dashboard de garantías refleja las solicitudes cargadas

---

## 7. Carga por PDF "TALLER" de MABE (2026-08-31)

El sistema acepta el PDF de órdenes de servicio que MABE envía por taller
(encabezado azul `TALLER: CSATDEABTA9P`), con N órdenes por documento.

### Campos que se extraen por orden

| Campo PDF | Mapea a |
|-----------|---------|
| NO. ORDEN | `numero_serie_factura` (N° orden MABE) — clave de dedup |
| TIPO SERVICIO (GARANTÍA DE FÁBRICA) | `es_garantia: true` |
| FECHA PROG (`26.08.2026 08:00:00`) | `horario_visita_1` en formato canónico parseable: `"miércoles, 26 de agosto · 8am-12pm"` (hora → franja del catálogo `FRANJAS_HORARIO`) |
| NOMBRE DEL CLIENTE | `cliente_nombre` |
| TEL. CEL. (fallback casa/oficina; descarta `0` / `00000000000`) | `cliente_telefono` (prefijo 57) |
| DIRECCIÓN | `direccion` |
| COLONIA | `zona_servicio` |
| DELEGACIÓN O MUNICIPIO | `ciudad_pueblo` |
| MODELO | `modelo_equipo` (embebido en novedades) |
| DESCRIPCIÓN PRODUCTO | `tipo_equipo` (vía `mapDescripcionProducto`: primero `mapFamilia`, luego abreviaturas MABE como token completo — `REF`/`REFRIG` → Nevera, `LAV` → Lavadora, `SEC` → Secadora, `EST`/`COC`/`CUB` → Estufa, `HOR`/`MICRO` → Horno, `AA` → Aire. Ej. "MANUFAC REF MABE NF 2P 400L" → Nevera, 2026-10-09) |
| ENTRE CALLES | complemento de `direccion` (conjunto/barrio). Si es **solo un número** (2º celular) va a `novedades_equipo` como "Tel. alterno" y sirve de fallback si no hay otro teléfono (2026-10-09) |
| NO. DE SERIE, LUGAR DE COMPRA | embebidos en `novedades_equipo` |
| FALLA REPORTADA/QUIÉN REPORTA | `novedades_equipo` |

Marca siempre `MABE`, `pago_tecnico: 0` (tarifa por complejidad post-diagnóstico).
Los valores se recortan del texto **original** del PDF (no del normalizado), así
que nombres y direcciones conservan ñ y tildes ("PEÑA", no "PENA") — fix 2026-10-09.

### Flujo de prueba

1. `/admin/carga-masiva` → arrastrar el `.pdf` → el preview lo arma el
   **servidor** (`POST /api/carga-masiva` con `dryRun=true`), incluye columna
   "Horario 1" con la FECHA PROG mapeada a franja.
2. Cargar → mismo pipeline que Excel: `estado: pendiente_horario` +
   `horario_token`; con "notificar" activo el cliente recibe la plantilla de
   selección de horario y su opción 1 ya es la fecha acordada con MABE.
3. Validaciones por orden: N° orden, nombre ≥3, teléfono válido, dirección,
   tipo de equipo mapeable. Warnings: FECHA PROG no reconocida o ya pasada,
   municipio ausente (default BOGOTA).
4. Duplicados (orden ya en BD o repetida en el archivo) → fila inválida con
   mensaje, no se inserta.

Parser: `src/lib/utils/pdf-orden-mapping.ts` (tests en
`src/__tests__/utils/pdf-orden-mapping.test.ts`). Extracción de texto:
`unpdf` (serverless-safe), reconstrucción de líneas por coordenadas x/y.

### 7.1 Cómo funciona el parser, paso a paso

Todo vive en `src/lib/utils/pdf-orden-mapping.ts`. El objetivo es que el PDF
produzca el **mismo** `ParsedRow[]` que el Excel, para que la API y la UI no
distingan formatos.

```
PDF (bytes)
  │  unpdf.getTextContent() → items { str, x, y } por página   [route.ts: extraerLineasPdf]
  ▼
reconstruirLineas(items)      agrupa por Y (±2.5pt), ordena arriba→abajo y
  │                           dentro del renglón izquierda→derecha
  ▼
extraerOrdenes(lineas)        busca las ETIQUETAS ("NO. ORDEN:", "TEL. CEL.:" …)
  │                           en cada renglón; el valor de una etiqueta es el
  │                           texto hasta la siguiente etiqueta del mismo renglón.
  │                           Cada "NO. ORDEN:" abre una orden nueva.
  ▼
mapOrden(orden)               valida y arma MappedSolicitud (ver tabla de § 7)
  ▼
parsePdfTallerData()          → { parsed: ParsedRow[], totalRawRows }
```

Detalles que importan:

- **Matching de etiquetas sin tildes, valores con tildes.** `normalizar()`
  convierte el renglón a mayúsculas sin tildes **carácter por carácter**, así
  el texto normalizado mide exactamente lo mismo que el original. Las
  etiquetas se buscan en el normalizado ("DIRECCIÓN:" ≡ "DIRECCION:") pero el
  valor se recorta del **original** con esos mismos índices. Por eso "PEÑA" se
  conserva. Si alguna vez se cambia `normalizar()`, debe seguir siendo
  1 char → 1 char.
- **Teléfono.** `elegirTelefono()` prefiere TEL. CEL., luego CASA, luego
  OFICINA; descarta placeholders de MABE (`0`, `00000`, `0000000000`) y
  números de menos de 7 dígitos. `separarTelefono()` corta en la primera
  letra porque pdf.js pega al teléfono el texto de la columna de al lado
  (ENTRE CALLES: "3208041857 APTO 102" → teléfono `3208041857`, resto
  `APTO 102`). Ese resto se anexa a la dirección.
- **ENTRE CALLES.** Normalmente trae conjunto/barrio y se anexa a la
  dirección. Si es **solo dígitos** (≥7, no todo ceros) MABE puso ahí un
  segundo celular: `telefonoAlterno()` lo saca de la dirección, lo deja en
  `novedades_equipo` como `Tel. alterno: …` y lo usa como teléfono principal
  únicamente si CEL/CASA/OFICINA no sirvieron.
- **Tipo de equipo.** `mapDescripcionProducto()` primero intenta
  `mapFamilia()` (tabla general de familias, también usada por el Excel). Si
  no hay match, busca abreviaturas de MABE **como palabra completa** (`\b`):
  `REF`/`REFRIG`/`REFRI`/`NEV` → Nevera, `NEVECON` → Nevecón, `LAV` →
  Lavadora, `SEC` → Secadora, `EST`/`COC`/`CUB` → Estufa, `HOR`/`MICRO` →
  Horno, `AA`/`AIRE`/`MINISPLIT` → Aire Acondicionado. Palabra completa evita
  que "REFLECTOR" o "ESTANTE" mapeen. Para agregar una abreviatura nueva:
  sumar una entrada a `ABREVIATURAS_PRODUCTO` y un caso en el test.
- **FECHA PROG → franja.** `parseFechaProg()` lee `dd.mm.yyyy HH:MM:SS`;
  `horaAFranja()` convierte la hora a la franja canónica (`<12` → 8am-12pm,
  `<15` → 12pm-3pm, `<18` → 3pm-6pm, resto 6pm-8pm) y
  `formatearFechaLargaCO()` arma `"miércoles, 21 de octubre · 8am-12pm"`, que
  `parsearFechaVisita()` entiende y cuenta contra el cupo por franja.
- **Errores vs warnings.** Error (la fila no se inserta): sin N° orden,
  nombre < 3, sin teléfono, sin dirección, tipo de equipo no mapeable,
  duplicado. Warning (se inserta igual): FECHA PROG ilegible o ya pasada,
  municipio vacío (default BOGOTA).

### 7.2 Caso real 2026-10-09 — "BAIRD 08.10.2026.pdf"

Tres órdenes de SOACHA. Antes del fix el preview daba 2 válidas y 1 error;
después, 3 válidas sin warnings. Lo que falló y cómo se corrigió:

| Orden | Síntoma | Causa | Fix |
|-------|---------|-------|-----|
| 9415679144 (Orlando Suárez) | "MANUFAC REF MABE NF 2P 400L BP RETIQ no tiene mapeo a tipo de equipo" | `mapFamilia` solo conocía REFRIGERADORES/REFRIG/REFRIS; "REF" solo no matcheaba | `mapDescripcionProducto` con abreviaturas MABE por palabra completa → Nevera |
| 9415679144 | Dirección terminaba en "- 3143270625" | ENTRE CALLES traía un 2º celular y se anexaba como si fuera un conjunto | `telefonoAlterno()` → va a novedades como "Tel. alterno", fuera de la dirección |
| 9415679415 (Laura Daniela Peña Sierra) | Nombre guardado como "PENA" | Los valores se recortaban del renglón normalizado (sin tildes) | `normalizar()` alineado 1:1 y slice del renglón original |

Commit `ee91e36`. Tests de regresión con las líneas reales del PDF en
`src/__tests__/utils/pdf-orden-mapping.test.ts` (describe
`'PDF 2026-10-08 — abreviaturas, teléfono alterno y tildes'`).

**Cómo reproducir un dry-run sin tocar la BD** (útil para un PDF nuevo que
falle en el preview): crear temporalmente un test en `src/__tests__/` que lea
el PDF con `unpdf`, pase los items por `reconstruirLineas` y luego por
`parsePdfTallerData`, e imprima `lineas` y el resultado con `console.log`.
Las líneas impresas son exactamente lo que ve el parser y sirven para armar
el caso de test definitivo.
