/**
 * Cotización en Siigo — helpers PUROS (sin red ni BD) que arman los payloads
 * de cliente y cotización a partir de una solicitud particular.
 *
 * Los consume `src/lib/services/siigo.service.ts`. IDs/constantes de Siigo
 * viven en `facturacion.ts` (`SIIGO`). Doc: docs/FACTURACION.md § 12.
 */

import { SIIGO, identificacionCliente, itemsFacturaParticular, type ItemFactura } from '@/lib/utils/facturacion'

export interface DatosClienteSiigo {
  cliente_nombre: string
  cliente_telefono: string
  cliente_cedula?: string | null
  ciudad_pueblo: string
  direccion?: string | null
  email?: string | null
}

export interface DatosCotizacionSiigo extends DatosClienteSiigo {
  id: string
  tipo_equipo: string
  marca_equipo: string
  tipo_solicitud: string
  cotizacion?: { diagnostico_cliente?: unknown; servicio_cliente?: unknown } | null
}

/** "Juan Pérez Gómez" → ['Juan', 'Pérez Gómez'] (Siigo pide [nombres, apellidos]). */
export function partirNombre(nombre: string): [string, string] {
  const partes = nombre.trim().replace(/\s+/g, ' ').split(' ')
  if (partes.length <= 1) return [partes[0] || 'Cliente', '.']
  const corte = partes.length >= 4 ? 2 : 1
  return [partes.slice(0, corte).join(' '), partes.slice(corte).join(' ')]
}

export function emailValido(e: string | null | undefined): string | null {
  const v = (e ?? '').trim()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null
}

function telefonoSiigo(tel: string): string {
  // Siigo guarda el móvil CO sin prefijo país: 573134951164 → 3134951164
  const d = (tel ?? '').replace(/\D/g, '')
  return d.startsWith('57') && d.length === 12 ? d.slice(2) : d
}

/** Payload de `POST /v1/customers`. Solo se usa si el tercero no existe. */
export function armarClienteSiigo(c: DatosClienteSiigo) {
  const ident = identificacionCliente(c.cliente_cedula)
  const esEmpresa = ident.tipoNombre === 'NIT'
  const email = emailValido(c.email)
  const [nombres, apellidos] = partirNombre(c.cliente_nombre)
  return {
    type: 'Customer',
    person_type: esEmpresa ? 'Company' : 'Person',
    id_type: ident.tipoCodigo,
    identification: ident.identificacion,
    name: esEmpresa ? [c.cliente_nombre.trim()] : [nombres, apellidos],
    address: { address: [c.direccion, c.ciudad_pueblo].filter(Boolean).join(', ') || c.ciudad_pueblo },
    phones: [{ number: telefonoSiigo(c.cliente_telefono) }],
    contacts: [{ first_name: nombres, last_name: apellidos === '.' ? '' : apellidos, ...(email ? { email } : {}) }],
  }
}

export interface PayloadCotizacion {
  document: { id: number }
  date: string
  customer: { identification: string; branch_office: number }
  seller: number
  observations: string
  items: Array<{ code: string; description: string; quantity: number; price: number; discount?: number; taxes: Array<{ id: number }> }>
}

/**
 * Payload de `POST /v1/quotations`. `descuento` (COP con IVA) se reparte como
 * % por ítem para que el total de la cotización coincida con lo que paga el
 * cliente. Siigo recibe `price` SIN IVA.
 */
export function armarCotizacionSiigo(
  sol: DatosCotizacionSiigo,
  opts: { documentId: number; fechaYMD: string; totalBruto: number; descuento: number; codigoServicio: string; tecnico?: string | null },
): { payload: PayloadCotizacion; items: ItemFactura[] } {
  const ident = identificacionCliente(sol.cliente_cedula)
  const items = itemsFacturaParticular(sol, opts.totalBruto)
  const pct = opts.totalBruto > 0 && opts.descuento > 0
    ? Math.min(100, Math.round((opts.descuento / opts.totalBruto) * 10000) / 100)
    : 0
  const equipo = `${sol.tipo_equipo} ${sol.marca_equipo}`.trim()
  const email = emailValido(sol.email)
  const datos = [
    `Cliente: ${sol.cliente_nombre}`,
    `Tel: ${sol.cliente_telefono}`,
    sol.cliente_cedula ? `Doc: ${sol.cliente_cedula}` : 'Sin documento (consumidor final)',
    `Dir: ${[sol.direccion, sol.ciudad_pueblo].filter(Boolean).join(', ')}`,
    email ? `Email: ${email}` : null,
  ].filter(Boolean).join(' · ')
  const observations = [
    `${opts.codigoServicio} · ${sol.tipo_solicitud} ${equipo}`,
    datos,
    opts.tecnico ? `Técnico: ${opts.tecnico}` : null,
    pct > 0 ? `Descuento por código: ${pct}% (−$${opts.descuento})` : null,
  ].filter(Boolean).join('\n')
  return {
    items,
    payload: {
      document: { id: opts.documentId },
      date: opts.fechaYMD,
      customer: { identification: ident.identificacion, branch_office: 0 },
      seller: SIIGO.SELLER_FV2,
      observations,
      items: items.map((i) => ({
        code: i.codigo,
        description: `${i.descripcion} · ${opts.codigoServicio}`,
        quantity: i.cantidad,
        price: i.base,
        ...(pct > 0 ? { discount: pct } : {}),
        taxes: [{ id: SIIGO.IMPUESTO_IVA_19 }],
      })),
    },
  }
}
