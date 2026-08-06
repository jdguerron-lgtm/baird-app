import { describe, it, expect } from 'vitest'
import { campoFalla } from '@/lib/utils/falla'

describe('campoFalla', () => {
  it('coerciona el código numérico (así lo guarda el JSONB)', () => {
    expect(campoFalla({ codigo_falla: 1844 }, 'codigo_falla')).toBe('1844')
    expect(campoFalla({ codigo_falla: 13005 }, 'codigo_falla')).toBe('13005')
  })

  it('devuelve los campos string tal cual, sin espacios sobrantes', () => {
    expect(campoFalla({ descripcion_falla: '  COMPRESOR EN CORTO ' }, 'descripcion_falla')).toBe('COMPRESOR EN CORTO')
    expect(campoFalla({ complejidad_falla: 'Alta' }, 'complejidad_falla')).toBe('Alta')
  })

  it('null cuando falta, está vacío o el triaje no existe', () => {
    expect(campoFalla({ codigo_falla: '' }, 'codigo_falla')).toBeNull()
    expect(campoFalla({}, 'codigo_falla')).toBeNull()
    expect(campoFalla(null, 'codigo_falla')).toBeNull()
    expect(campoFalla(undefined, 'codigo_falla')).toBeNull()
    expect(campoFalla({ codigo_falla: NaN }, 'codigo_falla')).toBeNull()
  })
})
