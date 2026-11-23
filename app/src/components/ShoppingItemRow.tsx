import { Check } from 'lucide-react'
import { qty, unitShort } from '@/lib/format'
import { itemQuantity, priorityOf } from '@/lib/shopping'
import type { Product, ShoppingItem } from '@/lib/types'
import { Badge, cx } from './ui'

export function itemName(item: ShoppingItem, product?: Product) {
  return product?.name ?? item.custom_name ?? 'Artigo'
}

export function ShoppingItemRow({ item, product, onToggle, onOpen, big }: {
  item: ShoppingItem; product?: Product; onToggle: () => void; onOpen?: () => void; big?: boolean
}) {
  const p = priorityOf(item, product)
  const q = itemQuantity(item, product)
  const unit = product ? unitShort(product.unit) : 'un.'
  return (
    <div className={cx('flex items-center gap-3 px-4', big ? 'py-4' : 'py-3', item.checked && 'bg-base/60')}>
      <button onClick={onToggle} aria-label={item.checked ? 'Desmarcar' : 'Marcar como encontrado'}
              className={cx('shrink-0 rounded-full border-2 grid place-items-center transition active:scale-90',
                big ? 'h-9 w-9' : 'h-7 w-7', item.checked ? 'bg-sage-600 border-sage-600 text-white' : 'border-ink-muted/50 bg-white')}>
        {item.checked && <Check size={big ? 20 : 16} strokeWidth={3} />}
      </button>
      <button onClick={onOpen ?? onToggle} className="flex-1 min-w-0 text-left">
        <p className={cx('font-semibold truncate', big && 'text-[17px]', item.checked && 'line-through text-ink-muted')}>{itemName(item, product)}</p>
        <p className="text-xs text-ink-muted truncate">
          {product
            ? `Tem ${qty(product.quantity)} · mín. ${qty(product.min_quantity)} · ideal ${qty(product.ideal_quantity)}`
            : 'Adicionado manualmente'}
        </p>
      </button>
      <div className="text-right shrink-0">
        <p className={cx('font-bold tabular-nums', big ? 'text-lg' : '', item.checked && 'text-ink-muted')}>{qty(q)} <span className="text-xs font-semibold text-ink-muted">{unit}</span></p>
        {!item.checked && p === 'high' && <Badge tone="alert">Prioritário</Badge>}
        {!item.checked && item.source === 'manual' && p !== 'high' && <span className="text-[11px] text-ink-muted">manual</span>}
      </div>
    </div>
  )
}
