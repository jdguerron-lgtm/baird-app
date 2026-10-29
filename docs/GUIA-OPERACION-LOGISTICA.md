# Guía de operación — panel de Baird Service (logística)

> Esta guía explica, paso a paso y en lenguaje no técnico, cómo se opera la
> plataforma desde el panel `/admin`. Está pensada para el equipo de logística
> (rol **solo lectura**) y para quien administra la plataforma. Se lee dentro
> del panel en **📘 Guía** (`/admin/guia`) y su fuente es el archivo
> `docs/GUIA-OPERACION-LOGISTICA.md` del repositorio: si algo cambia en la
> plataforma, se actualiza acá y el panel lo muestra en el siguiente deploy.
>
> Última revisión: 2026-10-22. Verificada contra las pantallas reales del panel.

---

## 1. Para quién es esta guía y cómo usarla

- **Logística (Encompass)**: entra al panel con el rol de solo lectura. Puede
  consultar todo (casos, pagos, repuestos, cumplimiento, liquidaciones) y
  descargar los Excel, pero no puede modificar nada. Usa esta guía para
  entender qué significa cada pantalla y qué hacer con lo que ve.
- **Administración (Baird)**: además de consultar, ejecuta las acciones
  (editar, reagendar, reenviar mensajes, devolver pagos, cambiar estados).
  Cada sección marca con **[solo admin]** lo que el rol de lectura no puede
  hacer.
- Cada sección empieza con *dónde* está la pantalla y sigue con *qué se ve*
  y *qué hacer*. El buscador de arriba de esta página filtra por palabra
  (por ejemplo `repuesto`, `Wompi`, `quincena`).

---

## 2. Entrar al panel y qué puede hacer cada rol

### 2.1 Cómo entrar

1. Abre `https://lineablanca.bairdservice.com/admin/login`.
2. Escribe tu **Email** y tu **Contraseña** y pulsa el botón de entrar.
3. Si es tu primer ingreso o no recuerdas la clave, usa el enlace
   **"¿Olvidaste tu contraseña?"**: te llega un correo con un link para crear
   una contraseña nueva. La cuenta la crea Baird; si tu correo no está
   autorizado, el panel te saca aunque la clave sea correcta.
4. Para salir: botón **🚪 Cerrar sesión** al final del menú izquierdo.

### 2.2 Cómo saber con qué rol entraste

- Debajo del logo, en el menú izquierdo, aparece **admin** o la etiqueta
  **🔒 logística · solo lectura**.
- Con rol de lectura, además, hay una franja ámbar fija arriba de cada
  pantalla: *"Modo solo lectura. Puedes consultar todos los casos, pagos y
  repuestos, pero ninguna acción de edición está habilitada para esta cuenta."*

### 2.3 Qué puede y qué no puede el rol de lectura

| Puede | No puede |
|---|---|
| Ver todas las solicitudes, su ficha completa, el historial, las notas, las llamadas y la evidencia (fotos, videos, firmas) | Editar datos de una solicitud, reagendar, cambiar el estado, agregar notas o registrar llamadas |
| Ver el ledger de pagos online de cada servicio y la etapa de pago | Devolver pagos, fijar el cobro final, actualizar el valor al cliente |
| Ver repuestos pendientes, reservas incumplidas, técnicos, supervisores, códigos de descuento, garantías, mapa, alertas GPS y errores | Marcar repuestos recibidos, notificar técnicos, reenviar mensajes, pedir repuestos a supervisores, crear o editar descuentos o supervisores, verificar técnicos |
| Descargar todos los Excel: resumen de solicitudes, ficha de facturación, liquidaciones y paquete de facturación | Entrar a **Carga Masiva**, **Testing**, **Accesos**, **Finanzas** ni **Pagos técnicos** (no aparecen en el menú) |

Si con rol de lectura pulsas un botón de acción, la plataforma lo corta en
el navegador y muestra el aviso *"Modo solo lectura"*. No pasa nada en la
base de datos. Si necesitas que se ejecute una acción, pídesela al
administrador (ver § 12).

---

## 3. El panel de un vistazo

### 3.1 Menú izquierdo

| Ítem | Para qué sirve | Sección de esta guía |
|---|---|---|
| 📊 Dashboard | Indicadores generales y accesos rápidos | § 3.3 |
| 📋 Solicitudes | Lista de todos los servicios y su ficha | § 4 |
| ⏰ Incumplidos | Visitas que no se atendieron el día reservado | § 7 |
| 🗺️ Mapa | Servicios ubicados en el mapa por fecha de visita | § 3.4 |
| 💵 Pricing pendiente | Cotizaciones particulares con repuesto que esperan precio del admin | § 5.3 |
| 🔧 Técnicos | Técnicos registrados, verificación y portal | § 3.4 |
| 👥 Supervisores | Personas de la marca que reciben avisos por WhatsApp | § 6.4 |
| 📦 Repuestos | Repuestos pendientes y recibidos | § 6 |
| 🚨 Alertas GPS | Servicios marcados por ubicación sospechosa tras la visita | § 3.4 |
| 📡 Errores conexión | Errores técnicos reportados por los portales | § 3.4 |
| 🏷️ Descuentos | Códigos de descuento para clientes particulares | § 8.5 |
| 💰 Liquidaciones | Excel de pagos a técnicos, MABE, particulares y facturación | § 9 |
| 🛡️ Garantías | Resumen de garantías por marca y tipo de equipo | § 3.4 |
| 📘 Guía | Esta guía | — |
| 📁 Carga Masiva, 🧪 Testing, 🔑 Accesos, 📈 Finanzas, 💸 Pagos técnicos | Herramientas de escritura **[solo admin]**; el rol de lectura no las ve | — |

### 3.2 Buscador global

Arriba del menú hay un cuadro **🔍 Cliente, caso, orden, teléfono…**. Escribe
parte del nombre del cliente, el código del caso, el N° de orden MABE o el
teléfono y te lleva a la ficha. Es la forma más rápida de llegar a un
servicio cuando el cliente llama.

### 3.3 Dashboard (`/admin`)

Tarjetas de arriba:

- **⏰ Sin atender**: visitas reservadas en los últimos 30 días que ya pasaron
  y nadie atendió (siguen abiertas). Se pinta en rojo si hay alguna. Clic →
  Incumplidos (§ 7).
- **Pendientes / Verificados / Rechazados**: técnicos según su estado de
  verificación. Clic → lista de técnicos filtrada.
- **Solicitudes total** y **Sol. activas** (en horario pendiente, notificadas
  o asignadas).

Bloque **📚 Guías**: la Guía del Supervisor, la Guía de pagos al técnico y la
Guía del técnico (uso de la plataforma), con botones **Abrir** y **Compartir**
(abre WhatsApp con el link listo para enviar).

Bloque **Registros recientes**: los últimos técnicos registrados.

### 3.4 Otras pantallas de consulta

- **Mapa** (`/admin/mapa`): cada servicio con dirección geocodificada aparece
  como un punto. Filtra por rango de fecha de visita (atajo "Hoy a +7 días"),
  busca por cliente, dirección o equipo, y al tocar un punto ves cliente,
  equipo, dirección, estado, técnico y horario. Si una dirección no se pudo
  ubicar con precisión aparece "⚠ ubicación aproximada".
