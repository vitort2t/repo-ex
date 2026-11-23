import { CalendarClock } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLots, useProducts } from '@/hooks/data'
import { daysUntil, fmtDate, qty, unitShort } from '@/lib/format'
import type { Product } from '@/lib/types'
import { MovementSheet } from '@/components/MovementSheet'
import { Badge, Chips, EmptyState, Page, PageHeader } from '@/components/ui'

type W = '7' | '15' | '30' | 'expired' | 'all'

export default function Expiry() {
  const { data: lots = [] } = useLots()
  const { data: products = [] } = useProducts()
  const [win, setWin] = useState<W>('7')
  const [move, setMove] = useState<Product | null>(null)
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const rows = useMemo(() => lots
    .map((l) => ({ lot: l, product: byId.get(l.product_id), days: daysUntil(l.expires_on) }))
    .filter((r) => r.product && !r.product.archived)
    .sort((a, b) => a.days - b.days), [lots, byId])

  const count = (w: W) => rows.filter((r) => match(r.days, w)).length
  const list = rows.filter((r) => match(r.days, win))

  return (
    <>
      <PageHeader title="Consumir primeiro" subtitle="Validades por ordem de expiração" back="/stock" />
      <Page>
        <Chips value={win} onChange={setWin} options={[
          { value: '7', label: 'Próx. 7 dias', count: count('7') },
          { value: '15', label: '15 dias', count: count('15') },
          { value: '30', label: '30 dias', count: count('30') },
          { value: 'expired', label: 'Expirados', count: count('expired') },
          { value: 'all', label: 'Todos', count: rows.length },
        ]} />
        {list.length === 0 ? (
          <EmptyState icon={<CalendarClock />} title="Nada a expirar neste período"
            text="As validades registam-se ao adicionar stock (campo “Validade”) ou ao criar um produto." />
        ) : (
          <div className="card divide-y divide-line/70">
            {list.map(({ lot, product, days }) => (
              <div key={lot.id} className="flex items-center gap-3 px-4 py-3">
                <Link to={`/stock/${product!.id}`} className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{product!.name}</p>
                  <p className="text-xs text-ink-muted">{qty(lot.quantity)} {unitShort(product!.unit)} · validade {fmtDate(lot.expires_on)}</p>
                </Link>
                <Badge tone={days < 0 ? 'alert' : days <= 7 ? 'warn' : 'ok'}>{days < 0 ? `Expirou há ${-days} d` : days === 0 ? 'Expira hoje' : `${days} dias`}</Badge>
                <button className="btn-secondary h-10 px-3 text-sm" onClick={() => setMove(product!)}>Retirar</button>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-ink-muted px-1">Ao retirar unidades, a aplicação desconta primeiro as que expiram mais cedo. Para registar desperdício, escolha o motivo “Desperdício” ou “Validade”.</p>
      </Page>
      <MovementSheet product={move} direction="out" onClose={() => setMove(null)} />
    </>
  )
}

function match(days: number, w: W) {
  if (w === 'expired') return days < 0
  if (w === 'all') return true
  return days >= 0 && days <= Number(w)
}
