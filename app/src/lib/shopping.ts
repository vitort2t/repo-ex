import type { Product, ShoppingItem } from './types'

export type Priority = 'high' | 'normal' | 'low'

/** Quantidade sugerida para atingir a quantidade ideal (mínimo 1). */
export function suggestedQuantity(p: Pick<Product, 'quantity' | 'min_quantity' | 'ideal_quantity'>): number {
  const target = Math.max(Number(p.ideal_quantity), Number(p.min_quantity))
  const need = target - Math.max(Number(p.quantity), 0)
  if (need <= 0) return 1
  return Math.ceil(need * 1000) / 1000
}

export function priorityOf(item: ShoppingItem, product?: Product): Priority {
  if (!product) return 'normal'
  if (Number(product.quantity) <= 0) return 'high'
  if (item.source === 'auto' && Number(product.quantity) <= Number(product.min_quantity)) return 'normal'
  return 'low'
}

export function itemQuantity(item: ShoppingItem, product?: Product): number {
  if (item.quantity !== null && item.quantity !== undefined) return Number(item.quantity)
  return product ? suggestedQuantity(product) : 1
}

export type StockState = 'ok' | 'low' | 'out'
export function stockState(p: Pick<Product, 'quantity' | 'min_quantity'>): StockState {
  if (Number(p.quantity) <= 0) return 'out'
  if (Number(p.quantity) <= Number(p.min_quantity)) return 'low'
  return 'ok'
}
