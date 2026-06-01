import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { verificarAdmin } from '@/lib/auth/admin'
import { isValidPhone, phoneToDigits } from '@/lib/utils/phone'
import { ESTADOS_VALIDOS } from '@/lib/constants/estados'
import { enviarBienvenidaSupervisor } from '@/lib/services/whatsapp.service'

/**
 * CRUD de supervisores. Un supervisor recibe por WhatsApp los cambios de estado
 * de las solicitudes que matcheen su configuración (ámbito + marca + estados).
 *
 * Todos los handlers exigen admin autenticado (verificarAdmin).
 *
 * Modelo de filtrado (ver notificarCambioEstado en whatsapp.service.ts):
 *   - ambito: 'todos' | 'garantia' | 'particular'  → contra sol.es_garantia
 *   - marca:  null = todas las marcas | string = solo esa marca (normalizada)
 *   - estados: null = todos los estados | string[] = solo esos estados nuevos
 *
 * El whatsapp se normaliza a dígitos puros (igual que tecnicos.whatsapp) tanto
 * en este endpoint como en el trigger BD `trigger_normalizar_whatsapp_supervisor`.
 */

const AMBITOS = ['todos', 'garantia', 'particular'] as const

/** Normaliza el array de estados: filtra los válidos y devuelve null si queda vacío. */
function parseEstados(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null
  const validos = (ESTADOS_VALIDOS as readonly string[])
  const filtrados = raw.filter(e => typeof e === 'string' && validos.includes(e))
  return filtrados.length > 0 ? filtrados : null
}

export async function GET(req: NextRequest) {
  if (!(await verificarAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('supervisores')
    .select('id, nombre, whatsapp, activo, ambito, marca, estados, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ supervisores: data ?? [] })
}

export async function POST(req: NextRequest) {
  if (!(await verificarAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
  const whatsappRaw = typeof body.whatsapp === 'string' ? body.whatsapp.trim() : ''

  if (!nombre) {
    return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })
  }
  if (!isValidPhone(whatsappRaw)) {
    return NextResponse.json({ error: 'WhatsApp inválido' }, { status: 400 })
  }

  const ambito = (AMBITOS as readonly string[]).includes(body.ambito) ? body.ambito : 'todos'
  const marca = typeof body.marca === 'string' && body.marca.trim() ? body.marca.trim() : null
  const estados = parseEstados(body.estados)

  const { data, error } = await supabase
    .from('supervisores')
    .insert({
      nombre,
      whatsapp: phoneToDigits(whatsappRaw),
      ambito,
      marca,
      estados,
      activo: body.activo === false ? false : true,
    })
    .select('id, nombre, whatsapp, activo, ambito, marca, estados, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Bienvenida por WhatsApp (best-effort) — solo si el supervisor queda activo.
  // No bloquea: si el envío falla, el supervisor igual quedó creado. Se reporta
  // el resultado para que el admin sepa si el mensaje llegó.
  let whatsappBienvenida = false
  let whatsappError: string | undefined
  if (data.activo) {
    const wa = await enviarBienvenidaSupervisor({
      nombre: data.nombre,
      whatsapp: data.whatsapp,
      ambito: data.ambito,
      marca: data.marca,
      estados: data.estados,
    })
    whatsappBienvenida = wa.ok
    if (!wa.ok) {
      whatsappError = wa.error
      console.error('[supervisores] Error enviando bienvenida:', wa.error)
    }
  }

  return NextResponse.json({
    supervisor: data,
    whatsapp_bienvenida: whatsappBienvenida,
    ...(whatsappError ? { whatsapp_error: whatsappError } : {}),
  })
}

export async function PATCH(req: NextRequest) {
  if (!(await verificarAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const body = await req.json()
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  // Solo actualiza los campos presentes en el body (update parcial).
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (typeof body.nombre === 'string') {
    const nombre = body.nombre.trim()
    if (!nombre) return NextResponse.json({ error: 'El nombre no puede quedar vacío' }, { status: 400 })
    patch.nombre = nombre
  }
  if (typeof body.whatsapp === 'string') {
    if (!isValidPhone(body.whatsapp.trim())) {
      return NextResponse.json({ error: 'WhatsApp inválido' }, { status: 400 })
    }
    patch.whatsapp = phoneToDigits(body.whatsapp.trim())
  }
  if (body.ambito !== undefined) {
    patch.ambito = (AMBITOS as readonly string[]).includes(body.ambito) ? body.ambito : 'todos'
  }
  if (body.marca !== undefined) {
    patch.marca = typeof body.marca === 'string' && body.marca.trim() ? body.marca.trim() : null
  }
  if (body.estados !== undefined) {
    patch.estados = parseEstados(body.estados)
  }
  if (typeof body.activo === 'boolean') {
    patch.activo = body.activo
  }

  const { data, error } = await supabase
    .from('supervisores')
    .update(patch)
    .eq('id', id)
    .select('id, nombre, whatsapp, activo, ambito, marca, estados, created_at')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Supervisor no encontrado' }, { status: 500 })
  }

  return NextResponse.json({ supervisor: data })
}

export async function DELETE(req: NextRequest) {
  if (!(await verificarAdmin(req))) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  const { error } = await supabase.from('supervisores').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
