import type { StoreChain } from './types'

// Paleta derivada da identidade LAR. (azul profundo, vinho, ameixa, taupe). A cor segue sempre o supermercado,
// nunca a posição. Como os tons da marca são suaves, os gráficos mostram sempre também o nome (legenda/rótulo).
export const STORES: { key: StoreChain; label: string; color: string }[] = [
  { key: 'mercadona',   label: 'Mercadona',   color: '#14263D' },
  { key: 'auchan',      label: 'Auchan',      color: '#C07A93' },
  { key: 'continente',  label: 'Continente',  color: '#4F79A8' },
  { key: 'pingo_doce',  label: 'Pingo Doce',  color: '#642C40' },
  { key: 'lidl',        label: 'Lidl',        color: '#B3A07F' },
  { key: 'aldi',        label: 'Aldi',        color: '#806071' },
  { key: 'intermarche', label: 'Intermarché', color: '#7FA7C9' },
  { key: 'outros',      label: 'Outros',      color: '#3B2A4F' },
]
export const storeLabel = (k: StoreChain) => STORES.find((s) => s.key === k)?.label ?? 'Outros'
export const storeColor = (k: StoreChain) => STORES.find((s) => s.key === k)?.color ?? '#A6A39A'

/** Espelha public.store_chain_of() — usado apenas para pré-visualização no cliente. */
export function storeChainOf(name: string | null | undefined): StoreChain {
  const n = (name ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  if (/mercadona/.test(n)) return 'mercadona'
  if (/auchan|jumbo|pao de acucar/.test(n)) return 'auchan'
  if (/continente|modelo continente|worten/.test(n)) return 'continente'
  if (/pingo ?doce/.test(n)) return 'pingo_doce'
  if (/lidl/.test(n)) return 'lidl'
  if (/aldi/.test(n)) return 'aldi'
  if (/intermarch|itmp|os mosqueteiros/.test(n)) return 'intermarche'
  return 'outros'
}
