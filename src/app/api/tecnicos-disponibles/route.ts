import { NextRequest, NextResponse } from 'next/server'
import { listarTecnicosElegibles } from '@/lib/services/tecnicos-elegibles.service'

/**
 * GET /api/tecnicos-disponibles?ciudad=Bogotá&tipo_equipo=Lavadora
 *
 * Técnicos que el cliente puede elegir como "técnico de preferencia" en
 * /solicitar (2026-10-15): verificados, `visible_para_cliente` y que cubren
 * la ciudad + especialidad del tipo de equipo (mismo criterio que la oferta
 * abierta de `notificarTecnicos`).
 *
 * Público (el formulario corre sin sesión). No expone PII: id, nombre corto,
 * foto de perfil (bucket público) y especialidades. El guard real del id
 * elegido está en POST /api/solicitar (resolverTecnicoPreferido).
 *
 * Respuesta: { tecnicos: TecnicoElegible[] }
 */
export async function GET(req: NextRequest) {
  try {
    const ciudad = (req.nextUrl.searchParams.get('ciudad') ?? '').trim().slice(0, 100)
    const tipoEquipo = (req.nextUrl.searchParams.get('tipo_equipo') ?? '').trim().slice(0, 100)
    if (!ciudad || !tipoEquipo) {
      return NextResponse.json({ tecnicos: [] })
    }
    const tecnicos = await listarTecnicosElegibles({ ciudad, tipoEquipo })
    return NextResponse.json(
      { tecnicos },
      { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } },
    )
  } catch (error) {
    console.error('Error en /api/tecnicos-disponibles:', error)
    // Fail-open: el selector es opcional; sin lista el cliente simplemente
    // no elige y la oferta sale abierta.
    return NextResponse.json({ tecnicos: [] })
  }
}
