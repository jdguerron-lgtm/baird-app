'use client'

/**
 * MapView.tsx — Componente Leaflet del mapa admin.
 *
 * Importado SOLO via dynamic({ ssr: false }) desde page.tsx — Leaflet usa
 * window/document directamente al cargar, así que no es safe en SSR.
 *
 * Recibe ya filtradas las solicitudes del padre. No hace data fetching.
 */

import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { COLOR_POR_ESTADO, COLOR_ESTADO_DEFAULT, colorPorTecnico } from '@/lib/constants/mapa-colors'
import { ESTADO_LABELS } from '@/lib/constants/estados'

export interface SolicitudPin {
  id: string
  cliente_nombre: string
  tipo_equipo: string
  marca_equipo: string
  direccion: string
  ciudad_pueblo: string
  estado: string
  tecnico_asignado_id: string | null
  tecnico_nombre: string | null
  direccion_lat: number
  direccion_lng: number
  direccion_geocoding_aproximada: boolean
  fecha_visita_at: string | null
  horario_confirmado: string | null
}

interface MapViewProps {
  solicitudes: SolicitudPin[]
  colorMode: 'estado' | 'tecnico'
  onSelect: (id: string) => void
  selectedId: string | null
}

/** Crea un L.divIcon coloreado, con outline blanco para legibilidad. */
function pinIcon(color: string, aproximada: boolean): L.DivIcon {
  // Si aproximada, usar marco punteado para diferenciar visualmente.
  const border = aproximada ? '2px dashed white' : '2px solid white'
  return L.divIcon({
    className: 'baird-pin',
    html: `<div style="
      width: 22px; height: 22px; border-radius: 50%;
      background: ${color}; border: ${border};
      box-shadow: 0 1px 3px rgba(0,0,0,0.5);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11],
  })
}

/**
 * Componente helper que vuela el mapa hacia un pin seleccionado.
 * Se monta dentro de MapContainer para tener acceso a `useMap()`.
 *
 * IMPORTANTE: solo se re-dispara cuando cambia selectedId (no cuando cambian
 * los filtros que rebuild el array de solicitudes). De lo contrario el mapa
 * volaría cada vez que el usuario toca un filtro.
 */
function FlyToSelected({ solicitudes, selectedId }: { solicitudes: SolicitudPin[]; selectedId: string | null }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedId) return
    const sel = solicitudes.find((s) => s.id === selectedId)
    if (!sel) return
    map.flyTo([sel.direccion_lat, sel.direccion_lng], Math.max(map.getZoom(), 14), { duration: 0.8 })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solicitudes intencionalmente omitido
  }, [selectedId, map])
  return null
}

export default function MapView({ solicitudes, colorMode, onSelect, selectedId }: MapViewProps) {
  // Centro inicial: Bogotá (la mayor parte de la operación). Cuando hay datos,
  // setBounds para englobar todos los pines.
  const initialCenter: [number, number] = [4.6, -74.08]
  const initialZoom = 11

  const bounds = useMemo<L.LatLngBoundsExpression | undefined>(() => {
    if (solicitudes.length === 0) return undefined
    const lats = solicitudes.map((s) => s.direccion_lat)
    const lngs = solicitudes.map((s) => s.direccion_lng)
    return [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ]
  }, [solicitudes])

  return (
    <MapContainer
      center={initialCenter}
      zoom={initialZoom}
      bounds={bounds}
      boundsOptions={{ padding: [40, 40], maxZoom: 13 }}
      style={{ height: '100%', width: '100%' }}
      scrollWheelZoom
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      <MarkerClusterGroup chunkedLoading maxClusterRadius={50}>
        {solicitudes.map((s) => {
          const color =
            colorMode === 'estado'
              ? COLOR_POR_ESTADO[s.estado] ?? COLOR_ESTADO_DEFAULT
              : colorPorTecnico(s.tecnico_asignado_id)
          return (
            <Marker
              key={s.id}
              position={[s.direccion_lat, s.direccion_lng]}
              icon={pinIcon(color, s.direccion_geocoding_aproximada)}
              eventHandlers={{
                click: () => onSelect(s.id),
              }}
            >
              <Popup>
                <div className="text-xs">
                  <div className="font-semibold text-slate-900">{s.cliente_nombre}</div>
                  <div className="text-slate-600">{s.tipo_equipo} {s.marca_equipo}</div>
                  <div className="text-slate-500 mt-1">{ESTADO_LABELS[s.estado] ?? s.estado}</div>
                  {s.tecnico_nombre && (
                    <div className="text-slate-500">👨‍🔧 {s.tecnico_nombre}</div>
                  )}
                  {s.direccion_geocoding_aproximada && (
                    <div className="text-amber-700 italic mt-1">⚠ ubicación aproximada</div>
                  )}
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MarkerClusterGroup>

      <FlyToSelected solicitudes={solicitudes} selectedId={selectedId} />
    </MapContainer>
  )
}