- **Técnicos** (`/admin/tecnicos`): lista con buscador por nombre, ciudad o
  documento; columnas Técnico, Ciudad, Especialidades, Estado (pendiente /
  verificado / rechazado), Registro y Portal (abrir o copiar el link del
  portal del técnico). Los íconos junto al nombre indican si atiende gas y
  si ya entregó el contrato firmado. La ficha de cada técnico muestra sus
  datos, documentos, certificaciones, auxiliares, contrato y verificación
  **[solo admin para cambiar algo]**. El bloque **🚫 Restricciones y
  penalización** permite marcar que el técnico **no reciba servicios de
  garantía** y/o **no reciba servicios particulares (posgarantía)** **[solo
  admin]** — bloqueado no recibe esas ofertas, no sale en el selector del
  cliente y no se le puede asignar a mano — y muestra cuántos incumplimientos
  lleva en los últimos 30 días y cuántos minutos se le retrasan las ofertas.
- **Garantías** (`/admin/garantias`): resumen de servicios de garantía por
  marca y por tipo de equipo (cuántos notificados, completados, etc.) y lista
  de los servicios.
- **Alertas GPS** (`/admin/gps-alertas`): servicios donde, 30 minutos o más
  después de "completar", el GPS del técnico seguía a menos de 100 m de la
  casa del cliente. Es una señal silenciosa para revisar; no bloquea nada.
- **Errores conexión** (`/admin/errores`): errores técnicos que reportan los
  portales del técnico y del cliente (página que no cargó, consulta fallida).
  Sirve para que el equipo técnico diagnostique; logística solo lo consulta
  si un técnico dice "la página no me abre".

---

## 4. Ciclo de una solicitud

### 4.1 Cómo nace y cómo avanza un servicio

1. **Entra la solicitud**: el cliente la crea en el formulario público
   `/solicitar` (particular o garantía) o Baird la carga desde el Excel /
   PDF de órdenes MABE (**Carga Masiva**, solo admin).
2. **Horario**: desde el formulario la plataforma confirma sola la primera
   opción de fecha que eligió el cliente. Solo las cargas masivas (sin fecha)
   o un choque de cupo dejan la solicitud en *Pendiente horario* hasta que el
   cliente elige por WhatsApp.
3. **Oferta a técnicos**: con el horario confirmado, la oferta sale por
   WhatsApp a los técnicos verificados que cubren la ciudad y el tipo de
   equipo (*Notificada*). Si el cliente eligió un **técnico de preferencia**,
   la primera oferta va solo a él; los reenvíos van a todos.
4. **Aceptación**: el primer técnico que pulsa "Aceptar" se la queda
   (*Asignada*). El cliente recibe los datos del técnico y, en particular, el
   link para pagar el anticipo — es el **único momento** en que se le cobra
   el anticipo: antes de tener técnico no paga nada (desde 2026-10-29).
5. **Visita y diagnóstico**: el técnico registra el diagnóstico desde su
   portal y elige el siguiente paso: reparar, esperar repuesto, no reparable
   o el cliente no quiere reparar.
6. **Aprobación del cliente**: en garantía el cliente aprueba el siguiente
   paso; en particular aprueba o rechaza la cotización.
7. **Reparación y cierre**: el técnico completa con fotos, checklist y firma
   (*Cliente debe confirmar servicio*). El cliente confirma satisfecho
   (*Completada*) o reporta un problema (*En disputa*).

Si hace falta repuesto, entre el paso 5 y el 7 hay un ciclo aparte (§ 6).

### 4.2 Glosario de estados (lo que ves en la columna "Estado")

| Estado (como aparece) | Qué significa en la operación | Quién tiene la pelota |
|---|---|---|
| `pendiente_horario` — Pendiente horario | Se creó la solicitud y el cliente aún no confirma fecha (normalmente dura segundos; se queda ahí en cargas masivas o si ambas opciones de fecha estaban llenas) | Cliente |
| `sin_agendar` — Sin agendar | Pasaron 36 h sin que el cliente confirmara fecha. Cierre automático. Se puede revivir reenviándole la selección de horario | Nadie (cerrado) |
| `notificada` — Notificada | Fecha confirmada y oferta enviada a los técnicos; ninguno ha aceptado todavía | Técnicos |
| `asignada` — Asignada | Un técnico aceptó; la visita está pendiente | Técnico (ir a la visita) |
| `aprobacion_paso_pendiente` — Cliente debe aprobar siguiente paso | **Garantía**: el técnico envió el diagnóstico y el cliente debe aprobar lo que propone (reparar, esperar repuesto, etc.) | Cliente |
| `pendiente_pricing` — Pendiente tiempo entrega (admin) | **Particular con repuesto**: el admin debe fijar el precio de los repuestos y el tiempo de entrega antes de que salga la cotización (§ 5.3) | Admin |
| `cotizacion_enviada` — Cotización enviada | **Particular**: el cliente recibió la cotización y debe aprobarla o rechazarla | Cliente |
| `cotizacion_rechazada` — Cotización rechazada | El cliente rechazó la cotización. Cierre | Nadie (cerrado) |
| `esperando_repuesto` — Esperando repuesto | Falta un repuesto. En garantía lo gestiona la marca (supervisor); en particular el técnico lo compra tras el abono del cliente | Supervisor o técnico |
| `repuesto_en_camino` — Repuesto en camino | El supervisor subió la guía de envío; el cliente debe agendar la visita de finalización | Cliente |
| `repuesto_recibido` — Repuesto recibido | Se marcó el repuesto como recibido; el cliente debe elegir nueva fecha | Cliente |
| `en_proceso` — En proceso | Reparación en curso (misma visita o visita de finalización ya agendada) | Técnico |
| `confirmacion_pendiente` — Cliente debe confirmar servicio | El técnico completó (fotos, checklist, firma); el cliente debe confirmar que quedó bien | Cliente |
| `completada` — Completada | El cliente confirmó satisfecho. Cierre. Es el estado que entra a liquidaciones y facturación | Nadie (cerrado) |
| `en_disputa` — En disputa | El cliente reportó un problema al confirmar o rechazó el siguiente paso. Hay que llamar y resolver | Admin |
| `finalizado_sin_reparacion` — Finalizado sin reparación | El técnico determinó que el equipo no tiene arreglo. Cierre | Nadie (cerrado) |
| `reparacion_rechazada` — Reparación rechazada por cliente | Tras el diagnóstico el cliente decidió no reparar. Cierre | Nadie (cerrado) |
| `cancelada` — Cancelada | El cliente canceló desde su portal (o el admin la canceló). Si fue con menos de 4 h de anticipación queda marcada como cancelación tardía. Cierre | Nadie (cerrado) |
| `no_show_cliente` — No-show del cliente | El cliente no estaba en la visita, con evidencia. Cierre | Nadie (cerrado) |

Reglas útiles:

- **Reagendar no cambia el estado**: la solicitud conserva *Asignada* (o
  *Notificada*) y solo cambia la fecha.
- El cliente puede **cancelar o reagendar solo** desde su portal
  `/servicio/{token}` (el link está en su WhatsApp de confirmación y en la
  ficha, campo "Portal cliente"). Puede reagendar máximo 2 veces; después
  tiene que llamar.
- Los estados "cerrados" no mandan más mensajes automáticos.

