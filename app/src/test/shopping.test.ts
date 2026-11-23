import { describe, expect, it } from 'vitest'
import { suggestedQuantity, stockState } from '@/lib/shopping'
import { toCsv } from '@/lib/export'
import { storeChainOf } from '@/lib/stores'
import { parseDecimal } from '@/lib/format'

describe('lista inteligente', () => {
  it('arroz: atual 1, mínimo 2, ideal 5 → comprar 4', () => {
    expect(suggestedQuantity({ quantity: 1, min_quantity: 2, ideal_quantity: 5 })).toBe(4)
  })
  it('stock negativo conta como zero', () => {
    expect(suggestedQuantity({ quantity: -2, min_quantity: 1, ideal_quantity: 3 })).toBe(3)
  })
  it('estado do stock', () => {
    expect(stockState({ quantity: 0, min_quantity: 2 })).toBe('out')
    expect(stockState({ quantity: 2, min_quantity: 2 })).toBe('low')
    expect(stockState({ quantity: 3, min_quantity: 2 })).toBe('ok')
  })
})

describe('utilitários', () => {
  it('cadeias de supermercado (igual à função SQL)', () => {
    expect(storeChainOf('MERCADONA, S.A.')).toBe('mercadona')
    expect(storeChainOf('Pingo Doce Matosinhos')).toBe('pingo_doce')
    expect(storeChainOf('Intermarché Gaia')).toBe('intermarche')
    expect(storeChainOf('Jumbo Alfragide')).toBe('auchan')
    expect(storeChainOf('Mercearia do Sr. Zé')).toBe('outros')
  })
  it('números com vírgula', () => {
    expect(parseDecimal('1,25')).toBe(1.25)
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('abc')).toBeNull()
  })
  it('CSV com ; e aspas', () => {
    expect(toCsv([{ a: 'x;y', b: 1.5 }])).toBe('a;b\r\n"x;y";1,5')
  })
})
