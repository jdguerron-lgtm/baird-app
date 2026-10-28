import { NextResponse } from 'next/server'
import { cronAutorizado } from '@/lib/auth/cron'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { enviarMensajeTexto, isPhoneAllowed } from '@/lib/services/whatsapp.service'
import { cargarDatosResumen, enviarPlantillaResumen, SELECT_SUPERVISOR_RESUMEN } from '@/lib/services/resumen-movimientos-envio.service'
import {
  armarResumenSupervisor,
  partirTexto,
  ventanaResumen,
  type ResumenSupervisor,
  type SupervisorResumen,
} from '@/lib/services/resumen-movimientos.service'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/resumen-movimientos
 *
 * Vercel Cron diario (vercel.json: '0 22 * * *' UTC = 5:00 pm Bogotá; Hobby
 * solo permite crons diarios y puede dispararlos con hasta ~1 h de retraso —
 * `ventanaResumen` toma el corte más reciente ≤ ahora, así el informe no se
 * corre de día).
 *
 * Envía a cada supervisor ACTIVO un informe en TEXTO con todos los cambios de
 * estado del día (5:00 pm de ayer → 5:00 pm de hoy, hora Colombia) de los
 * servicios dentro de su alcance (ámbito + marca, el mismo del portal
 * /supervisor/{token}). Cada supervisor recibe SOLO sus servicios; incluye
 * cliente, equipo, No. de garantía MABE, estado anterior → nuevo, quién lo
 * movió y, si el servicio espera un repuesto, el repuesto (SKU + descripción
 * de `repuestos_pendientes`, fallback `cotizacion.productos_necesarios`).
 * Si no hubo movimientos manda "sin movimientos hoy".
 *
 * "Cerrar para abrir después" (MABE, 2026-10-22): toda garantía que en la
 * ventana quede agendada con la visita a más de DIAS_AGENDA_CERRAR_PARA_ABRIR
 * días (4) del día del agendamiento sale en una sección propia al inicio y con
 * una línea ⏸️ en su bloque, para que el supervisor cierre la orden en el
 * sistema de MABE y la reabra cerca de la fecha. Incluye los reagendamientos
 * del admin (evento `nota_admin` origen 'reagendamiento_admin') aunque no
 * cambien el estado.
 *
 * Canal (ver docs/WHATSAPP_TEMPLATES.md § "Texto libre"):
 *   1. `enviarMensajeTexto` — texto libre, partido en varios mensajes si pasa
 *      de 3.900 caracteres. ⚠️ Ventana 24h de Meta: solo llega si el
 *      supervisor le escribió a la línea en las últimas 24 h (error 131047
 *      si no). Los supervisores rara vez chatean con el negocio…
 *   2. …por eso, si el texto falla, cae a la plantilla
 *      `supervisor_resumen_diario_v1` (UTILITY, funciona fuera de la ventana;
 *      resumen en una línea + botón al portal; APPROVED 2026-10-21).
 *   3. Ojo: casi siempre Meta ACEPTA el texto (200) aunque la ventana esté
 *      cerrada y avisa el 131047 DESPUÉS por el webhook. Ese caso lo cubre
 *      /api/whatsapp/webhook → reintentarResumenPorPlantilla
 *      (resumen-movimientos-envio.service.ts), que reenvía por plantilla y
 *      deja la fila de la bitácora en canal='plantilla' (2026-10-27).
 *
 * Respeta BAIRD_TEST_PHONE_WHITELIST (`canal='filtrado'`). Bitácora e
 * idempotencia por (supervisor, corte) en `supervisor_resumenes` (migración
 * 20261020_supervisor_resumenes.sql; si falta, se loguea y se envía igual).
 *
 * Query:
 *   ?dry=1        arma los resúmenes y los devuelve SIN enviar (ni bitácora)
 *   ?force=1      reenvía aunque ya haya un envío registrado para este corte
 *   ?corte=ahora  ventana desde el último corte hasta este instante (pruebas)
 *
 * Seguridad: `cronAutorizado` (Bearer CRON_SECRET).
 */