### 4.3 La lista de solicitudes (`/admin/solicitudes`)

Qué hay en la pantalla:

- Botón **📥 Descargar resumen Excel**: todas las solicitudes (cliente,
  técnico, evidencias, eventos, GPS) en un Excel. Disponible para lectura.
- Selector **📋 Lista / 🗓️ Calendario**: el calendario muestra la agenda por
  día y franja (cuántas visitas hay en cada franja y de qué técnico).
- **Chips de filtro** (uno a la vez):
  - **Todos**.
  - **📣 Sin técnico**: ofertadas a técnicos que nadie ha aceptado
    (*Notificada* sin técnico). Es la lista que se revisa a diario para
    reenviar la oferta (§ 11.3).
  - **🔩 Pendientes por repuesto**: servicios detenidos por un repuesto, en
    cualquiera de los tres estados del ciclo (esperando → en camino →
    recibido). Debajo del estado aparece el repuesto que esperan (SKU y
    descripción, y "(recibido)" si ya llegó).
  - **Pendiente horario**, **Notificada**, **Asignada**, **Completada**,
    **Cancelada**: filtran por ese estado exacto.
  - **Sin facturar** (próximamente): filtrará los servicios completados que
    contabilidad aún no ha facturado (ver § 9.6).
- Selector **👷 Todos los técnicos**: muestra solo los servicios asignados a
  un técnico. Se combina con el chip de estado.
- Cuadro **Buscar por cliente, teléfono, orden, ciudad, equipo o ID**.

Columnas de la tabla:

| Columna | Qué muestra |
|---|---|
| Cliente | Nombre y WhatsApp |
| Equipo | Tipo de equipo y marca |
| Ciudad | Ciudad y zona |
| Valor | **Garantía**: lo que se le pagará al técnico (o "desde $…" si aún no hay diagnóstico). **Particular**: lo que paga el cliente, con la **etiqueta de etapa de pago** debajo (anticipo pendiente, anticipo pagado, abono pendiente, saldo pendiente, pagado total, etc.) |
| Estado | El estado actual; en estados de repuesto, el repuesto que espera |
| Asignado a | Nombre del técnico, o "Sin asignar" |
| Fecha | Fecha de creación de la solicitud |
| Ver detalle → | Abre la ficha |

La lista se refresca sola cada 30 segundos (los pagos que entran por Wompi
aparecen sin recargar).

Si marcas una o varias casillas aparece una barra con **📥 Descargar
selección** (Excel solo de esas), **📣 Reenviar a técnicos** **[solo admin]**
(vuelve a enviar la oferta por WhatsApp a los técnicos compatibles de cada
solicitud seleccionada; las que ya tienen técnico o están cerradas se omiten)
y **Eliminar** **[solo admin]** (borra solicitudes cargadas por error; pide
confirmación).

### 4.4 La ficha de una solicitud (`/admin/solicitudes/{id}`)

Arriba: **Solicitud #XXXXXXXX** (los 8 primeros caracteres del ID; en
particular es también el **código de servicio `BS-XXXXXXXX`** que ves en Wompi
y en facturación), el estado actual y el botón **📥 Descargar resumen** (Excel
de esta sola solicitud). La ficha se refresca sola cada 10 segundos mientras
el servicio está abierto.

Bloques, de arriba hacia abajo:

1. **Datos del cliente**: nombre, WhatsApp, dirección, ciudad, zona, horario
   confirmado, **Portal cliente (cancelar/reagendar)** (el link del cliente;
   sirve para reenviárselo si lo perdió) y, si aplica, **Recibe el servicio
   (no es el titular)**: la persona que el técnico registró como receptora.
   Botón **✏️ Editar** **[solo admin]** para corregir dirección, ciudad, zona,
   celular, tipo o marca de equipo (queda en el historial).
2. **Equipo y servicio**: tipo de equipo, marca, tipo de solicitud, problema
   reportado, si es **Garantía** y el **N° de orden / garantía MABE**.
3. **💰 Cuentas del servicio**: en garantía, arriba una tira de chips con los
   factores del bono — **⏱️ TA** (horas entre el horario confirmado y el
   diagnóstico; límite 24 h), **📅 días de solución** (brutos, pausa y netos,
   con la fila de la tabla MABE que aplica), **📦 pausa por repuesto** (desde el
   diagnóstico hasta que el repuesto se recibe en el sistema; "abierta" si aún
   se espera), **🗓️ finde/festivo** (aplica si el técnico diagnosticó o cerró en
   sábado, domingo o festivo) y **⭐ encuesta** (calificación del cliente) — y
   debajo el desglose MABE (tarifa por complejidad, bono por tiempo de
   solución, recargo fin de semana, total que factura Baird a MABE, pago al
   técnico, margen Baird). Dice si es **proyección** (servicio abierto) o
   **consolidado** (lo que liquida 💰 Liquidaciones). En particular, el
   código `BS-…`, el total que paga el cliente (IVA incluido), base gravable,
   IVA, pago al técnico, margen, descuento aplicado si lo hay, y el botón
   **🧾 Ficha de facturación** (§ 9.2). Antes del diagnóstico el bloque dice
   "Pendiente de diagnóstico".
4. **Cobros al cliente** (solo particular): la barra de etapa de pago y el
   **ledger de pagos online** (§ 8.2), con **🔄 Verificar pagos en Wompi** y
   las acciones de devolución **[solo admin]**.
5. **Diagnóstico del técnico**: código y descripción de la falla (garantía),
   diagnóstico escrito, complejidad, siguiente paso elegido, **🔧 Productos
   necesarios** (SKU, cantidad, descripción) y **✨ Productos recomendados**.
6. **Técnico asignado**: nombre, WhatsApp, ciudad, especialidades; si el
   cliente lo pidió como preferido; y **Equipo que visita** (auxiliares que
   acompañan al técnico, solo los verificados son visibles al cliente).
7. **Notificaciones WhatsApp**: a qué técnicos se les ofreció el servicio y
   qué pasó con cada oferta (enviado, aceptado, invalidado, error, expirado).
8. **Cambiar fecha de servicio** **[solo admin]**: nueva fecha, franja y
   motivo → **📅 Reprogramar y notificar** (avisa al cliente, al técnico y a
   los supervisores). Si la franja está llena aparece "Cupo lleno — forzar".
9. **Galería completa del servicio / Evidencia del servicio**: fotos y
   videos del diagnóstico (🔍), de la completación (✅) y los archivos que
   subió el equipo Baird (📎), más checklist, firma del cliente, firma y
   juramento del técnico y la posición GPS al completar. El admin puede subir
   evidencia adicional (fotos, videos, PDF) **[solo admin]**.
