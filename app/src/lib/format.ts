const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' })
const num = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 3 })
const pct = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 1 })

export const money = (v: number | null | undefined) => (v === null || v === undefined ? '—' : eur.format(v))
export const qty = (v: number | null | undefined) => (v === null || v === undefined ? '—' : num.format(v))
export const percent = (ratio: number | null | undefined) => (ratio === null || ratio === undefined || !Number.isFinite(ratio) ? '—' : pct.format(ratio))

export function parseDecimal(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.')
  if (t === '' || t === '-' || t === '.') return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export const UNITS: { value: string; label: string }[] = [
  { value: 'un', label: 'unidades' },
  { value: 'emb', label: 'embalagens' },
  { value: 'kg', label: 'kg' },
  { value: 'g', label: 'g' },
  { value: 'l', label: 'litros' },
  { value: 'ml', label: 'ml' },
]
export const unitShort = (u: string) => (u === 'un' ? 'un.' : u === 'emb' ? 'emb.' : u)

/** Data local no formato AAAA-MM-DD (sem conversão UTC). */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Interpreta "AAAA-MM-DD" como data local. */
export function parseIsoDate(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

const dateFmt = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' })
const dateShort = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: 'short' })
const timeFmt = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' })
const monthFmt = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' })
const monthShortFmt = new Intl.DateTimeFormat('pt-PT', { month: 'short' })

const asDate = (v: string | Date) => (typeof v === 'string' ? (v.length === 10 ? parseIsoDate(v) : new Date(v)) : v)
export const fmtDate = (v: string | Date | null | undefined) => (v ? dateFmt.format(asDate(v)) : '—')
export const fmtDateShort = (v: string | Date) => dateShort.format(asDate(v))
export const fmtTime = (v: string | Date) => timeFmt.format(asDate(v))
export const fmtMonth = (v: string | Date) => { const s = monthFmt.format(asDate(v)); return s.charAt(0).toUpperCase() + s.slice(1) }
export const fmtMonthShort = (v: string | Date) => monthShortFmt.format(asDate(v)).replace('.', '')

export function relativeDay(v: string): string {
  const d = new Date(v)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const that = new Date(d); that.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - that.getTime()) / 86400000)
  if (diff === 0) return `Hoje, ${fmtTime(d)}`
  if (diff === 1) return `Ontem, ${fmtTime(d)}`
  return `${fmtDateShort(d)}, ${fmtTime(d)}`
}

export function daysUntil(isoDay: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((parseIsoDate(isoDay).getTime() - today.getTime()) / 86400000)
}

export function greeting(d = new Date()): string {
  const h = d.getHours()
  return h < 6 ? 'Boa noite' : h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'
}
