import { describe, expect, it } from 'vitest'
import { indicators, inRange, monthlyByStore, periodRange, previousRange, storeChanges, totalsByStore } from '@/lib/stats'
import type { Purchase } from '@/lib/types'

let n = 0
const p = (store_chain: Purchase['store_chain'], purchased_at: string, total_paid: number, status: Purchase['status'] = 'confirmed') =>
  ({ id: String(++n), store_chain, store_name: store_chain, purchased_at, total_paid, status }) as Purchase

const data = [
  p('mercadona', '2026-11-03', 100), p('mercadona', '2026-11-20', 85), p('auchan', '2026-11-10', 120),
  p('lidl', '2026-11-12', 65), p('continente', '2026-11-15', 30), p('lidl', '2026-11-18', 50, 'voided'),
  p('mercadona', '2026-10-05', 90), p('auchan', '2026-10-22', 60),
]
const today = new Date(2026, 10, 23)

describe('períodos', () => {
  it('este mês / mês anterior / últimos 3 e 6 / ano', () => {
    expect(periodRange('this_month', today)).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(periodRange('last_month', today)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(periodRange('last_3', today)).toEqual({ from: '2026-09-01', to: '2026-11-30' })
    expect(periodRange('last_6', today)).toEqual({ from: '2026-06-01', to: '2026-11-30' })
    expect(periodRange('this_year', today)).toEqual({ from: '2026-01-01', to: '2026-12-31' })
    expect(periodRange('custom', today, { from: '2026-11-05', to: '2026-11-10' })).toEqual({ from: '2026-11-05', to: '2026-11-10' })
  })
  it('período anterior equivalente', () => {
    expect(previousRange({ from: '2026-11-01', to: '2026-11-30' })).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(previousRange({ from: '2026-09-01', to: '2026-11-30' })).toEqual({ from: '2026-06-01', to: '2026-08-31' })
    expect(previousRange({ from: '2026-11-11', to: '2026-11-20' })).toEqual({ from: '2026-11-01', to: '2026-11-10' })
    expect(previousRange({ from: '2026-03-01', to: '2026-03-31' })).toEqual({ from: '2026-02-01', to: '2026-02-28' })
  })
})

describe('despesas por supermercado', () => {
  const nov = inRange(data, periodRange('this_month', today))
  const oct = inRange(data, periodRange('last_month', today))
  it('exclui compras anuladas e fora do período', () => {
    expect(nov).toHaveLength(5)
    expect(nov.every((x) => x.status === 'confirmed')).toBe(true)
  })
  it('totais e percentagens (exemplo do enunciado)', () => {
    const t = totalsByStore(nov)
    expect(t.map((s) => [s.label, s.total])).toEqual([['Mercadona', 185], ['Auchan', 120], ['Lidl', 65], ['Continente', 30]])
    expect(t.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1)
    expect(t[0].share).toBeCloseTo(185 / 400)
    expect(t[0].count).toBe(2)
    expect(t[0].average).toBe(92.5)
  })
  it('indicadores', () => {
    const i = indicators(nov, oct)
    expect(i.total).toBe(400)
    expect(i.count).toBe(5)
    expect(i.average).toBe(80)
    expect(i.top?.label).toBe('Mercadona')
    expect(i.bottom?.label).toBe('Continente')
    expect(i.previousTotal).toBe(150)
    expect(i.change).toBeCloseTo((400 - 150) / 150)
  })
  it('evolução mensal inclui meses vazios', () => {
    const rows = monthlyByStore(data, { from: '2026-09-01', to: '2026-11-30' }, (s) => s.slice(5, 7))
    expect(rows.map((r) => r.total)).toEqual([0, 150, 400])
    expect(rows[2].mercadona).toBe(185)
    expect(rows[2].lidl).toBe(65) // a anulada (50) não conta
  })
  it('variação por supermercado face ao período anterior', () => {
    const ch = storeChanges(nov, oct)
    const merc = ch.find((c) => c.key === 'mercadona')!
    expect(merc.diff).toBe(95)
    expect(merc.change).toBeCloseTo(95 / 90)
    expect(ch.find((c) => c.key === 'lidl')!.change).toBeNull()
  })
})
