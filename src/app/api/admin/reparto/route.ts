import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { obtenerEmailAdmin, verificarLectura } from '@/lib/auth/admin'
import {
  CONFIG_REPARTO_DEFAULT,
  LIMITES_REPARTO,
  VENTANA_DIAS_REPARTO,
  contarServiciosRecientes,
} from '@/lib/services/reparto.service'

/**
 * Panel de reparto escalonado de ofertas (/admin/reparto).
 *
 * GET (admin o lectura): configuración + técnicos verificados con sus
 * servicios aceptados en 7 días (quién está en prioridad hoy) + solicitudes
 * esperando abrirse al resto.
 * PATCH (solo admin): cambia activo / minutos_ventaja / max_servicios_semana.
 */

export async function GET(req: NextRequest) {
  if (!(await verificarLectura(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data: filaConfig, error: errConfig } = await supabase
    .from('config_reparto')
    .select('activo, minutos_ventaja, max_servicios_semana, updated_at, updated_by')
    .eq('id', 1)
    .maybeSingle()

  const migracionPendiente = !!errConfig
  const config = filaConfig ?? { ...CONFIG_REPARTO_DEFAULT, updated_at: null, updated_by: null }

  const { data: tecnicos } = await supabase
    .from('tecnicos')
    .select('id, nombre_completo, ciudad_pueblo, ciudades_cobertura')
    .eq('estado_verificacion', 'verificado')
    .order('nombre_completo')

  const lista = (tecnicos ?? []) as {
    id: string
    nombre_completo: string
    ciudad_pueblo: string | null
    ciudades_cobertura: string[] | null
  }[]
  const conteos = await contarServiciosRecientes(lista.map(t => t.id))

  const tecnicosConConteo = lista
    .map(t => {
      const servicios = conteos.get(t.id) ?? 0
      const cobertura = Array.isArray(t.ciudades_cobertura) && t.ciudades_cobertura.length > 0
        ? t.ciudades_cobertura
        : [t.ciudad_pueblo].filter(Boolean)
      return {
        id: t.id,
        nombre: t.nombre_completo,
        cobertura,
        servicios,
        prioridad: servicios < config.max_servicios_semana,
      }
    })
    .sort((a, b) => b.servicios - a.servicios || a.nombre.localeCompare(b.nombre))

  let enEspera: {
    id: string
    tipo_equipo: string | null
    ciudad_pueblo: string | null
    es_garantia: boolean
    oferta_abierta_at: string
  }[] = []
  if (!migracionPendiente) {
    const { data } = await supabase
      .from('solicitudes_servicio')
      .select('id, tipo_equipo, ciudad_pueblo, es_garantia, oferta_abierta_at')
      .not('oferta_abierta_at', 'is', null)
      .is('tecnico_asignado_id', null)
      .eq('estado', 'notificada')
      .order('oferta_abierta_at')
      .limit(50)
    enEspera = data ?? []
  }

  return NextResponse.json({
    config,
    migracionPendiente,
    ventanaDias: VENTANA_DIAS_REPARTO,
    limites: LIMITES_REPARTO,
    tecnicos: tecnicosConConteo,
    enEspera,
  })
}

function enteroEnRango(valor: unknown, min: number, max: number): number | null {
  const n = Number(valor)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}

export async function PATCH(req: NextRequest) {
  const email = await obtenerEmailAdmin(req)
  if (!email) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const cambios: Record<string, unknown> = {}

  if (body.activo !== undefined) {
    if (typeof body.activo !== 'boolean') {
      return NextResponse.json({ error: 'activo debe ser true o false' }, { status: 400 })
    }
    cambios.activo = body.activo
  }
  if (body.minutos_ventaja !== undefined) {
    const { min, max } = LIMITES_REPARTO.minutos
    const n = enteroEnRango(body.minutos_ventaja, min, max)
    if (n === null) {
      return NextResponse.json({ error: `Los minutos de ventaja van de ${min} a ${max}` }, { status: 400 })
    }
    cambios.minutos_ventaja = n
  }
  if (body.max_servicios_semana !== undefined) {
    const { min, max } = LIMITES_REPARTO.servicios
    const n = enteroEnRango(body.max_servicios_semana, min, max)
    if (n === null) {
      return NextResponse.json({ error: `El tope de servicios va de ${min} a ${max}` }, { status: 400 })
    }
    cambios.max_servicios_semana = n
  }
  if (Object.keys(cambios).length === 0) {
    return NextResponse.json({ error: 'Nada que cambiar' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('config_reparto')
    .upsert({ id: 1, ...cambios, updated_at: new Date().toISOString(), updated_by: email })
    .select('activo, minutos_ventaja, max_servicios_semana, updated_at, updated_by')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ config: data })
}
