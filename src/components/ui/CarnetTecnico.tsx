import Image from 'next/image'
import { formatearFechaCarnet, type CarnetTecnicoData } from '@/lib/utils/carnet'

interface Props {
  carnet: CarnetTecnicoData
  /**
   * Texto de ayuda al pie. 'cliente' = cómo verificar al técnico en la puerta;
   * 'tecnico' = recordatorio de mostrar la cédula física; 'ninguno' = solo tarjeta.
   */
  ayuda?: 'cliente' | 'tecnico' | 'ninguno'
  className?: string
}

/**
 * Carnet digital del técnico (2026-10-10). Sustituye la foto de la cédula:
 * muestra foto de perfil, nombre, especialidad, ciudad, estado de verificación
 * y el documento ENMASCARADO (últimos 4 dígitos) para que el cliente lo
 * compare con la cédula física que el técnico presenta al llegar.
 *
 * Mismo modelo que el PNG de `GET /api/carnet/{id}` (versión WhatsApp).
 */
export default function CarnetTecnico({ carnet, ayuda = 'ninguno', className = '' }: Props) {
  const fecha = formatearFechaCarnet(carnet.fecha_verificacion)
  const iniciales = carnet.nombre_completo
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div className={`w-full max-w-sm mx-auto ${className}`}>
      <div className="rounded-3xl overflow-hidden shadow-xl border border-slate-200 bg-white">
        {/* Banda superior */}
        <div className="bg-slate-900 px-5 pt-4 pb-14 relative">
          <div className="flex items-center justify-between">
            <div className="relative w-28 h-8">
              <Image
                src="/Baird_Service_Logo.png"
                alt="Baird Service"
                fill
                sizes="112px"
                className="object-contain object-left brightness-0 invert"
              />
            </div>
            <span className="text-[10px] font-semibold tracking-[0.18em] text-slate-300 uppercase">
              Carnet digital
            </span>
          </div>
          <p className="mt-3 text-[11px] text-slate-400">
            Técnico de la red Baird Service · Línea blanca
          </p>
          {/* Foto superpuesta */}
          <div className="absolute left-5 -bottom-12 w-24 h-24 rounded-2xl ring-4 ring-white bg-slate-200 overflow-hidden shadow-md">
            {carnet.foto_perfil_url ? (
              <Image
                src={carnet.foto_perfil_url}
                alt={`Foto de ${carnet.nombre_completo}`}
                fill
                sizes="96px"
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-slate-500">
                {iniciales || '?'}
              </div>
            )}
          </div>
        </div>

        {/* Cuerpo */}
        <div className="px-5 pt-14 pb-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-lg font-bold text-slate-900 leading-tight break-words">
                {carnet.nombre_completo}
              </h3>
              <p className="text-sm text-slate-600 mt-0.5">
                {carnet.especialidad_principal ? `Técnico · ${carnet.especialidad_principal}` : 'Técnico de línea blanca'}
              </p>
              {carnet.ciudad_pueblo && (
                <p className="text-xs text-slate-400 mt-0.5">📍 {carnet.ciudad_pueblo}</p>
              )}
            </div>
            {carnet.verificado ? (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-semibold px-2.5 py-1">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Verificado
              </span>
            ) : (
              <span className="shrink-0 inline-flex items-center rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-[11px] font-semibold px-2.5 py-1">
                En verificación
              </span>
            )}
          </div>

          <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-3 text-sm">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Documento</dt>
              <dd className="font-mono text-slate-900 mt-0.5">
                {carnet.documento_enmascarado
                  ? `${carnet.tipo_documento ?? 'CC'} ${carnet.documento_enmascarado}`
                  : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Carnet N°</dt>
              <dd className="font-mono text-slate-900 mt-0.5">{carnet.codigo}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Verificado el</dt>
              <dd className="text-slate-900 mt-0.5">{carnet.verificado ? (fecha ?? 'Sí') : 'Pendiente'}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">Contrato</dt>
              <dd className="text-slate-900 mt-0.5">{carnet.contrato_firmado ? 'Firmado' : '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Pie */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3">
          <p className="text-[11px] text-slate-500 leading-snug">
            {ayuda === 'cliente' && (
              <>
                <span className="font-semibold text-slate-700">Al llegar, pídele su cédula física</span> y confirma que
                los últimos dígitos coincidan con este carnet. Nunca pagues en efectivo al técnico.
              </>
            )}
            {ayuda === 'tecnico' && (
              <>
                Muestra este carnet al cliente al llegar y ten tu cédula física a la mano: el cliente
                comparará los últimos dígitos.
              </>
            )}
            {ayuda === 'ninguno' && <>Carnet emitido por Baird Service S.A.S. · lineablanca.bairdservice.com</>}
          </p>
        </div>
      </div>
    </div>
  )
}
