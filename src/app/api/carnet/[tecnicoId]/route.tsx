import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import {
  CARNET_TECNICO_SELECT,
  construirCarnet,
  formatearFechaCarnet,
  type CarnetTecnicoRow,
} from '@/lib/utils/carnet'

/**
 * GET /api/carnet/{tecnicoId} → PNG del carnet digital del técnico.
 *
 * Es la versión "imagen" del componente `CarnetTecnico` para WhatsApp:
 *   - `procesarAceptacion` la manda como imagen free-form al cliente (best
 *     effort, ventana 24h) en lugar de la foto de la cédula.
 *   - Es el HEADER IMAGE de `tecnico_asignado_cliente_v7` /
 *     `tecnico_asignado_particular_v2` (Meta descarga la URL al enviar).
 *
 * Solo expone datos de carnet: foto de perfil, nombre, especialidad, ciudad,
 * estado de verificación y documento ENMASCARADO (últimos 4). Nunca la foto
 * ni el número completo de la cédula. El id es el UUID del técnico (no
 * enumerable); el contenido es el mismo que ya ve cualquier cliente asignado.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ANCHO = 800
const ALTO = 420

async function cargarLogoDataUrl(req: NextRequest): Promise<string | null> {
  try {
    const base = (process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin).replace(/\/$/, '')
    const res = await fetch(`${base}/Baird_Service_Logo.png`, { cache: 'force-cache' })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    return `data:image/png;base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ tecnicoId: string }> }) {
  const { tecnicoId } = await ctx.params
  if (!UUID_RE.test(tecnicoId)) {
    return NextResponse.json({ error: 'id inválido' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('tecnicos')
    .select(CARNET_TECNICO_SELECT)
    .eq('id', tecnicoId)
    .maybeSingle()

  if (error) {
    console.error('[api/carnet] error leyendo técnico:', error.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Técnico no encontrado' }, { status: 404 })
  }

  const carnet = construirCarnet(data as unknown as CarnetTecnicoRow)
  const fecha = formatearFechaCarnet(carnet.fecha_verificacion)
  const logo = await cargarLogoDataUrl(req)
  const iniciales = carnet.nombre_completo
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('')

  const documento = carnet.documento
    ? `${carnet.tipo_documento ?? 'CC'} ${carnet.documento}`
    : '—'

  const img = new ImageResponse(
    (
      <div
        style={{
          width: ANCHO,
          height: ALTO,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#ffffff',
          fontFamily: 'sans-serif',
          color: '#0f172a',
        }}
      >
        {/* Banda superior */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '18px 32px',
            backgroundColor: '#0f172a',
            color: '#cbd5e1',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logo}
                alt="Baird Service"
                width={210}
                height={56}
                style={{ objectFit: 'contain', backgroundColor: '#ffffff', borderRadius: 10, padding: '2px 8px' }}
              />
            ) : (
              <span style={{ fontSize: 22, fontWeight: 700, color: '#ffffff', letterSpacing: 1 }}>BAIRD SERVICE</span>
            )}
          </div>
          <span style={{ fontSize: 14, letterSpacing: 3, textTransform: 'uppercase' }}>Carnet digital · Técnico</span>
        </div>

        {/* Cuerpo */}
        <div style={{ display: 'flex', flex: 1, padding: '28px 32px' }}>
          {/* Foto */}
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: 24,
              overflow: 'hidden',
              backgroundColor: '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              border: '4px solid #e2e8f0',
            }}
          >
            {carnet.foto_perfil_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={carnet.foto_perfil_url}
                alt=""
                width={200}
                height={200}
                style={{ objectFit: 'cover', width: 200, height: 200 }}
              />
            ) : (
              <span style={{ fontSize: 64, fontWeight: 700, color: '#64748b' }}>{iniciales || '?'}</span>
            )}
          </div>

          {/* Datos */}
          <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 32, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 360 }}>
                <span style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1 }}>{carnet.nombre_completo}</span>
                <span style={{ fontSize: 18, color: '#475569', marginTop: 6 }}>
                  {carnet.especialidad_principal ? `Técnico · ${carnet.especialidad_principal}` : 'Técnico de línea blanca'}
                </span>
                {carnet.ciudad_pueblo && (
                  <span style={{ fontSize: 15, color: '#94a3b8', marginTop: 4 }}>{carnet.ciudad_pueblo}</span>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '6px 14px',
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 700,
                  backgroundColor: carnet.verificado ? '#ecfdf5' : '#fffbeb',
                  color: carnet.verificado ? '#047857' : '#b45309',
                  border: `1px solid ${carnet.verificado ? '#a7f3d0' : '#fde68a'}`,
                }}
              >
                {/* Sin glifos especiales: satori intenta descargar una fuente dinámica por cada símbolo */}
                {carnet.verificado ? 'VERIFICADO' : 'EN VERIFICACIÓN'}
              </div>
            </div>

            <div style={{ display: 'flex', marginTop: 'auto', width: '100%' }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: 240 }}>
                <span style={{ fontSize: 11, letterSpacing: 2, color: '#94a3b8', textTransform: 'uppercase' }}>Documento</span>
                <span style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{documento}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', width: 160 }}>
                <span style={{ fontSize: 11, letterSpacing: 2, color: '#94a3b8', textTransform: 'uppercase' }}>Carnet N°</span>
                <span style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>{carnet.codigo}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                <span style={{ fontSize: 11, letterSpacing: 2, color: '#94a3b8', textTransform: 'uppercase' }}>Verificado el</span>
                <span style={{ fontSize: 22, fontWeight: 700, marginTop: 2 }}>
                  {carnet.verificado ? (fecha ?? 'Sí') : 'Pendiente'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Pie */}
        <div
          style={{
            display: 'flex',
            padding: '14px 32px',
            backgroundColor: '#f8fafc',
            borderTop: '1px solid #e2e8f0',
            fontSize: 14,
            color: '#475569',
          }}
        >
          Pídele su cédula física y confirma que el número coincida · Nunca pagues en efectivo al técnico
        </div>
      </div>
    ),
    { width: ANCHO, height: ALTO },
  )

  // Meta descarga la URL en cada envío; cache corto para no re-renderizar en
  // cada hit pero reflejar cambios de verificación/foto en minutos.
  img.headers.set('Cache-Control', 'public, max-age=600, s-maxage=600')
  return img
}
