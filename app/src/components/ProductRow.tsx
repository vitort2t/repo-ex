import { Minus, Plus, Package } from 'lucide-react'
import { Link } from 'react-router-dom'
import { qty, unitShort } from '@/lib/format'
import { stockState } from '@/lib/shopping'
import type { Category, Location, Product } from '@/lib/types'
import { useProductPhotoUrl } from '@/hooks/data'
import { Badge, cx } from './ui'

export function StockBadge({ product }: { product: Product }) {
  const s = stockState(product)
  if (s === 'out') return <Badge tone="alert">Esgotado</Badge>
  if (s === 'low') return <Badge tone="warn">Stock baixo</Badge>
  return null
}

export function ProductThumb({ product, size = 44 }: { product: Product; size?: number }) {
  const { data: url } = useProductPhotoUrl(product.photo_path)
  return (
    <div className="shrink-0 rounded-xl bg-sand grid place-items-center overflow-hidden text-ink-muted" style={{ width: size, height: size }}>
      {url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <Package size={size * 0.45} strokeWidth={1.6} />}
    </div>
  )
}

export function ProductRow({ product, category, location, onMove, expiresIn }: {
  product: Product; category?: Category; location?: Location; onMove: (p: Product, d: 'in' | 'out') => void; expiresIn?: number | null
}) {
  const s = stockState(product)
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link to={`/stock/${product.id}`} className="flex items-center gap-3 min-w-0 flex-1">
        <ProductThumb product={product} />
        <div className="min-w-0">
          <p className="font-semibold truncate">{product.name}</p>
          <p className="text-xs text-ink-muted truncate">
            {[product.brand, category?.name, location?.name].filter(Boolean).join(' · ') || 'Sem categoria'}
          </p>
          <div className="flex gap-1.5 mt-1"><StockBadge product={product} />
            {expiresIn !== undefined && expiresIn !== null && expiresIn <= 7 &&
              <Badge tone={expiresIn < 0 ? 'alert' : 'warn'}>{expiresIn < 0 ? 'Expirado' : expiresIn === 0 ? 'Expira hoje' : `Expira em ${expiresIn} d`}</Badge>}
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-1.5 shrink-0">
        <button aria-label={`Retirar ${product.name}`} onClick={() => onMove(product, 'out')} className="h-11 w-11 rounded-xl bg-sand grid place-items-center active:scale-95 text-ink"><Minus size={20} /></button>
        <div className="w-12 text-center leading-tight">
          <p className={cx('text-lg font-bold tabular-nums', s === 'out' ? 'text-alert-ink' : s === 'low' ? 'text-warn-ink' : 'text-ink')}>{qty(product.quantity)}</p>
          <p className="text-[10px] text-ink-muted uppercase">{unitShort(product.unit)}</p>
        </div>
        <button aria-label={`Adicionar ${product.name}`} onClick={() => onMove(product, 'in')} className="h-11 w-11 rounded-xl bg-sage-50 text-sage-700 grid place-items-center active:scale-95"><Plus size={20} /></button>
      </div>
    </div>
  )
}
