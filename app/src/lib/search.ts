export { daysUntil } from './format'
export const normalizeSearch = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()

export function groupBy<T>(arr: T[], f: (t: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {}
  for (const x of arr) (out[f(x)] ??= []).push(x)
  return out
}
