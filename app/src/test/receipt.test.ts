import { describe, expect, it } from 'vitest'
import { matchProduct, reconcile, sanitizeParsed, tokens, type ParsedReceipt } from '@shared/receipt-logic'

const inv = [
  { id: 'leite', name: 'Leite meio-gordo', brand: 'Mimosa', aliases: [] },
  { id: 'arroz', name: 'Arroz agulha', aliases: [] },
  { id: 'det', name: 'Detergente da roupa', aliases: ['skip liq 40 doses'] },
  { id: 'iog', name: 'Iogurte natural', aliases: [] },
]

describe('associação de artigos ao inventário', () => {
  it('abreviaturas de faturas', () => {
    expect(tokens('LEITE M/G 1L')).toEqual(['leite', 'meio', 'gordo'])
  })
  it('LEITE M/G 1L → Leite meio-gordo', () => {
    const m = matchProduct('LEITE M/G 1L', null, inv)
    expect(m?.product_id).toBe('leite')
    expect(m!.confidence).toBeGreaterThanOrEqual(0.8)
  })
  it('alias aprendido tem prioridade e certeza total', () => {
    expect(matchProduct('SKIP LIQ 40 DOSES', null, inv)).toEqual({ product_id: 'det', confidence: 1, via: 'alias' })
  })
  it('sem correspondência devolve null', () => {
    expect(matchProduct('PILHAS AA', 'Pilhas AA', inv)).toBeNull()
  })
  it('correspondência parcial fica abaixo do limiar automático (pede confirmação)', () => {
    const m = matchProduct('ARROZ CAROLINO 1KG', null, inv)
    expect(m?.product_id).toBe('arroz')
    expect(m!.confidence).toBeLessThan(0.8)
  })
  it('produto diferente da mesma família não é associado', () => {
    expect(matchProduct('IOG GREGO MORANGO', null, inv)).toBeNull()
  })
  it('detergente abreviado', () => {
    expect(matchProduct('DETERG ROUPA LIQ 2L', null, inv)?.product_id).toBe('det')
  })
})

describe('saneamento do resultado da IA', () => {
  const base: ParsedReceipt = {
    store_name: 'Mercadona', store_tax_id: null, document_number: 'ATCUD:X-1', purchase_date: '2026-11-23', total_paid: 16.99,
    total_discount: null, payment_method: 'cartão', warnings: [],
    items: [
      { raw_text: 'LEITE M/G 1L', name: 'Leite', quantity: 6, unit: 'un', unit_price: 0.99, line_total: 5.94, discount: null, is_return: false, category_hint: null, product_match_id: 'inventado', match_confidence: 0.9 },
      { raw_text: 'OVOS', name: 'Ovos', quantity: null, unit: null, unit_price: null, line_total: 3.49, discount: null, is_return: false, category_hint: null, product_match_id: null, match_confidence: null },
      { raw_text: 'ARROZ', name: 'Arroz', quantity: 2, unit: 'un', unit_price: 1.5, line_total: 2.58, discount: null, is_return: false, category_hint: null, product_match_id: 'arroz', match_confidence: 0.7 },
    ],
  }
  const out = sanitizeParsed(base, inv)
  it('ignora IDs de produtos inexistentes e recorre à associação determinística', () => {
    expect(out.items[0].product_match_id).toBe('leite')
  })
  it('não inventa quantidades nem preços', () => {
    expect(out.items[1].quantity).toBeNull()
    expect(out.items[1].unit_price).toBeNull()
    expect(out.warnings.join(' ')).toMatch(/sem quantidade/)
  })
  it('avisa quando quantidade × preço não bate com o total da linha', () => {
    expect(out.warnings.join(' ')).toMatch(/Verificar "Arroz"/)
  })
  it('data inválida é rejeitada', () => {
    expect(sanitizeParsed({ ...base, purchase_date: '23/11/2026' }, inv).purchase_date).toBeNull()
  })
})

describe('conciliação de totais', () => {
  it('coincide', () => {
    const r = reconcile([{ line_total: 5.94 }, { line_total: 2.58 }, { line_total: 3.49 }, { line_total: 4.99 }], 17)
    expect(r.itemsTotal).toBe(17)
    expect(r.ok).toBe(true)
  })
  it('com desconto global e linhas excluídas', () => {
    const r = reconcile([{ line_total: 10 }, { line_total: 5, included: false }, { line_total: -1 }], 8.5, 0.5)
    expect(r.expected).toBe(8.5)
    expect(r.ok).toBe(true)
  })
  it('mostra a diferença', () => {
    const r = reconcile([{ line_total: 10 }], 12.3)
    expect(r.difference).toBe(2.3)
    expect(r.ok).toBe(false)
  })
})
