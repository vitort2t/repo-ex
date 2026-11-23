import { CheckCircle2, Receipt, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useProducts, useShopping, useToggleShoppingItem } from '@/hooks/data'
import { fmtDate, money, qty, unitShort } from '@/lib/format'
import { priorityOf } from '@/lib/shopping'
import type { Product, ShoppingItem } from '@/lib/types'
import { ShoppingItemRow, itemName } from '@/components/ShoppingItemRow'
import { ProgressBar, Sheet } from '@/components/ui'

/** Interface simplificada para usar com uma mão enquanto se faz compras. */
export default function SupermarketMode() {
  const nav = useNavigate()
  const { data: items = [] } = useShopping()
  const { data: products = [] } = useProducts()
  const toggle = useToggleShoppingItem()
  const [info, setInfo] = useState<{ item: ShoppingItem; product?: Product } | null>(null)
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const open = items.filter((i) => i.status === 'open' && !(i.product_id && byId.get(i.product_id)?.archived))
  const todo = open.filter((i) => !i.checked).sort((a, b) =>
    (priorityOf(a, byId.get(a.product_id ?? '')) === 'high' ? 0 : 1) - (priorityOf(b, byId.get(b.product_id ?? '')) === 'high' ? 0 : 1)
    || itemName(a, byId.get(a.product_id ?? '')).localeCompare(itemName(b, byId.get(b.product_id ?? ''))))
  const done = open.filter((i) => i.checked)

  return (
    <div className="min-h-screen bg-base">
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-line pt-safe">
        <div className="flex items-center gap-3 px-4 h-16">
          <button onClick={() => nav('/compras')} aria-label="Sair do modo supermercado" className="h-11 w-11 rounded-full bg-champagne grid place-items-center"><X size={22} /></button>
          <div className="flex-1">
            <p className="font-bold text-lg leading-tight">Modo supermercado</p>
            <p className="text-sm text-ink-muted">{done.length} encontrados · faltam {todo.length}</p>
          </div>
        </div>
        <div className="px-4 pb-3"><ProgressBar value={open.length ? done.length / open.length : 0} tone="ok" /></div>
      </header>

      <main className="px-3 py-4 space-y-4 pb-safe">
        {todo.length === 0 && open.length > 0 && (
          <div className="card p-6 text-center space-y-3">
            <CheckCircle2 size={44} className="mx-auto text-navy-600" />
            <p className="font-bold text-lg">Tudo encontrado!</p>
            <p className="text-sm text-ink-muted">Quando chegar a casa, fotografe a fatura para atualizar o stock e as despesas.</p>
            <Link to="/faturas/nova" className="btn-primary w-full"><Receipt size={20} />Adicionar fatura</Link>
          </div>
        )}
        {open.length === 0 && <div className="card p-6 text-center text-ink-muted">A lista de compras está vazia.</div>}
        {todo.length > 0 && (
          <div className="card divide-y divide-line/70 overflow-hidden">
            {todo.map((i) => <ShoppingItemRow big key={i.id} item={i} product={byId.get(i.product_id ?? '')}
              onToggle={() => toggle.mutate({ item: i, checked: true })} onOpen={() => setInfo({ item: i, product: byId.get(i.product_id ?? '') })} />)}
          </div>
        )}
        {done.length > 0 && (
          <section className="space-y-2">
            <p className="section-title px-2">No carrinho</p>
            <div className="card divide-y divide-line/70 overflow-hidden">
              {done.map((i) => <ShoppingItemRow big key={i.id} item={i} product={byId.get(i.product_id ?? '')} onToggle={() => toggle.mutate({ item: i, checked: false })} />)}
            </div>
          </section>
        )}
        <p className="text-xs text-ink-muted px-2">Toque no nome de um artigo para ver o stock em casa.</p>
      </main>

      <Sheet open={!!info} onClose={() => setInfo(null)} title={info ? itemName(info.item, info.product) : ''}
        footer={info && <div className="py-2"><button className="btn-primary w-full" onClick={() => { toggle.mutate({ item: info.item, checked: true }); setInfo(null) }}>Marcar como encontrado</button></div>}>
        {info?.product ? (
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['Em casa', info.product.quantity], ['Mínimo', info.product.min_quantity], ['Ideal', info.product.ideal_quantity]].map(([l, v]) => (
                <div key={l as string} className="rounded-xl bg-base py-3"><p className="text-xl font-bold">{qty(v as number)}</p><p className="text-xs text-ink-muted">{l}</p></div>
              ))}
            </div>
            <p className="text-sm text-ink-soft">Unidade: {unitShort(info.product.unit)}</p>
            {info.product.last_price !== null && <p className="text-sm text-ink-soft">Último preço pago: <b>{money(info.product.last_price)}</b>{info.product.last_in_at && ` (${fmtDate(info.product.last_in_at)})`}</p>}
            {info.item.note && <p className="text-sm">Nota: {info.item.note}</p>}
          </div>
        ) : <p className="text-sm text-ink-muted">Artigo adicionado manualmente (sem ficha de stock).</p>}
      </Sheet>
    </div>
  )
}
