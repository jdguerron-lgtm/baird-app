import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { verificarLectura } from '@/lib/auth/admin'
import { listarTecnicosElegibles } from '@/lib/services/tecnicos-elegibles.service'

/**
 * GET /api/admin/candidatos-oferta?solicitudId=…
 *
 * Técnicos a los que el admin puede dirigir la oferta de una solicitud
 * (invitación prioritaria, 2026-10-22): mismo criterio que la oferta abierta
 * de `notificarTecnicos` (especialidad del tipo de equipo + verificado +
 * cobertura de la ciudad) e INCLUYE los perfiles ocultos al cliente
 * (`visible_para_cliente=false`), que el selector público no muestra.
 *
 * Solo lectura; requiere sesión admin (rol lectura también puede consultar,
 * el envío lo gatea POST /api/whatsapp/notify).
 *
 * Respuesta: { candidatos: TecnicoElegible[], preferidoId: string | null }
 */
export async function GET(req: NextRequest) {
  try {
    const puedeLeer = await verificarLectura(req)
    if (!puedeLeer) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const solicitudId = (req.nextUrl.searchParams.get('solicitudId') ?? '').trim()
    if (!solicitudId) {
      return NextResponse.json({ error: 'solicitudId es requerido' }, { status: 400 })
    }

    const { data: sol, error } = await supabase
      .from('solicitudes_servicio')
      .select('id, ciudad_pueblo, tipo_equipo, tecnico_preferido_id')
      .eq('id', solicitudId)
      .single()
    if (error || !sol) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 })
    }

    const candidatos = await listarTecnicosElegibles({
      ciudad: sol.ciudad_pueblo ?? '',
      tipoEquipo: sol.tipo_equipo ?? '',
      incluirOcultos: true,
    })
    return NextResponse.json({ candidatos, preferidoId: sol.tecnico_preferido_id ?? null })
  } catch (err) {
    console.error('[/api/admin/candidatos-oferta] Error:', err)
    return NextResponse.json({ error: 'Error interno del servidor' }, { status: 500 })
  }
}
