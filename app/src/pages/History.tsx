import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMovements, useProducts, useWho } from '@/hooks/data'
import { qty, relativeDay } from '@/lib/format'
import { REASON_LABEL } from '@/components/MovementSheet'
import { Chips, Loading, Page, PageHeader, cx } from '@/components/ui'

export default function History() {
  const [limit, setLimit] = useState(150)
  const [dir, setDir] = useState<'all' | 'in' | 'out'>('all')
  const { data: movements = [], isLoading } = useMovements(undefined, limit)
  const { data: products = [] } = useProducts()
  const who = useWho()
  const byId = new Map(products.map((p) => [p.id, p]))
  const list = movements.filter((m) => dir === 'all' || m.direction === dir)
  return (
    <>
      <PageHeader title="Histórico de movimentos" back />
      <Page>
        <Chips value={dir} onChange={setDir} options={[{ value: 'all', label: 'Todos' }, { value: 'in', label: 'Entradas' }, { value: 'out', label: 'Saídas' }]} />
        {isLoading ? <Loading /> : (
          <div className="card divide-y divide-line/70">
            {list.map((m) => (
              <Link key={m.id} to={`/stock/${m.product_id}`} className="flex items-center gap-3 px-4 py-3">
                <span className={cx('h-9 w-9 shrink-0 rounded-xl grid place-items-center font-bold', m.direction === 'in' ? 'bg-navy-50 text-navy-700' : 'bg-champagne text-ink-soft')}>{m.direction === 'in' ? '+' : '−'}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{byId.get(m.product_id)?.name ?? 'Produto'}</p>
                  <p className="text-xs text-ink-muted truncate">{REASON_LABEL[m.reason]} · {who(m.user_id)} · {relativeDay(m.occurred_at)}</p>
                </div>
                <span className="font-semibold tabular-nums">{m.direction === 'in' ? '+' : '−'}{qty(m.quantity)}</span>
              </Link>
            ))}
            {list.length === 0 && <p className="px-4 py-6 text-center text-sm text-ink-muted">Sem movimentos.</p>}
          </div>
        )}
        {movements.length >= limit && <button className="btn-secondary w-full" onClick={() => setLimit((l) => l + 200)}>Ver mais</button>}
      </Page>
    </>
  )
}