10. **Diagnóstico de matching** + botón **Notificar técnicos** **[solo
    admin]**: muestra qué técnicos cumplen ciudad y especialidad y permite
    reenviar la oferta. Si la solicitud ya tiene técnico, el botón se
    desactiva (para reasignar usar **🔁 Cambiar técnico**, abajo).
    **🔁 Cambiar técnico** (en la tarjeta *Técnico asignado*; sin técnico dice
    **Asignar técnico manualmente**) **[solo admin]**: cuando la programación
    quedó mal, eliges directamente quién va. La lista muestra primero a los
    que cubren la ciudad y el equipo, luego al resto de verificados. Al
    asignar, el técnico nuevo recibe los datos del cliente y su portal, el
    cliente recibe el aviso con el carnet del técnico nuevo y el anterior un
    mensaje de que ya no tiene que ir (casilla para no avisar a nadie). No
    vuelve a cobrar el anticipo. Si el técnico nuevo ya tiene la franja llena
    pregunta antes de asignarlo. La casilla **Contar como incumplimiento**
    (marcada por defecto) le suma un incumplimiento al técnico anterior para
    la penalización (§ 7). Diferencia con **🔓 Liberar técnico y reofertar**:
    liberar lo ofrece a todos y espera a que alguien acepte.
11. **Reenviar último mensaje del flujo** **[solo admin]**: reenvía al
    cliente el último WhatsApp que le correspondía según el estado (por
    ejemplo la selección de horario o la cotización), y **📲 Reenviar portal
    al técnico** le reenvía al técnico el mensaje con el botón "Abrir portal".
12. **Actualizar valor del servicio** (particular) **[solo admin]**: cambia
    el precio al cliente antes del cierre y le reenvía la cotización para que
    la vuelva a aprobar. No cambia el pago del técnico.
13. **Cobro final del servicio** (particular, al completar) **[solo admin]**:
    fija el valor final y envía el link del saldo por Wompi (**💳 Fijar cobro
    y enviar por Wompi**). Se usa en tarifa fija o cuando hubo un ajuste en
    sitio.
14. **Pedir repuestos en garantía** **[solo admin]**: botón **📦 Pedir
    repuesto a supervisores** (§ 6.3).
15. **Cambiar estado manualmente** **[solo admin]**: herramienta de rescate
    cuando el flujo se atascó (por ejemplo el técnico completó pero perdió
    señal). Mueve el estado sin enviar WhatsApp al cliente ni al técnico (sí
    avisa a supervisores) y queda en el historial con el motivo.
16. **📞 Llamadas del equipo**: registro de las llamadas hechas al cliente
    (hora y qué se habló) y las que el técnico intentó desde su portal.
    **Registrar llamada** es **[solo admin]**.
17. **Notas del administrador**: notas internas. No se envían a nadie, no se
    borran (si te equivocas, agrega otra nota aclarando). **Guardar nota** es
    **[solo admin]**.
18. **Historial de estados**: línea de tiempo de todo lo que pasó, con fecha,
    hora y quién lo disparó (cliente, técnico, admin, sistema): cambios de
    estado, cancelaciones, reagendamientos, recordatorios, ediciones de
    datos, mensajes de WhatsApp enviados al cliente (y si Meta reportó que
    falló), pagos registrados y devoluciones (↩️), comprobantes subidos por
    supervisores, evidencia adicional. Los eventos ⚠️ con "requiere
    intervención" son los que hay que mirar primero.

### 4.5 Cómo "leer" una solicitud en 30 segundos

1. Estado y fecha de visita (Datos del cliente).
2. ¿Tiene técnico? Si no, revisar Notificaciones WhatsApp: ¿a cuántos se les
   ofreció? ¿hubo errores?
3. En particular: etiqueta de etapa de pago (¿pagó el anticipo?).
4. Historial: último evento y cualquier ⚠️.
5. Notas y llamadas: qué ya se habló con el cliente.

---

## 5. Garantía MABE vs servicio particular

El campo **Garantía** se fija al crear la solicitud y nunca cambia. Define
quién paga y qué pasos tiene el flujo.

| Aspecto | Garantía (MABE / GE / Centrales) | Particular |
|---|---|---|
| Quién paga | La marca le paga a Baird una tarifa fija por complejidad de la falla | El cliente le paga a Baird |
| Identificador | **N° de orden / garantía MABE** (en la ficha y en el buscador) | Código de servicio `BS-XXXXXXXX` |
| Cobro al cliente | Ninguno | Anticipo al aceptar el técnico, abono si hay repuestos, saldo al completar (§ 8) |
| Tras el diagnóstico | El cliente aprueba el siguiente paso por WhatsApp | El cliente recibe una cotización y la aprueba o rechaza |
| Repuestos | Los gestiona la marca a través del **supervisor** (pide, envía con guía, entrega) | Los compra el técnico con el abono del cliente |
| Pago al técnico | Tarifa MABE por complejidad + bonos por tiempo de solución y encuesta (se consolida al cerrar, con la calificación del cliente) | Lo que el técnico cotizó (más $35.000 fijos por la visita de diagnóstico) |
| Facturación | Una factura consolidada a MABE por quincena (§ 9.5) | Una factura por servicio (§ 9.2) |

### 5.1 Detalles de garantía que importan en la operación

- El **N° de orden** es la llave con la marca: aparece en la lista, en la
  ficha, en el resumen diario a supervisores y en la relación de órdenes de
  la factura a MABE. Si una orden llega sin número, pedirlo antes del cierre.
- El pago al técnico que ves antes de cerrar es una **proyección**; el
  consolidado real usa la calificación del cliente, el tiempo de atención y
  los días que el servicio estuvo pausado por repuesto.
- Un servicio de garantía que necesita repuesto pasa **directo** a *Esperando
  repuesto* desde el diagnóstico y los supervisores reciben el requerimiento
  exacto (SKU, cantidad, descripción, N° de garantía, dirección).

### 5.2 Detalles de particular

- **Cotización**: el técnico ingresa lo que quiere ganar y la plataforma
  calcula sola el total al cliente (utilidad Baird + comisión de pasarela +
  IVA). La cotización sale al cliente apenas el técnico guarda el
  diagnóstico; el admin no la revisa antes, salvo el caso de § 5.3.
- **Tarifa fija (Mantenimiento / Cambio de filtro)**: el precio al cliente y
  el pago al técnico quedan fijos desde la solicitud; no hay cotización. El
  técnico va directo a "Completar servicio" y el saldo se cobra al cerrar. El
  técnico también puede, en un Diagnóstico/Reparación, elegir "Reparación con
  precio predeterminado (mantenimiento)" para cobrar con esa tabla.
- **Receptor del servicio**: si quien recibe al técnico no es el titular, el
  técnico lo registra y esa persona recibe copia de los mensajes posteriores
  al diagnóstico (cobros incluidos) después de aceptar los términos.

### 5.3 Pricing pendiente (`/admin/cotizaciones-pendientes`) [solo admin]

Solo entra aquí un caso: **particular + esperar repuesto**. La cotización no
sale hasta que el admin fija **Mano de obra**, **Repuestos** y el **tiempo de
entrega** y pulsa **Fijar precio y tiempo**. La pantalla muestra el
diagnóstico del técnico, los repuestos que pidió y el cálculo de utilidad e
IVA. Mientras esté ahí, el estado es *Pendiente tiempo entrega (admin)* y
el cliente no ha recibido nada: revisarla a diario.

---

## 6. Repuestos

### 6.1 El ciclo

```
Diagnóstico con "esperar repuesto"  →  esperando_repuesto
     garantía: supervisores reciben el requerimiento (SKU x cantidad)
     particular: cliente paga abono → técnico compra
→ supervisor sube la guía de envío  →  repuesto_en_camino  → cliente agenda visita final
→ supervisor marca "entregado", admin marca "recibido" o el técnico pulsa
  "📦 Llegó el repuesto" en su portal  →  repuesto_recibido  → cliente elige fecha
→ cliente agenda  →  en_proceso  →  técnico completa
```