export async function GET(req: Request) {
  if (!cronAutorizado(req)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const params = new URL(req.url).searchParams
  const dry = params.get('dry') === '1'
  const force = params.get('force') === '1'
  const corte = params.get('corte') === 'ahora' ? 'ahora' : 'ultimo'

  try {
    const ventana = ventanaResumen(new Date(), corte)
    const resultado = await generarYEnviar(ventana, { dry, force })
    console.log('[cron/resumen-movimientos]', JSON.stringify({
      corte: ventana.hasta.toISOString(),
      dry,
      supervisores: resultado.supervisores.map(s => ({ nombre: s.nombre, canal: s.canal, movimientos: s.movimientos })),
    }))
    return NextResponse.json({ ok: true, dry, ventana: { desde: ventana.desde, hasta: ventana.hasta, fecha: ventana.fechaYMD }, ...resultado })
  } catch (err) {
    console.error('[cron/resumen-movimientos] error:', err)
    return NextResponse.json({ ok: false, error: 'Error interno' }, { status: 500 })
  }
}

type Canal = 'texto' | 'plantilla' | 'filtrado' | 'error' | 'dry' | 'omitido'

interface ResultadoSupervisor {
  supervisorId: string
  nombre: string
  canal: Canal
  movimientos: number
  servicios: number
  partes: number
  error?: string
  /** Solo en dry-run: el texto que se habría enviado. */
  texto?: string
}

async function generarYEnviar(
  ventana: ReturnType<typeof ventanaResumen>,
  opts: { dry: boolean; force: boolean },
): Promise<{ supervisores: ResultadoSupervisor[]; eventos: number }> {
  // 1. Supervisores activos (incluye portal_token para el link del pie).
  const { data: sups, error: supErr } = await supabase
    .from('supervisores')
    .select(SELECT_SUPERVISOR_RESUMEN)
    .eq('activo', true)
  if (supErr) throw new Error(`supervisores: ${supErr.message}`)
  const supervisores = (sups ?? []) as SupervisorResumen[]
  if (supervisores.length === 0) return { supervisores: [], eventos: 0 }

  // 2. Eventos, solicitudes, repuestos y técnicos de la ventana.
  const { eventos, solicitudes, repuestos, tecnicos } = await cargarDatosResumen(ventana)

  // 3. Envíos ya registrados para este corte (idempotencia, best-effort).
  const yaEnviados = new Set<string>()
  if (!opts.dry && !opts.force) {
    const { data: previos, error: prevErr } = await supabase
      .from('supervisor_resumenes')
      .select('supervisor_id')
      .eq('corte_at', ventana.hasta.toISOString())
      .in('canal', ['texto', 'plantilla'])
    if (prevErr) {
      console.warn('[cron/resumen-movimientos] supervisor_resumenes no disponible (¿migración 20261020 sin aplicar?):', prevErr.message)
    } else {
      for (const p of previos ?? []) yaEnviados.add(p.supervisor_id)
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? null
  const resultados: ResultadoSupervisor[] = []

  // 4. Un resumen por supervisor, secuencial (pocos supervisores; no saturar Meta).
  for (const sup of supervisores) {
    const resumen = armarResumenSupervisor({ supervisor: sup, ventana, eventos, solicitudes, repuestos, tecnicos, appUrl })
    const partes = partirTexto(resumen.texto)

    if (opts.dry) {
      resultados.push({ ...base(resumen), canal: 'dry', partes: partes.length, texto: resumen.texto })
      continue
    }
    if (yaEnviados.has(sup.id)) {
      resultados.push({ ...base(resumen), canal: 'omitido', partes: partes.length, error: 'Ya enviado para este corte (usa ?force=1 para repetir)' })
      continue
    }

    const r = await enviarResumen(sup, resumen, partes, ventana.fechaYMD)
    resultados.push({ ...base(resumen), ...r, partes: partes.length })
    await registrarBitacora(sup.id, ventana, resumen, r, partes.length)
  }

  return { supervisores: resultados, eventos: eventos.length }
}

function base(r: ResumenSupervisor): Pick<ResultadoSupervisor, 'supervisorId' | 'nombre' | 'movimientos' | 'servicios'> {
  return { supervisorId: r.supervisorId, nombre: r.nombre, movimientos: r.movimientos, servicios: r.servicios }
}

/**
 * Texto libre primero; si Meta lo rechaza (típicamente 131047, ventana 24h
 * cerrada) cae a la plantilla `supervisor_resumen_diario_v1` con el resumen
 * en una línea y botón al portal. Nunca lanza.
 */
async function enviarResumen(
  sup: SupervisorResumen,
  resumen: ResumenSupervisor,
  partes: string[],
  fechaYMD: string,
): Promise<{ canal: Canal; error?: string }> {
  if (!isPhoneAllowed(sup.whatsapp)) {
    return { canal: 'filtrado', error: 'Filtrado por BAIRD_TEST_PHONE_WHITELIST' }
  }

  let errorTexto: string | undefined
  try {
    for (const parte of partes) {
      await enviarMensajeTexto(sup.whatsapp, parte)
    }
    return { canal: 'texto' }
  } catch (err) {
    errorTexto = err instanceof Error ? err.message : String(err)
    console.warn(`[cron/resumen-movimientos] texto libre a ${sup.nombre} falló (¿ventana 24h cerrada?): ${errorTexto}`)
  }

  // Fallback: plantilla (funciona fuera de la ventana 24h). Si no está
  // APPROVED en Meta, falla y queda registrado como error.
  try {
    const r = await enviarPlantillaResumen(sup, resumen, fechaYMD)
    if (r.filtered) return { canal: 'filtrado', error: 'Filtrado por BAIRD_TEST_PHONE_WHITELIST' }
    return { canal: 'plantilla', error: `Texto libre falló: ${errorTexto}` }
  } catch (err) {
    const errorPlantilla = err instanceof Error ? err.message : String(err)
    console.error(`[cron/resumen-movimientos] plantilla a ${sup.nombre} también falló: ${errorPlantilla}`)
    return { canal: 'error', error: `Texto: ${errorTexto} | Plantilla: ${errorPlantilla}` }
  }
}

async function registrarBitacora(
  supervisorId: string,
  ventana: ReturnType<typeof ventanaResumen>,
  resumen: ResumenSupervisor,
  r: { canal: Canal; error?: string },
  partes: number,
): Promise<void> {
  if (r.canal === 'dry' || r.canal === 'omitido') return
  const { error } = await supabase.from('supervisor_resumenes').insert({
    supervisor_id: supervisorId,
    corte_at: ventana.hasta.toISOString(),
    desde_at: ventana.desde.toISOString(),
    movimientos: resumen.movimientos,
    servicios: resumen.servicios,
    canal: r.canal,
    partes,
    error: r.error ?? null,
    texto: resumen.texto,
  })
  if (error) {
    console.warn('[cron/resumen-movimientos] no se pudo registrar en supervisor_resumenes:', error.message)
  }
}
