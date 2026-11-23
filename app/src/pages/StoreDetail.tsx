import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { usePurchases } from '@/hooks/data'
import { fmtDate, fmtMonth, money } from '@/lib/format'
import { storeColor, storeLabel } from '@/lib/stores'
import type { StoreChain } from '@/lib/types'
import { Badge, EmptyState, Loading, Page, PageHeader } from '@/components/ui'

/** Todas as faturas registadas num supermercado. */
export default function StoreDetail() {
  const { chain = 'outros' } = useParams()
  const key = chain as StoreChain
  const { data: purchases, isLoading } = usePurchases()
  const list = useMemo(() => (purchases ?? []).filter((p) => p.store_chain === key), [purchases, key])
  const confirmed = list.filter((p) => p.status === 'confirmed')
  const total = confirmed.reduce((s, p) => s + p.total_paid, 0)
  const byMonth = useMemo(() => {
    const m = new Map<string, typeof list>()
    for (const p of list) { const k = p.purchased_at.slice(0, 7); m.set(k, [...(m.get(k) ?? []), p]) }
    return [...m.entries()]
  }, [list])

  if (isLoading) return <Loading />
  return (
    <>
      <PageHeader title={storeLabel(key)} subtitle="Histórico de compras" back />
      <Page>
        <div className="card p-4 grid grid-cols-3 gap-2 text-center">
          <div><p className="text-lg font-bold tabular-nums">{money(total)}</p><p className="text-xs text-ink-muted">Total</p></div>
          <div><p className="text-lg font-bold">{confirmed.length}</p><p className="text-xs text-ink-muted">Compras</p></div>
          <div><p className="text-lg font-bold tabular-nums">{money(confirmed.length ? total / confirmed.length : 0)}</p><p className="text-xs text-ink-muted">Média</p></div>
        </div>
        {list.length === 0 ? <EmptyState title="Sem compras registadas" /> : byMonth.map(([m, ps]) => (
          <section key={m} className="space-y-2">
            <div className="flex px-1 text-sm"><h2 className="section-title flex-1">{fmtMonth(`${m}-01`)}</h2>
              <span className="font-semibold tabular-nums">{money(ps.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.total_paid, 0))}</span></div>
            <div className="card divide-y divide-line/70">
              {ps.map((p) => (
                <Link key={p.id} to={`/despesas/compra/${p.id}`} className="flex items-center gap-3 px-4 py-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: storeColor(key) }} />
                  <div className="flex-1 min-w-0"><p className="font-medium truncate">{p.store_name}</p><p className="text-xs text-ink-muted">{fmtDate(p.purchased_at)}</p></div>
                  {p.status === 'voided' ? <Badge>Anulada</Badge> : <span className="font-semibold tabular-nums">{money(p.total_paid)}</span>}
                </Link>
              ))}
            </div>
          </section>
        ))}
        <p className="text-xs text-ink-muted px-1">Compras anuladas aparecem no histórico mas não contam nos totais.</p>
      </Page>
    </>
  )
}