- El técnico **no queda bloqueado** por el repuesto: en cualquiera de los tres
  estados de repuesto su portal le deja "Completar servicio". Si lo hace, los
  repuestos pendientes de esa solicitud pasan solos a *recibido* y en el
  historial de la ficha queda la nota "completó el servicio mientras estaba
  en esperando_repuesto". No hay que marcarlos a mano.

### 6.2 Pantalla Repuestos (`/admin/repuestos`)

- Chips **Pendientes / Recibidos / Todos**.
- Cada tarjeta muestra el **SKU**, el estado del repuesto (`pendiente` /
  `recibido` / `cancelado`), la etiqueta **Garantía** si aplica, la
  descripción, el equipo y el cliente, tiempo estimado, costo (si lo hay) y
  fecha en que se pidió. **Ver solicitud →** abre la ficha.
- **✅ Marcar recibido** **[solo admin]**: úsalo cuando el repuesto ya está
  en manos del cliente y el supervisor no lo marcó desde su portal. Cuando
  todos los repuestos de la solicitud están recibidos, el servicio pasa a
  *Repuesto recibido* y el cliente recibe el WhatsApp con el botón para
  agendar la visita de finalización.
- El banner verde recuerda que los repuestos se compran en la tienda
  oficial `tienda.bairdservice.com`.

### 6.3 Pedido a supervisores (garantía)

- Regla: el pedido **solo sale si la solicitud tiene al menos un repuesto
  con SKU** registrado por el técnico en el diagnóstico. Sin SKU la
  plataforma no envía nada (muestra "Sin repuesto especificado") y tampoco
  deja pasar a mano el estado a *Esperando repuesto*. Solución: pedirle al
  técnico que corrija el diagnóstico con el SKU.
- Se envía automáticamente al diagnosticar. Para reenviarlo: ficha → bloque
  **Pedir repuestos en garantía** → **📦 Pedir repuesto a supervisores**
  **[solo admin]**. Va a los supervisores con visibilidad de esa marca e
  incluye SKU, modelo, N° de garantía, dirección y diagnóstico. No cambia el
  estado.
- Recordatorio automático: si un servicio de garantía sigue en *Esperando
  repuesto*, a los 3, 6 y 9 días se vuelve a avisar a los supervisores (máximo
  3 veces). Si está *Repuesto en camino* y el cliente no agenda, se le
  recuerda cada 3 días (máximo 2).

### 6.4 Supervisores (`/admin/supervisores`)

Son personas de la marca (o de Baird) que reciben por WhatsApp un aviso en
cada cambio de estado de los servicios de su alcance y entran a un portal de
solo lectura con link personal. Cada supervisor tiene **Nombre**,
**WhatsApp**, **Ámbito** (todos / garantía / particular), **Marca**
(opcional; vacío = todas), **Estados** que quiere recibir (opcional; ninguno =
todos) y **Activo**. Crear, editar o enviar el link de acceso es **[solo
admin]**; el rol de lectura ve la lista.

**Resumen diario**: a las 5:00 pm (hora Colombia) cada supervisor activo
recibe un solo mensaje con todos los cambios de estado del día de sus
servicios, agrupado por servicio (cliente, equipo, N° de garantía, ciudad,
hora y quién movió el estado) y con el repuesto en espera si lo hay. Si no
hubo movimientos dice "sin movimientos hoy". El texto completo solo llega si
el supervisor le escribió a la línea de WhatsApp ese día (basta un "ok"); si
no, recibe una versión corta con el botón a su portal. Desde su portal el
supervisor sube la **guía de envío** del repuesto y marca cuándo el repuesto
ya está en manos del cliente.

---

## 7. Reservas incumplidas (`/admin/incumplidos`)

Qué es: las visitas que **no se atendieron el día reservado**. Una reserva
cuenta como atendida si ese día hubo ping GPS del técnico, diagnóstico
enviado o servicio completado. Hoy y el futuro no se evalúan.

Arriba se elige el período **por día de reserva** (Reservas desde / Hasta y
atajos Últimos 7 días, Últimos 30 días, Este mes, Mes pasado, Todo).

Tarjetas:

- **Reservas vencidas**: todas las reservas del período que ya pasaron.
- **Sin atender (abiertas)**: vencidas con técnico que siguen abiertas +
  vencidas sin técnico. Es la cifra que hay que bajar.
- **Atendidas tarde**: se atendieron, pero días después de la fecha.
- **A tiempo** y **Cumplimiento** (a tiempo ÷ (a tiempo + incumplidas); se
  pinta en rojo bajo 80 %).

Tabla **Por técnico**: reservas, sin atender, tarde, a tiempo y cumplimiento
de cada técnico ("Sin técnico (nadie aceptó)" agrupa las que nadie tomó).
Clic en una fila filtra el detalle de abajo.

Detalle: chips **Incumplidas / Solo pendientes / Todas las reservas** y orden
**Prioridad / Urgencia / Fecha de reserva**. Cada fila muestra:

| Columna | Qué muestra |
|---|---|
| Prioridad | **alta**, **media** o **baja**, con las veces que se reagendó y los días desde que entró la solicitud |
| Reserva | Día y franja reservados |
| Resultado | *Vencida sin atender*, *Vencida sin técnico*, *Atendida tarde* (con cuántos días después y qué evidencia), *Atendida a tiempo*, *Cerrada sin visita*, *Sin evidencia (histórico)* |
| Cliente, Equipo, Técnico, Estado actual | Para ubicar el caso; "Ver detalle →" abre la ficha |

Cómo se calcula la prioridad:

| Nivel | Regla | Qué hacer |
|---|---|---|
| **Alta** | 2 o más reagendamientos, **o** 15 días o más desde que entró la solicitud | Atender hoy: llamar al cliente, confirmar nueva fecha y asegurar técnico. Si no hay técnico, reenviar la oferta (§ 11.3) o buscar uno a mano |
| **Media** | 1 reagendamiento, **o** entre 7 y 14 días desde la solicitud | Contactar en el día y dejar nota en la ficha |
| **Baja** | Sin reagendar y menos de 7 días | Revisar en el barrido diario |

Rutina sugerida: cada mañana abrir **Solo pendientes** ordenadas por
**Prioridad**, empezar por las altas, y dejar en cada ficha una nota o
llamada registrada con lo acordado **[la nota la escribe el admin; logística
reporta por el canal del equipo]**. Si la visita se atendió pero el técnico
no registró nada (no envió diagnóstico ni completó), aparece como vencida:
pedirle que lo registre desde su portal.

---

## 8. Cobros y devoluciones (particular)

### 8.1 Las tres etapas de pago por Wompi

| Etapa | Cuándo se cobra | Cuánto | Qué pasa al pagar |
|---|---|---|---|
| **Anticipo** | **Solo cuando un técnico acepta** (link por WhatsApp). Al enviar la solicitud el cliente no paga nada; si abre el link de pago sin técnico asignado ve "Aún no tienes técnico asignado" | 50 % del valor del servicio (diagnóstico, mantenimiento o cambio de filtro) | Confirma la reserva; cliente y técnico reciben aviso |
| **Abono de repuestos** | Cuando el cliente aprueba una cotización **con** repuestos | 50 % del saldo | El técnico recibe aviso de que puede comprar los repuestos |
| **Saldo** | Cuando aprueba una cotización **sin** repuestos, o al completar el servicio (o cuando el admin fija el cobro final) | Total − lo ya pagado (− descuento si tiene código) | Cliente y técnico reciben aviso; el técnico sabe que no debe cobrar nada en sitio |

