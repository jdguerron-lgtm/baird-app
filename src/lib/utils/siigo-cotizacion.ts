/**
 * Cotización en Siigo — helpers PUROS (sin red ni BD) que arman los payloads
 * de cliente y cotización a partir de una solicitud particular.
 *
 * Los consume `src/lib/services/siigo.service.ts`. IDs/constantes de Siigo
 * viven en `facturacion.ts` (`SIIGO`). Doc: docs/FACTURACION.md § 12.
 */

import { SIIGO, identificacionCliente, itemsFacturaParticular, type ItemFactura } from '@/lib/utils/facturacion'
import { ciudadDane } from '@/lib/constants/dane'

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

/**
 * Correo de contacto cuando el cliente no tiene uno: Siigo lo exige en
 * `contacts[].email`. Decisión 2026-10-22 (docs/FACTURACION.md § 10): nunca
 * bloquea el alta; se usa el buzón de Baird y la FV se entrega por WhatsApp.
 */
export const EMAIL_CONTACTO_FALLBACK = 'baird@bairdservice.com'

/**
 * Payload de `POST /v1/customers`. Solo se usa si el tercero no existe.
 * Campos obligatorios de Siigo cubiertos: person_type, id_type, identification,
 * name, address.city (DANE), contacts[].email, fiscal_responsibilities.
 */
export function armarClienteSiigo(c: DatosClienteSiigo) {
  const ident = identificacionCliente(c.cliente_cedula)
  const esEmpresa = ident.tipoNombre === 'NIT'
  const email = emailValido(c.email) ?? EMAIL_CONTACTO_FALLBACK
  const [nombres, apellidos] = partirNombre(c.cliente_nombre)
  const ciudad = ciudadDane(c.ciudad_pueblo)
  return {
    type: 'Customer',
    person_type: esEmpresa ? 'Company' : 'Person',
    id_type: ident.tipoCodigo,
    identification: ident.identificacion,
    name: esEmpresa ? [c.cliente_nombre.trim()] : [nombres, apellidos],
    active: true,
    vat_responsible: false,
    // R-99-PN = "No aplica – Otros" (DIAN). Vale para persona natural y para
    // empresa no responsable de IVA; contabilidad lo ajusta en Siigo si aplica.
    fiscal_responsibilities: [{ code: 'R-99-PN' }],
    address: {
      address: (c.direccion ?? '').trim() || c.ciudad_pueblo,
      city: { country_code: ciudad.country_code, state_code: ciudad.state_code, city_code: ciudad.city_code },
    },
    phones: [{ indicative: '57', number: telefonoSiigo(c.cliente_telefono) }],
    contacts: [{ first_name: nombres, last_name: apellidos === '.' ? nombres : apellidos, email }],
    comments: ciudad.exacta ? undefined : `Ciudad "${c.ciudad_pueblo}" sin código DANE en Baird — quedó Bogotá por defecto, corregir.`,
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
  opts: { documentId: number; fechaYMD: string; totalBruto: number; descuento: number; codigoServicio: string; tecnico?: string | null; sellerId?: number },
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
      seller: opts.sellerId ?? SIIGO.SELLER_COTIZACION,
      observations,
      // Siigo NO persiste `observations` en cotizaciones (verificado 2026-10-23
      // con C-1-152), así que cuando el tercero es "consumidor final" los
      // datos del cliente viajan en la descripción del primer ítem.
      items: items.map((i, idx) => ({
        code: i.codigo,
        description: (idx === 0 && ident.tipoNombre === 'Consumidor final'
          ? `${i.descripcion} · ${opts.codigoServicio} · ${datos}`
          : `${i.descripcion} · ${opts.codigoServicio}`).slice(0, 500),
        quantity: i.cantidad,
        price: i.base,
        ...(pct > 0 ? { discount: pct } : {}),
        taxes: [{ id: SIIGO.IMPUESTO_IVA_19 }],
      })),
    },
  }
}
