// Estatísticas de despesas calculadas a partir das compras confirmadas da base de dados.
import { isoDate, parseIsoDate } from './format'
import { STORES } from './stores'
import type { Purchase, StoreChain } from './types'

export type PeriodKey = 'this_month' | 'last_month' | 'last_3' | 'last_6' | 'this_year' | 'custom'
export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'this_month', label: 'Este mês' },
  { key: 'last_month', label: 'Mês anterior' },
  { key: 'last_3', label: 'Últimos 3 meses' },
  { key: 'last_6', label: 'Últimos 6 meses' },
  { key: 'this_year', label: 'Este ano' },
  { key: 'custom', label: 'Personalizado' },
]

export type Range = { from: string; to: string } // inclusivo, AAAA-MM-DD

export function monthStart(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
export function monthEnd(d: Date): Date { return new Date(d.getFullYear(), d.getMonth() + 1, 0) }
export function addMonths(d: Date, n: number): Date { return new Date(d.getFullYear(), d.getMonth() + n, 1) }

export function periodRange(key: PeriodKey, today = new Date(), custom?: Range): Range {
  switch (key) {
    case 'this_month': return { from: isoDate(monthStart(today)), to: isoDate(monthEnd(today)) }
    case 'last_month': { const m = addMonths(today, -1); return { from: isoDate(m), to: isoDate(monthEnd(m)) } }
    case 'last_3': return { from: isoDate(addMonths(today, -2)), to: isoDate(monthEnd(today)) }
    case 'last_6': return { from: isoDate(addMonths(today, -5)), to: isoDate(monthEnd(today)) }
    case 'this_year': return { from: `${today.getFullYear()}-01-01`, to: `${today.getFullYear()}-12-31` }
    case 'custom': return custom ?? { from: isoDate(monthStart(today)), to: isoDate(today) }
  }
}

/** Período imediatamente anterior com a mesma duração em meses (para comparações). */
export function previousRange(r: Range): Range {
  const from = parseIsoDate(r.from), to = parseIsoDate(r.to)
  const months = (to.getFullYear() - from.getFullYear()) * 12 + to.getMonth() - from.getMonth() + 1
  const fullMonths = from.getDate() === 1 && to.getDate() === monthEnd(to).getDate()
  if (fullMonths) {
    const pFrom = addMonths(from, -months)
    return { from: isoDate(pFrom), to: isoDate(monthEnd(addMonths(from, -1))) }
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1
  const pTo = new Date(from); pTo.setDate(pTo.getDate() - 1)
  const pFrom = new Date(pTo); pFrom.setDate(pFrom.getDate() - days + 1)
  return { from: isoDate(pFrom), to: isoDate(pTo) }
}

type P = Pick<Purchase, 'id' | 'store_chain' | 'store_name' | 'purchased_at' | 'total_paid' | 'status'>

/** Apenas compras confirmadas dentro do período (anuladas nunca contam). */
export function inRange<T extends P>(purchases: T[], r: Range): T[] {
  return purchases.filter((p) => p.status === 'confirmed' && p.purchased_at >= r.from && p.purchased_at <= r.to)
}

const round2 = (n: number) => Math.round(n * 100) / 100

export type StoreTotal = { key: StoreChain; label: string; color: string; total: number; count: number; share: number; average: number }

export function totalsByStore(purchases: P[]): StoreTotal[] {
  const grand = purchases.reduce((s, p) => s + Number(p.total_paid), 0)
  return STORES.map((s) => {
    const list = purchases.filter((p) => p.store_chain === s.key)
    const total = round2(list.reduce((acc, p) => acc + Number(p.total_paid), 0))
    return { key: s.key, label: s.label, color: s.color, total, count: list.length,
             share: grand > 0 ? total / grand : 0, average: list.length ? round2(total / list.length) : 0 }
  })
    .filter((s) => s.count > 0)
    .sort((a, b) => b.total - a.total)
}

export type Indicators = {
  total: number; count: number; average: number
  top: StoreTotal | null; bottom: StoreTotal | null
  previousTotal: number; change: number | null // variação relativa face ao período anterior
}

export function indicators(current: P[], previous: P[]): Indicators {
  const stores = totalsByStore(current)
  const total = round2(current.reduce((s, p) => s + Number(p.total_paid), 0))
  const previousTotal = round2(previous.reduce((s, p) => s + Number(p.total_paid), 0))
  return {
    total, count: current.length, average: current.length ? round2(total / current.length) : 0,
    top: stores[0] ?? null, bottom: stores.length > 1 ? stores[stores.length - 1] : null,
    previousTotal, change: previousTotal > 0 ? (total - previousTotal) / previousTotal : null,
  }
}

export type MonthRow = { month: string; label: string; total: number } & Partial<Record<StoreChain, number>>

/** Série mensal por supermercado (inclui meses sem compras, com zero). */
export function monthlyByStore(purchases: P[], r: Range, monthLabel: (iso: string) => string): MonthRow[] {
  const rows: MonthRow[] = []
  let m = monthStart(parseIsoDate(r.from))
  const end = parseIsoDate(r.to)
  let guard = 0
  while (m <= end && guard++ < 60) {
    const key = isoDate(m).slice(0, 7)
    const row: MonthRow = { month: key, label: monthLabel(isoDate(m)), total: 0 }
    for (const p of purchases) {
      if (p.status !== 'confirmed' || p.purchased_at.slice(0, 7) !== key) continue
      row[p.store_chain] = round2((row[p.store_chain] ?? 0) + Number(p.total_paid))
      row.total = round2(row.total + Number(p.total_paid))
    }
    rows.push(row)
    m = addMonths(m, 1)
  }
  return rows
}

export type StoreChange = { key: StoreChain; label: string; current: number; previous: number; diff: number; change: number | null }

/** Variação por supermercado entre dois períodos. */
export function storeChanges(current: P[], previous: P[]): StoreChange[] {
  const cur = new Map(totalsByStore(current).map((s) => [s.key, s.total]))
  const prev = new Map(totalsByStore(previous).map((s) => [s.key, s.total]))
  return STORES.filter((s) => cur.has(s.key) || prev.has(s.key)).map((s) => {
    const c = cur.get(s.key) ?? 0, p = prev.get(s.key) ?? 0
    return { key: s.key, label: s.label, current: c, previous: p, diff: round2(c - p), change: p > 0 ? (c - p) / p : null }
  }).sort((a, b) => b.current - a.current)
}

export function monthTotals(purchases: P[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const p of purchases) if (p.status === 'confirmed') m.set(p.purchased_at.slice(0, 7), round2((m.get(p.purchased_at.slice(0, 7)) ?? 0) + Number(p.total_paid)))
  return m
}