La **etiqueta de etapa** (en la lista y en la ficha) resume dónde va el
cobro: sin cobro → anticipo pendiente → anticipo pagado → abono pendiente →
abono pagado → saldo pendiente → pagado total; también "sin pago online" y
"pago parcial · cerrado". Solo refleja pagos **online por Wompi**: un pago en
sitio con QR o transferencia no aparece.

Los **códigos de descuento** (§ 8.5) se restan únicamente en el saldo final.

### 8.2 El ledger de pagos en la ficha

Ficha → bloque **Cobros al cliente**. Cada fila es una transacción de Wompi:
tipo (anticipo / abono / saldo), monto, método (tarjeta, PSE, Nequi,
Bancolombia), fecha, N° de transacción y estado (`APPROVED` = acreditado,
`VOIDED` = devuelto, `DECLINED` = rechazado por el banco). Debajo, el total
pagado y lo pendiente.

**🔄 Verificar pagos en Wompi**: si el cliente dice que pagó y no aparece,
pulsa este botón (opcionalmente pega el **N° de transacción** que sale en el
comprobante de Wompi). Consulta Wompi y registra el pago si corresponde a este
servicio. Es seguro repetirlo. Además, un proceso automático cada 5 minutos
revisa en Wompi los cobros pendientes de los servicios abiertos.

### 8.3 Cuándo devolver un pago

| Situación | Qué devolver |
|---|---|
| El cliente cancela antes de la visita y pagó el anticipo | El anticipo completo |
| Baird cancela (no hay técnico, no se puede atender) o el técnico no se presentó y el cliente no quiere reprogramar | Todo lo pagado |
| El cliente pagó dos veces el mismo cobro (en el historial aparece ⚠️ "segundo pago") | Solo el segundo pago |
| Se cobró de más | La diferencia: la app no hace devoluciones parciales; se hace desde el panel de Wompi o por transferencia y se registra como manual |
| No-show del cliente con evidencia | Nada, salvo decisión del admin |

Regla práctica: **si el pago fue con tarjeta y es el mismo día, devuélvelo
hoy**: se anula sin costo y el cargo desaparece. Al día siguiente ya es un
reembolso y Wompi no devuelve su comisión. Siempre que se pueda, ofrecer
primero **reprogramar conservando el anticipo**.

### 8.4 Cómo se hace la devolución [solo admin]

1. Ficha → **Cobros al cliente**. Si el servicio está cancelado y tiene pagos
   aprobados, aparece el aviso ⚠️ "revisa si corresponde devolverlo".
2. Ubica el pago (solo los `APPROVED` tienen botones).
3. **↩️ Devolver por Wompi** → confirmar. La plataforma pide el reembolso del
   monto completo a Wompi (y, si es tarjeta del mismo día, la anulación). Si
   sale bien, la fila pasa a "↩️ Devuelto", queda el evento en el historial y
   el cliente recibe el WhatsApp de devolución confirmada.
4. Si Wompi rechaza (mensaje ámbar "No se pudo devolver"), nada cambió. Pasa a
   la vía manual: panel de Wompi (tarjeta) o transferencia desde la cuenta de
   Baird (PSE, Nequi, Bancolombia). Luego **Registrar devolución manual** con
   una nota verificable ("transferencia Bancolombia 22/10 ref …"): marca la
   fila como devuelta y envía el mismo WhatsApp al cliente.
5. Verifica: la etapa de pago vuelve a "anticipo pendiente" (o la que
   corresponda) y el historial tiene el evento ↩️. Si aparece ⚠️ "no se pudo
   avisar al cliente", avísale a mano.

Qué le decimos al cliente: la devolución llega al mismo medio con que pagó
(tarjeta: entre 1 y 15 días hábiles según el banco; PSE/Nequi: por
transferencia en 1 día hábil desde que nos da los datos de su cuenta). Baird
asume las comisiones. El instructivo completo, con los textos para el cliente
y los casos por método de pago, es `docs/DEVOLUCIONES.md` (lo tiene el
equipo de Baird).

### 8.5 Códigos de descuento (`/admin/descuentos`)

El cliente particular escribe un código en el formulario `/solicitar`. El
descuento (porcentaje del total o valor fijo) se resta **solo en el último
pago** (el saldo) y lo asume Baird; el pago del técnico no cambia. La pantalla
lista los códigos con tipo, descripción, vigencia, usos y estado (activo /
inactivo / programado / vencido / agotado). Crear o editar es **[solo
admin]**. En la ficha del servicio el descuento aparece en "Cuentas del
servicio" y en el cobro final.

---

## 9. Facturación

Todo sale de **💰 Liquidaciones** (`/admin/liquidaciones`). Arriba se elige
el período con los atajos **Quincena anterior**, **Quincena actual** y **Mes
actual** (o fechas a mano) y, solo para la liquidación de técnicos, un
técnico. Solo entran servicios **completados**, cortados por su **fecha de
cierre** (día calendario Colombia); el ledger de pagos Wompi va por fecha de
pago. Cada tarjeta tiene su botón **⬇️ Descargar Excel**. El rol de lectura
puede descargar los cuatro.

### 9.1 Export "Facturación (Siigo)"

Es el paquete para contabilidad. Hojas:

| Hoja | Contenido |
|---|---|
| **FV particulares** | Un renglón por ítem de factura de cada servicio particular completado: tercero (cédula/NIT, nombre, dirección, teléfono), ítem ("Visita de diagnóstico" y/o "Servicio técnico"), base, IVA, total, forma de pago sugerida, lo recaudado por Wompi y lo pendiente |
| **FV MABE** | La factura consolidada a MABE del período, campo por campo (tercero, ítem, base, IVA, total, observaciones con los N° de orden) |
| **Relación órdenes MABE** | Anexo de esa factura: una fila por orden (N° orden, cliente, equipo, complejidad, tarifa, bono, recargo, valor) |
| **Pagos Wompi** | Todas las transacciones del período (aprobadas o no) con su servicio, cliente, estado del servicio y a qué factura aplican |
| **Datos faltantes** | Checklist por servicio: sin cédula, sin correo, tipo de documento inferido, cotización sin desglose, saldo pagado por fuera de Wompi, garantía sin complejidad |
| **Parámetros** | Rango, conteos, IDs de Siigo usados y cómo cruzar un pago |

Cómo cruzar un pago: la referencia de Wompi es `anticipo-`, `abono-` o
`saldo-` seguido del ID del servicio; sus 8 primeros caracteres son el
código `BS-XXXXXXXX`.

### 9.2 Ficha de facturación por servicio

Ficha del servicio → **💰 Cuentas del servicio — Particular** → **🧾 Ficha de
facturación**. Descarga el mismo Excel acotado a esa sola venta
(`ficha-facturacion-BS-XXXXXXXX.xlsx`), en cualquier estado; la hoja
Parámetros deja el estado explícito y la factura se emite al completar.

