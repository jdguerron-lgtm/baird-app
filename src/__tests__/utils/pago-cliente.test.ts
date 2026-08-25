import { describe, expect, it } from 'vitest'
import { estadoPagoCliente } from '@/lib/constants/pago-cliente'

describe('estadoPagoCliente — capa paralela de pago (solo particular)', () => {
  it('garantía nunca tiene estado de pago (paga la marca)', () => {
    expect(
      estadoPagoCliente({ es_garantia: true, anticipo_pagado_at: '2026-08-20T10:00:00Z', saldo_pagado_at: '2026-08-21T10:00:00Z' }),
    ).toBeNull()
  })

  it('saldo pagado gana sobre anticipo: servicio totalmente pagado', () => {
    expect(
      estadoPagoCliente({ es_garantia: false, anticipo_pagado_at: '2026-08-20T10:00:00Z', saldo_pagado_at: '2026-08-21T10:00:00Z' }),
    ).toBe('pagado')
  })

  it('solo anticipo → anticipo_pagado', () => {
    expect(
      estadoPagoCliente({ es_garantia: false, anticipo_pagado_at: '2026-08-20T10:00:00Z', saldo_pagado_at: null }),
    ).toBe('anticipo_pagado')
  })

  it('particular sin pagos → pendiente', () => {
    expect(estadoPagoCliente({ es_garantia: false, estado: 'asignada' })).toBe('pendiente')
  })

  it('cancelada/sin_agendar sin pagos → null (no hay nada que cobrar)', () => {
    expect(estadoPagoCliente({ es_garantia: false, estado: 'cancelada' })).toBeNull()
    expect(estadoPagoCliente({ es_garantia: false, estado: 'sin_agendar' })).toBeNull()
  })

  it('cancelada CON anticipo pagado sigue visible (relevante para devoluciones)', () => {
    expect(
      estadoPagoCliente({ es_garantia: false, estado: 'cancelada', anticipo_pagado_at: '2026-08-20T10:00:00Z' }),
    ).toBe('anticipo_pagado')
  })

  it('es_garantia null se trata como particular (dato legacy)', () => {
    expect(estadoPagoCliente({ es_garantia: null, estado: 'asignada' })).toBe('pendiente')
  })
})
