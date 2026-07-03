# -*- coding: utf-8 -*-
"""
Resumen Semanal de Operaciones (Baird Service) -> PDF.
- Excluye todo lo cerrado ANTES de la semana (corte 15-21 jun 2026).
- Portada con KPIs + graficos (donas / barras) generados con matplotlib.
- Resalta los DIAS ABIERTOS de cada servicio (KPI + grafico de antiguedad + columna).
- Para garantia incluye el N de orden (numero_serie_factura).
Datos: snapshot filtrado del corte.
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import Patch

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.utils import ImageReader
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, Image,
)

SEMANA = "Semana del 15 al 21 de junio de 2026"
FECHA_CORTE = "Domingo 21 de junio de 2026"
OUT = "Resumen_Semanal_Baird_2026-06-21.pdf"

SLATE = colors.HexColor("#0F172A"); BLUE = colors.HexColor("#2563EB")
GREEN = colors.HexColor("#059669"); RED = colors.HexColor("#DC2626")
AMBER = colors.HexColor("#D97706"); FUCHSIA = colors.HexColor("#A21CAF")
GRAY = colors.HexColor("#64748B"); LIGHT = colors.HexColor("#F1F5F9")
LINE = colors.HexColor("#E2E8F0"); HEADBG = colors.HexColor("#1E293B")
PAL = ["#2563EB", "#0EA5E9", "#14B8A6", "#F59E0B", "#EF4444", "#8B5CF6"]

# ================================================================ DATOS (filtrados)
# orden, cliente, equipo, ciudad, estado, tecnico, dias_abiertos, nota
ACTIVOS = [
    ("9415320702", "Andres Tunaroza", "Nevera MABE", "Bogota", "En proceso", "Carlos B.", 29, "Repuesto recibido 16-jun; cerrar"),
    ("-- (part.)", "Patricia Acosta", "Nevecon LG", "Bogota", "Esp. repuesto", "Carlos B.", 24, "[!] Telefono invalido"),
    ("9415352442", "Laura Rodriguez", "Nevera MABE", "Bogota", "Notificada", "--", 18, "Sin tecnico, sin eventos"),
    ("9415354644", "Michel Styven Avila", "Lav-Sec MABE", "Bogota", "Asignada", "Carlos B.", 18, "Sin movimiento desde 04-jun"),
    ("9415355882", "Jessica V. Perez", "Nevera MABE", "Bogota", "Notificada", "Carlos B.", 18, "[!] Caso previo (no-show) mismo tel."),
    ("9415361096", "Natividad Nieto", "Lav-Sec MABE", "Soacha", "Asignada", "Carlos B.", 16, "Sin fecha de visita"),
    ("9415361776", "Ermilson Suesca", "Horno MABE", "Soacha", "Notificada", "--", 16, "Sin tecnico asignado"),
    ("X990-2520506", "Delfin Alfonso Aponte", "Nevera MABE", "Bogota", "En proceso", "Carlos B.", 12, "[!] Caso previo (no-show) mismo tel."),
    ("9415377275", "Luis Alberto Torres", "Estufa MABE", "Soacha", "Notificada", "Carlos B.", 9, "Visita 16-jun"),
    ("9415375892", "Luz Yanei Chara", "Nevera MABE", "Bogota", "Pend. precio", "Carlos B.", 9, "Espera repuesto + pricing"),
    ("9415382133", "Natalia Giraldo", "Nevera MABE", "Soacha", "Asignada", "Carlos B.", 9, "Visita 17-jun"),
]
# orden, cliente, equipo, ciudad, estado, dias_abiertos, cerrado, nota
CERRADOS_SEM = [
    ("9415374849", "Diana Saganome", "Nevera MABE", "Bogota", "Completada", 7, "19-jun", "[!] 3 repuestos pendientes"),
    ("#9202526993", "Astrid Betancourt", "Lavadora MABE", "Bogota", "Completada", 14, "19-jun", "[!] 1 repuesto pendiente"),
    ("9415372015", "Maria Angelica Alvarez", "Nevera MABE", "Soacha", "Sin agendar", 8, "20-jun", "No se pudo agendar"),
    ("9415377334", "Alexandra Canto", "Nevera MABE", "Soacha", "Sin agendar", 8, "20-jun", "No se pudo agendar"),
]
# orden, cliente, repuesto, sku, solicitado, dias, estado caso
REP_PEND = [
    ("9415374849", "Diana Saganome", "Bimetalico", "RMP415YCU", "13-jun", 8, "Completada [!]"),
    ("9415374849", "Diana Saganome", "Sensor", "RMP415YCU", "13-jun", 8, "Completada [!]"),
    ("9415374849", "Diana Saganome", "Resistencia", "RMP415YCU", "13-jun", 8, "Completada [!]"),
    ("9415375892", "Luz Yanei Chara", "Cable", "104669238294D3768G011", "13-jun", 8, "Pend. precio"),
    ("#9202526993", "Astrid Betancourt", "Transmision", "0030812375F", "10-jun", 11, "Completada [!]"),
]

dias_abiertos = [r[6] for r in ACTIVOS]
prom_dias = round(sum(dias_abiertos) / len(dias_abiertos))
max_dias = max(dias_abiertos)

# ================================================================ CHARTS
def _donut(path, labels, values, palette, center_num, center_lbl, title):
    fig, ax = plt.subplots(figsize=(5.0, 4.1), subplot_kw=dict(aspect="equal"))
    ax.pie(values, colors=palette[:len(values)], startangle=90, counterclock=False,
           wedgeprops=dict(width=0.42, edgecolor="white", linewidth=2))
    ax.text(0, 0.12, str(center_num), ha="center", va="center", fontsize=30, fontweight="bold", color="#0F172A")
    ax.text(0, -0.22, center_lbl, ha="center", va="center", fontsize=10, color="#64748B")
    ax.set_title(title, fontsize=13, fontweight="bold", color="#0F172A", pad=14)
    leg = [Patch(facecolor=palette[i], label=f"{labels[i]}  ({values[i]})") for i in range(len(values))]
    ax.legend(handles=leg, loc="center left", bbox_to_anchor=(1.0, 0.5), frameon=False,
              fontsize=9.5, handlelength=1.1, labelspacing=0.6)
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="white"); plt.close(fig)

def _hbar(path, labels, values, highlight_idx, title):
    fig, ax = plt.subplots(figsize=(5.0, 3.0))
    cols = ["#CBD5E1"] * len(values)
    for i in highlight_idx:
        cols[i] = "#2563EB"
    ax.barh(range(len(values)), values, color=cols, height=0.6)
    ax.set_yticks(range(len(values))); ax.set_yticklabels(labels, fontsize=10); ax.invert_yaxis()
    for i, v in enumerate(values):
        ax.text(v + max(values) * 0.02, i, str(v), va="center", fontsize=10, fontweight="bold", color="#0F172A")
    ax.set_title(title, fontsize=13, fontweight="bold", color="#0F172A", pad=12, loc="left")
    ax.set_xlim(0, max(values) * 1.18)
    for s in ["top", "right", "bottom"]:
        ax.spines[s].set_visible(False)
    ax.set_xticks([]); ax.tick_params(left=False)
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="white"); plt.close(fig)

def _aging(path, labels, values, title, thr=14):
    fig, ax = plt.subplots(figsize=(10.0, 4.8))
    cols = ["#EF4444" if v > thr else "#2563EB" for v in values]
    ax.barh(range(len(values)), values, color=cols, height=0.66)
    ax.set_yticks(range(len(values))); ax.set_yticklabels(labels, fontsize=10); ax.invert_yaxis()
    for i, v in enumerate(values):
        ax.text(v + max(values) * 0.012, i, f"{v} d", va="center", fontsize=9.5, fontweight="bold", color="#0F172A")
    ax.axvline(thr, color="#94A3B8", linestyle="--", linewidth=1)
    ax.set_title(title, fontsize=14, fontweight="bold", color="#0F172A", pad=12, loc="left")
    ax.set_xlim(0, max(values) * 1.12)
    for s in ["top", "right", "bottom"]:
        ax.spines[s].set_visible(False)
    ax.set_xticks([]); ax.tick_params(left=False)
    ax.legend(handles=[Patch(facecolor="#EF4444", label=f"> {thr} dias abiertos"),
                       Patch(facecolor="#2563EB", label=f"<= {thr} dias")],
              loc="lower right", frameon=False, fontsize=9)
    fig.savefig(path, dpi=200, bbox_inches="tight", facecolor="white"); plt.close(fig)

_donut("_c_estado.png", ["Notificada", "Asignada", "En proceso", "Pend. precio", "Esperando repuesto"],
       [4, 3, 2, 1, 1], PAL, 11, "servicios activos", "Pipeline activo por estado")
_donut("_c_repuestos.png", ["Diana Saganome", "Astrid Betancourt", "Luz Yanei Chara"],
       [3, 1, 1], ["#A21CAF", "#C026D3", "#E879F9"], 5, "piezas en espera", "Repuestos en espera, por caso")
_donut("_c_equipos.png", ["Nevera", "Lav-Secadora", "Estufa", "Horno", "Nevecon"],
       [6, 2, 1, 1, 1], PAL, 11, "equipos", "Equipos en atencion (activos)")
_hbar("_c_ciudad.png", ["Bogota", "Soacha"], [7, 4], [1], "Servicios activos por ciudad")
_aging("_c_aging.png",
       [" ".join(r[1].split()[:2]) for r in ACTIVOS], dias_abiertos,
       "Dias abiertos por servicio activo (mayor a menor)")

# ================================================================ ESTILOS PDF
styles = getSampleStyleSheet()
P_TITLE = ParagraphStyle("t", parent=styles["Title"], textColor=SLATE, fontSize=21, leading=25)
P_SUB = ParagraphStyle("s", parent=styles["Normal"], textColor=GRAY, fontSize=10, leading=14, alignment=TA_CENTER)
P_H2 = ParagraphStyle("h2", parent=styles["Heading2"], textColor=SLATE, fontSize=13, leading=16, spaceBefore=10, spaceAfter=6)
P_BODY = ParagraphStyle("b", parent=styles["Normal"], textColor=SLATE, fontSize=9, leading=13)
P_NOTE = ParagraphStyle("n", parent=styles["Normal"], textColor=GRAY, fontSize=8, leading=11)
CELL = ParagraphStyle("c", parent=styles["Normal"], fontSize=8, leading=10, textColor=SLATE)
HCELL = ParagraphStyle("hc", parent=styles["Normal"], fontSize=8, leading=10, textColor=colors.white, fontName="Helvetica-Bold")

def c(t): return Paragraph("" if t is None else str(t), CELL)
def hh(t): return Paragraph(str(t), HCELL)

def make_table(headers, rows, widths):
    data = [[hh(x) for x in headers]] + [[c(x) for x in r] for r in rows]
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HEADBG), ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3), ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, LINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
    ]))
    return t

def hx(col): return "#" + col.hexval()[4:]
def kpi(value, label, color):
    txt = ('<font size=20 color="%s"><b>%s</b></font><br/>'
           '<font size=6.5 color="%s">%s</font>') % (hx(color), value, hx(GRAY), label)
    return Paragraph(txt, ParagraphStyle("kpi", alignment=TA_CENTER, leading=24))

def kpi_grid(cards, cols=4):
    rows = [[kpi(*x) for x in cards[i:i + cols]] for i in range(0, len(cards), cols)]
    w = (18.0 / cols) * cm
    t = Table(rows, colWidths=[w] * cols, rowHeights=[1.7 * cm] * len(rows))
    style = [("VALIGN", (0, 0), (-1, -1), "MIDDLE"), ("ALIGN", (0, 0), (-1, -1), "CENTER"),
             ("INNERGRID", (0, 0), (-1, -1), 6, colors.white), ("BOX", (0, 0), (-1, -1), 6, colors.white)]
    for r in range(len(rows)):
        for cc in range(cols):
            style.append(("BACKGROUND", (cc, r), (cc, r), LIGHT))
    t.setStyle(TableStyle(style))
    return t

def img(path, width):
    iw, ih = ImageReader(path).getSize()
    return Image(path, width=width, height=width * ih / iw)

def charts_row(paths, total_w=18.0 * cm):
    each = total_w / len(paths)
    t = Table([[img(p, each - 6) for p in paths]], colWidths=[each] * len(paths))
    t.setStyle(TableStyle([("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]))
    return t

KPIS = [
    ("11", "SERVICIOS ACTIVOS", BLUE),
    (f"{prom_dias}", "DIAS ABIERTOS (PROM)", AMBER),
    (f"{max_dias} d", "CASO MAS ANTIGUO", RED),
    ("2", "COMPLETADOS (SEM)", GREEN),
    ("2", "SIN AGENDAR (SEM)", AMBER),
    ("5", "REPUESTOS EN ESPERA", FUCHSIA),
    ("2", "SIN TECNICO", RED),
    ("3", "CONTACTO A REVISAR", SLATE),
]

# ================================================================ BUILD
story = []
story.append(Paragraph("BAIRD SERVICE", ParagraphStyle("brand", parent=P_SUB, textColor=BLUE,
            fontName="Helvetica-Bold", fontSize=11, alignment=TA_CENTER)))
story.append(Spacer(1, 0.1 * cm))
story.append(Paragraph("Resumen Semanal de Operaciones", P_TITLE))
story.append(Paragraph(SEMANA + "<br/>Corte: " + FECHA_CORTE +
                       "  ·  solo servicios activos o cerrados esta semana", P_SUB))
story.append(Spacer(1, 0.35 * cm))
story.append(kpi_grid(KPIS, cols=4))
story.append(Spacer(1, 0.35 * cm))
story.append(charts_row(["_c_estado.png", "_c_repuestos.png"]))
story.append(Spacer(1, 0.3 * cm))
story.append(Paragraph(
    "<b>Lectura rapida.</b> 11 servicios activos en el pipeline, con una antiguedad promedio de "
    f"<b>{prom_dias} dias abiertos</b> y el caso mas viejo en <b>{max_dias} dias</b> (Andres Tunaroza). "
    "Esta semana se completaron 2 y quedaron 2 sin agendar; no ingresaron solicitudes nuevas. "
    "Hay <b>5 repuestos en espera</b> (3 en casos ya marcados 'completada') y <b>2 servicios sin "
    "tecnico</b>. Concentracion en Bogota y Soacha.",
    ParagraphStyle("rt", parent=P_BODY, backColor=colors.HexColor("#EFF6FF"),
                   leftIndent=8, rightIndent=8, spaceBefore=4, spaceAfter=4, leading=14)))

story.append(PageBreak())
story.append(Paragraph("Antiguedad de los servicios", P_TITLE))
story.append(Paragraph("Dias que cada servicio activo lleva abierto (desde su creacion). En rojo, los que superan 14 dias.", P_NOTE))
story.append(Spacer(1, 0.2 * cm))
story.append(img("_c_aging.png", 17.5 * cm))
story.append(Spacer(1, 0.35 * cm))
story.append(charts_row(["_c_ciudad.png", "_c_equipos.png"]))

story.append(PageBreak())
story.append(Paragraph("Servicios activos (11)", P_TITLE))
story.append(Paragraph("Garantia incluye N de orden MABE. '--' = particular. Orden por dias abiertos (mayor a menor).", P_NOTE))
story.append(Spacer(1, 0.25 * cm))
story.append(make_table(
    ["N Orden", "Cliente", "Equipo", "Ciudad", "Estado", "Tecnico", "Dias abiertos", "Nota"],
    [[r[0], r[1], r[2], r[3], r[4], r[5], str(r[6]), r[7]] for r in ACTIVOS],
    [2.45 * cm, 2.65 * cm, 1.95 * cm, 1.45 * cm, 1.8 * cm, 1.3 * cm, 1.4 * cm, 3.5 * cm]))
story.append(Spacer(1, 0.35 * cm))
story.append(Paragraph("Cerrados esta semana (4)", P_H2))
story.append(make_table(
    ["N Orden", "Cliente", "Equipo", "Ciudad", "Estado", "Dias abiertos", "Cerrado", "Nota"],
    [[r[0], r[1], r[2], r[3], r[4], str(r[5]), r[6], r[7]] for r in CERRADOS_SEM],
    [2.45 * cm, 2.7 * cm, 2.2 * cm, 1.5 * cm, 1.8 * cm, 1.4 * cm, 1.3 * cm, 3.15 * cm]))

story.append(PageBreak())
story.append(Paragraph("Repuestos solicitados y en espera", P_TITLE))
story.append(Paragraph("Costo lo asume la marca (garantia). [!] = pendiente en un caso ya 'completada'.", P_NOTE))
story.append(Spacer(1, 0.25 * cm))
story.append(Paragraph("En espera (5)", P_H2))
story.append(make_table(
    ["N Orden", "Cliente", "Repuesto", "SKU", "Solicitado", "Dias", "Estado caso"],
    [[r[0], r[1], r[2], r[3], r[4], str(r[5]), r[6]] for r in REP_PEND],
    [2.5 * cm, 3.0 * cm, 2.2 * cm, 3.3 * cm, 1.8 * cm, 0.9 * cm, 3.3 * cm]))
story.append(Spacer(1, 0.25 * cm))
story.append(Paragraph("Recibido esta semana (1)", P_H2))
story.append(make_table(
    ["N Orden", "Cliente", "Repuesto", "Recibido", "Estado caso"],
    [["9415320702", "Andres Tunaroza", "Empaque puerta", "16-jun", "En proceso"]],
    [3.0 * cm, 4.0 * cm, 4.5 * cm, 2.5 * cm, 4.0 * cm]))
story.append(Spacer(1, 0.3 * cm))
story.append(Paragraph("<b>Alerta:</b> 4 de los 5 repuestos en espera pertenecen a 2 casos ya marcados "
                       "'completada' (Diana Saganome, Astrid Betancourt). Revisar si llegaron y no se "
                       "registro, o si el caso se cerro con el repuesto en transito.", P_BODY))

story.append(PageBreak())
story.append(Paragraph("Inconsistencias de contacto y datos", P_TITLE))
story.append(Spacer(1, 0.25 * cm))
story.append(Paragraph("A. Dato de contacto erroneo (1)", P_H2))
story.append(Paragraph("<b>Patricia Acosta</b> (esperando repuesto, particular) - telefono "
                       "<b>5713124598427</b>: 13 digitos, no cumple el formato movil colombiano "
                       "(57 + 3XXXXXXXXX). No se le podra avisar por WhatsApp cuando llegue el repuesto.", P_BODY))
story.append(Spacer(1, 0.2 * cm))
story.append(Paragraph("B. Casos activos con posible recreacion - mismo telefono que un caso previo (3)", P_H2))
story.append(make_table(
    ["Cliente (caso actual)", "Estado actual", "Caso previo (mismo tel.)"],
    [["Delfin / Alfonso Aponte", "En proceso", "No-show (cerrado antes)"],
     ["Jessica V. Perez", "Notificada", "No-show (cerrado antes)"],
     ["Astrid Betancourt", "Completada (sem)", "Cancelada (cerrado antes)"]],
    [5.5 * cm, 4.0 * cm, 8.5 * cm]))
story.append(Spacer(1, 0.2 * cm))
story.append(Paragraph("C. Inconsistencia de datos (1)", P_H2))
story.append(Paragraph("2 casos cerrados como 'completada' esta semana conservan repuestos en estado "
                       "'pendiente' y siguiente paso 'esperar repuesto' (Diana Saganome, Astrid Betancourt). "
                       "Reparacion realmente terminada, o caso cerrado con repuesto en transito?", P_BODY))
story.append(Spacer(1, 0.2 * cm))
story.append(Paragraph("<b>Limitacion del informe:</b> los mensajes a clientes (confirmacion de horario, "
                       "cotizacion, aviso de repuesto) no dejan registro de entrega ni de fallo. Para medir "
                       "fallos reales de contacto a cliente habria que persistir el resultado de cada envio.", P_NOTE))

def footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7); canvas.setFillColor(GRAY)
    canvas.drawString(1.4 * cm, 0.9 * cm, "BORRADOR - Baird Service - " + FECHA_CORTE)
    canvas.drawRightString(A4[0] - 1.4 * cm, 0.9 * cm, "Pag. %d" % doc.page)
    canvas.setStrokeColor(LINE); canvas.line(1.4 * cm, 1.15 * cm, A4[0] - 1.4 * cm, 1.15 * cm)
    canvas.restoreState()

doc = SimpleDocTemplate(OUT, pagesize=A4, leftMargin=1.4 * cm, rightMargin=1.4 * cm,
                        topMargin=1.3 * cm, bottomMargin=1.5 * cm,
                        title="Resumen Semanal Baird Service - 2026-06-21", author="Baird Service")
doc.build(story, onFirstPage=footer, onLaterPages=footer)
print("OK ->", OUT)