### 9.3 Correo automático al completar

Cuando un servicio pasa a *Completada*, la plataforma envía un correo de
facturación con los datos de la venta al buzón de facturación configurado
(por defecto `logistica@encompasslatam.com`). Si el correo no llega (el
envío depende de que esté configurado el proveedor de correo), la ficha de
facturación de § 9.2 tiene la misma información.

### 9.4 Liquidación quincenal de técnicos

1. En Liquidaciones elegir **Quincena anterior** (1–15 o 16–fin de mes) y
   descargar **Liquidación de técnicos** (opcionalmente un solo técnico).
2. Hojas: **Resumen por técnico** (lo que se gira), **Detalle servicios**
   (soporte por servicio; en garantía muestra la proyección del diagnóstico
   y el consolidado real) y **Documento soporte** (una fila por técnico con
   tipo y número de documento, concepto, códigos de servicio, valor, bandera
   de retención en la fuente y columnas en blanco para retención, neto y
   fecha de pago).
3. Contabilidad aplica retención si corresponde, emite el documento soporte y
   gira. El registro del giro se lleva en **Pagos técnicos** **[solo admin]**.
4. Un servicio completado el día 15 a las 23:30 cae en la primera quincena; el
   16 a las 00:10 en la segunda. Los valores se calculan con las tarifas
   vigentes al generar el Excel.

### 9.5 Factura consolidada a MABE (quincenal, asistida)

No es automática: cada quincena se descarga el export de Facturación (Siigo)
con el preset **Quincena anterior** y se captura en Siigo la hoja **FV MABE**
con la **Relación órdenes MABE** como anexo. La tarjeta **Liquidación MABE**
da el mismo total por orden (N° de orden, complejidad, tarifa base, bono,
recargo fin de semana y total) para conciliar con la marca. MABE paga por
transferencia contra la relación; sus pagos no pasan por Wompi.

### 9.6 Marcar un servicio como facturado (próximamente)

Está decidido que los servicios completados tengan un **seguimiento de
facturado / no facturado** y que logística pueda marcar cada uno desde la
ficha cuando contabilidad emita la factura, con un filtro **Sin facturar** en
la lista. Esa función **aún no está en producción**. Mientras tanto el control
se lleva por fuera (hoja de contabilidad) a partir del export de § 9.1.

---

## 10. Calendario quincenal de cierre (días 1 y 16)

Checklist para la mañana del 1 y del 16 de cada mes:

- [ ] **Liquidación de técnicos**: Liquidaciones → Quincena anterior →
  Liquidación de técnicos (§ 9.4). Revisar que ningún técnico tenga un
  servicio completado que falte (comparar con la lista filtrada por técnico y
  chip Completada).
- [ ] **Factura MABE**: mismo preset → Facturación (Siigo) → hojas FV MABE y
  Relación órdenes MABE (§ 9.5). Verificar que todas las órdenes tengan N° de
  orden y complejidad.
- [ ] **Datos faltantes**: hoja del mismo export. Cada fila es un dato que
  contabilidad no tiene (cédula, correo, desglose): pedirlo al cliente o al
  técnico antes de facturar.
- [ ] **Pagos Wompi**: cruzar la hoja Pagos Wompi con el extracto de Wompi;
  cualquier pago sin servicio o servicio sin pago se revisa en la ficha
  (**🔄 Verificar pagos en Wompi**).
- [ ] **Incumplidos abiertos**: Incumplidos → **Solo pendientes**, período
  "Mes pasado" y "Este mes". Nada debería quedar con prioridad alta sin
  gestión.
- [ ] **Pendientes por repuesto**: chip 🔩 en Solicitudes. Cada servicio en
  *Esperando repuesto* por más de 9 días ya agotó los recordatorios
  automáticos: escalar con el supervisor de la marca.
- [ ] **Sin técnico**: chip 📣. Reenviar la oferta o conseguir técnico a mano.
- [ ] **Pricing pendiente**: que no quede ninguna cotización sin precio.

---

## 11. Qué hacer cuando algo falla

### 11.1 Un WhatsApp no llegó (cliente o técnico)

1. Ficha → **Historial de estados**: los mensajes enviados al cliente aparecen
   con la plantilla usada; si Meta reportó falla, el evento lo dice. **⚠️
   requiere intervención** significa que la plataforma no pudo avisar.
2. Confirma el número en **Datos del cliente** (celular colombiano de 10
   dígitos). Si está mal, **✏️ Editar** **[solo admin]** y reenviar.
