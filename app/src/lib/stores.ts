import type { StoreChain } from './types'

// Paleta categórica validada (contraste e daltonismo) — a cor segue sempre o supermercado, nunca a posição.
export const STORES: { key: StoreChain; label: string; color: string }[] = [
  { key: 'mercadona',   label: 'Mercadona',   color: '#2a78d6' },
  { key: 'auchan',      label: 'Auchan',      color: '#eb6834' },
  { key: 'continente',  label: 'Continente',  color: '#1baf7a' },
  { key: 'pingo_doce',  label: 'Pingo Doce',  color: '#eda100' },
  { key: 'lidl',        label: 'Lidl',        color: '#e87ba4' },
  { key: 'aldi',        label: 'Aldi',        color: '#008300' },
  { key: 'intermarche', label: 'Intermarché', color: '#6250d6' },
  { key: 'outros',      label: 'Outros',      color: '#e34948' },
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
