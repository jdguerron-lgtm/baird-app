import { describe, expect, it } from 'vitest'
import { armarClienteSiigo, armarCotizacionSiigo, partirNombre } from '@/lib/utils/siigo-cotizacion'

const SOL = {
  id: '6c7efe75-6309-432e-8809-61d2a5013e3e',
  cliente_nombre: 'Juliana Hernández Ruiz',
  cliente_telefono: '573134951164',
  cliente_cedula: '1020304050',
  ciudad_pueblo: 'Bogotá',
  direccion: 'Cra 10 # 20-30',
  email: 'ju@correo.com',
  tipo_equipo: 'Lavadora',
  marca_equipo: 'Samsung',
  tipo_solicitud: 'Reparación',
  cotizacion: { diagnostico_cliente: 41650, servicio_cliente: 83300 },
}

describe('partirNombre', () => {
  it('separa nombres y apellidos', () => {
    expect(partirNombre('Juan Pérez')).toEqual(['Juan', 'Pérez'])
    expect(partirNombre('Ana María Gómez Ruiz')).toEqual(['Ana María', 'Gómez Ruiz'])
    expect(partirNombre('Cher')).toEqual(['Cher', '.'])
  })
})

describe('armarClienteSiigo', () => {
  it('persona con cédula: teléfono sin 57 y email en contactos', () => {
    const c = armarClienteSiigo(SOL)
    expect(c).toMatchObject({ person_type: 'Person', id_type: '13', identification: '1020304050' })
    expect(c.phones[0].number).toBe('3134951164')
    expect(c.contacts[0]).toMatchObject({ email: 'ju@correo.com' })
  })
  it('cubre lo obligatorio de Siigo: ciudad DANE, responsabilidad fiscal y email de contacto', () => {
    const c = armarClienteSiigo({ ...SOL, email: null, ciudad_pueblo: 'Bogotá D.C.' })
    expect(c.address.city).toEqual({ country_code: 'Co', state_code: '11', city_code: '11001' })
    expect(c.fiscal_responsibilities).toEqual([{ code: 'R-99-PN' }])
    expect(c.contacts[0].email).toBe('baird@bairdservice.com')
    expect(c.comments).toBeUndefined()
  })
  it('ciudad desconocida cae en Bogotá y lo avisa en comments', () => {
    const c = armarClienteSiigo({ ...SOL, ciudad_pueblo: 'Villa de Leyva' })
    expect(c.address.city.city_code).toBe('11001')
    expect(c.comments).toContain('Villa de Leyva')
  })
  it('NIT → empresa con razón social', () => {
    const c = armarClienteSiigo({ ...SOL, cliente_cedula: '900123456', cliente_nombre: 'ACME SAS' })
    expect(c).toMatchObject({ person_type: 'Company', id_type: '31', name: ['ACME SAS'] })
  })
})

describe('armarCotizacionSiigo', () => {
  const opts = { documentId: 77, fechaYMD: '2026-10-22', totalBruto: 124950, descuento: 0, codigoServicio: 'BS-6C7EFE75' }
  it('un renglón por ítem, precio sin IVA e IVA 19 %', () => {
    const { payload } = armarCotizacionSiigo(SOL, opts)
    expect(payload.document.id).toBe(77)
    expect(payload.items).toHaveLength(2)
    expect(payload.items[0].price).toBe(35000)
    expect(payload.items[0].taxes).toEqual([{ id: 4399 }])
    expect(payload.customer.identification).toBe('1020304050')
    expect(payload.observations).toContain('Tel: 573134951164')
    expect(payload.observations).toContain('Dir: Cra 10 # 20-30, Bogotá')
  })
  it('sin cédula usa consumidor final y deja los datos en observaciones', () => {
    const { payload } = armarCotizacionSiigo({ ...SOL, cliente_cedula: null }, opts)
    expect(payload.customer.identification).toBe('222222222222')
    expect(payload.observations).toContain('Juliana Hernández Ruiz')
    expect(payload.observations).toContain('consumidor final')
  })
  it('descuento se reparte como % por ítem', () => {
    const { payload } = armarCotizacionSiigo(SOL, { ...opts, descuento: 12495 })
    expect(payload.items.every((i) => i.discount === 10)).toBe(true)
  })
})