3. **Reenviar último mensaje del flujo** **[solo admin]** reenvía al cliente lo
   que le corresponde según el estado. **📲 Reenviar portal al técnico** hace
   lo mismo con el técnico (es el caso típico de "el técnico dice que no puede
   avanzar con el diagnóstico": no le llegó el link del portal).
4. Si el mensaje era un texto libre (no una plantilla), solo llega si la
   persona le escribió a la línea en las últimas 24 horas: pídele que mande
   un "hola" y reenvía.
5. Si nada funciona, llama y registra la llamada en la ficha **[solo admin]**.

### 11.2 Un pago no aparece

1. Pide al cliente el comprobante de Wompi (N° de transacción).
2. Ficha → **Cobros al cliente** → pega el número en "N° transacción Wompi" →
   **🔄 Verificar pagos en Wompi**. Si la transacción es de ese servicio, se
   registra y salen los avisos.
3. Si el cliente pagó por la **tienda** (referencia que empieza por `r`) o en
   sitio con QR/transferencia, no se registra solo: avisar al admin para que
   lo deje anotado en la ficha y contabilidad lo cruce con el extracto.
4. Si pagó un monto distinto al esperado, queda registrado pero no confirma la
   reserva y el historial muestra ⚠️: el admin decide (devolver la diferencia
   o cobrar el resto).

### 11.3 Ningún técnico acepta

1. Lista → chip **📣 Sin técnico**. En la ficha, **Notificaciones WhatsApp**
   dice a cuántos se les ofreció y **Diagnóstico de matching** muestra quiénes
   cumplen ciudad y especialidad. Si no hay ninguno, el problema es cobertura
   (ciudad o tipo de equipo sin técnico verificado).
2. Reenviar la oferta: selección múltiple → **📣 Reenviar a técnicos** o, en la
   ficha, **Notificar técnicos** **[solo admin]**. Si el cliente había elegido
   técnico de preferencia, el reenvío va a todos.
3. Si sigue sin técnico, llamar a un técnico de la zona y, si acepta por
   teléfono, mandarle el link de aceptación (está en su WhatsApp) o pedir al
   admin que lo asigne.
4. Revisar la fecha: si ya pasó, reagendar primero (**Cambiar fecha de
   servicio** **[solo admin]**) y luego reenviar.

### 11.4 El cliente no responde (horario, aprobación, confirmación)

- *Pendiente horario*: la plataforma recuerda a las 24 h y cierra a las 36 h
  (*Sin agendar*). Antes de eso, **Reenviar último mensaje** le manda de nuevo
  la selección de horario. Si ya expiró, el botón del bloque de matching (que
  en ese estado dice **Enviar selección de horario al cliente**) o el reenvío
  masivo desde la lista la reviven a *Pendiente horario* y le reenvían la
  selección **[solo admin]**.
- *Cliente debe aprobar siguiente paso* / *Cotización enviada*: reenviar el
  mensaje y llamar. Si el cliente aprueba por teléfono, el admin puede mover
  el estado a mano, dejando el motivo.
- *Cliente debe confirmar servicio*: si el cliente no confirma, el servicio no
  pasa a *Completada* y no entra a liquidaciones. Llamar; si confirma de
  palabra, el admin cambia el estado a *Completada* con el motivo. Si reporta
  un problema, pasa a *En disputa* y se revisa la evidencia con el técnico.

### 11.5 El técnico no fue o no registró nada

- Aparece en **Incumplidos** como *Vencida sin atender*. Llamar al técnico: si
  fue y no registró, que envíe el diagnóstico o complete desde su portal; si
  no fue, reagendar con el cliente y, si hace falta, reasignar con **🔁
  Cambiar técnico** en la ficha **[solo admin]**.
- Cada incumplimiento (visita no atendida, atendida días después, o técnico
  liberado / cambiado por el equipo) le retrasa **5 minutos** las próximas
  ofertas durante 30 días, con tope de 60 min. Se configura (o se apaga) en
  **Reparto** → *⏱️ Penalización por incumplimiento* **[solo admin]**. Si el
  técnico avisa a tiempo con "No alcanzo" en su portal, no cuenta.
- Si el técnico no debe recibir más garantías o particulares, bloquearlo en su
  ficha (**🚫 Restricciones y penalización**) **[solo admin]**.
- Si se trata de una tendencia (bajo cumplimiento en la tabla Por técnico),
  informar al admin.

### 11.6 El flujo quedó atascado

Estados que no avanzan por pérdida de señal del técnico o del cliente se
resuelven con **Cambiar estado manualmente** **[solo admin]**, siempre con
motivo. No envía WhatsApp a cliente ni técnico, así que después hay que
avisarles a mano si corresponde. Un servicio con técnico asignado **nunca**
se devuelve a *Notificada* (dejaría al técnico sin ver el servicio).

### 11.7 A quién escalar

| Tema | Escalar a |
|---|---|
| Acciones que el rol de lectura no puede hacer (editar, reagendar, devolver, cambiar estado, notas) | Administrador de Baird (Juan) |
| Repuestos de garantía sin respuesta | Supervisor de la marca (lista en Supervisores) y luego Baird |
| Pagos, devoluciones, Wompi | Administrador de Baird |
| Facturas, retenciones, Siigo | Contabilidad de Baird |
| La plataforma no carga, errores técnicos, mensajes que no salen de forma masiva | Administrador de Baird (ver Errores conexión) |

---

## 12. Glosario

| Término | Significado |
|---|---|
| **Solicitud / servicio / caso** | Una misma cosa: cada reparación pedida por un cliente |
| **Garantía** | Servicio que paga la marca (MABE, GE, Centrales). No se le cobra al cliente |
| **Particular** | Servicio que paga el cliente |
| **N° de orden / garantía MABE** | Número de la orden de servicio de la marca. Llave para la factura a MABE |
| **Código de servicio `BS-XXXXXXXX`** | Primeros 8 caracteres del ID de la solicitud. Aparece en Wompi, en la ficha y en facturación |
| **Oferta** | El WhatsApp que reciben los técnicos para aceptar un servicio |
| **Franja** | Bloque horario de la visita (por ejemplo 8am-12pm). Hay un cupo de visitas por franja y por técnico |
| **Cupo** | Máximo de reservas por franja (5) y por técnico por franja (5) |
| **Diagnóstico** | Visita en la que el técnico revisa el equipo y define el siguiente paso |
| **Siguiente paso** | Lo que propone el técnico tras diagnosticar: reparar, esperar repuesto, no reparable o negativa del cliente |
| **Cotización** | Precio al cliente en particular. La calcula la plataforma a partir del costo del técnico |
| **Tarifa fija** | Mantenimiento y Cambio de filtro: precio de catálogo, sin cotización |
| **Anticipo / Abono / Saldo** | Las tres etapas de cobro por Wompi en particular |
| **Ledger de pagos** | Lista de transacciones Wompi de un servicio en la ficha |
| **Etapa de pago** | Etiqueta que resume dónde va el cobro (anticipo pendiente, pagado total, etc.) |
| **Devolución (Wompi)** | Reembolso o anulación de un pago online; la fila queda como `VOIDED` |
| **Supervisor** | Persona de la marca que recibe avisos y gestiona repuestos de garantía desde su portal |
| **Guía de envío** | Documento del transportador que sube el supervisor cuando despacha el repuesto |
| **Receptor** | Persona que recibe al técnico cuando no es el titular |
| **Auxiliar** | Ayudante del técnico, verificado por Baird, que puede acompañarlo |
| **Incumplida** | Reserva que no se atendió el día reservado |
| **Prioridad alta / media / baja** | Nivel de una reserva incumplida según reagendamientos y antigüedad (§ 7) |
| **Portal del cliente** | `/servicio/{token}`: donde el cliente ve el estado, cancela o reagenda |
| **Portal del técnico** | `/tecnico/{token}`: donde el técnico acepta, diagnostica, completa y ve su agenda |
| **Plantilla (WhatsApp)** | Mensaje aprobado por Meta que llega siempre. Un texto libre solo llega si la persona escribió en las últimas 24 h |
| **Liquidación** | Excel con lo que se paga a técnicos, se factura a MABE o se vendió a particulares en un período |
| **Documento soporte** | Documento contable que Baird emite por los pagos a técnicos (no obligados a facturar) |
| **Quincena** | Períodos 1–15 y 16–fin de mes, por fecha de cierre del servicio |
| **Siigo** | Software contable de Baird donde se capturan las facturas |
| **Wompi** | Pasarela de pagos (Bancolombia) por la que paga el cliente |

---

## 13. Contactos y documentos de referencia

### Contactos

| Para | Contacto |
|---|---|
| Administración de la plataforma (Baird) | Juan David Guerrón — `jdguerron@bairdservice.com` |
| Atención al cliente y datos personales (Baird) | `baird@bairdservice.com` |
| Buzón de facturación (recibe el correo automático al completar) | `logistica@encompasslatam.com` |
| Línea de WhatsApp de la plataforma (desde donde salen los mensajes) | +57 313 4951164 |
| Tienda de repuestos | `tienda.bairdservice.com` |

### Documentos del repositorio (para el equipo técnico de Baird)

| Documento | Qué amplía |
|---|---|
| `docs/MAQUINA-DE-ESTADOS.md` | Estados y transiciones completas |
| `docs/FLOWS.md` | Flujos paso a paso con cada mensaje de WhatsApp |
| `docs/FACTURACION.md` | Exports, Siigo, liquidación quincenal, pendientes contables |
| `docs/DEVOLUCIONES.md` | Instructivo completo de devoluciones y textos para el cliente |
| `docs/WOMPI.md` | Cobros online, conciliación, etapa de pago |
| `docs/TARIFAS.md` | Cómo se calculan precios y pagos |
| `docs/SEGURIDAD.md` | Roles, accesos y rol de lectura |
| `docs/ARQUITECTURA.md` | Mapa de pantallas y rutas |

Las guías públicas para supervisores y técnicos están en el Dashboard
(bloque 📚 Guías) y se pueden compartir por WhatsApp.
