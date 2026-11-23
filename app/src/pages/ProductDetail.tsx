import { Archive, ArchiveRestore, Minus, Pencil, Plus, ShoppingCart } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/hooks/auth'
import { keys, useCategories, useLocations, useLots, useMovements, usePrices, useProducts, useShopping, useWho } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { daysUntil, fmtDate, fmtDateShort, money, qty, relativeDay, unitShort } from '@/lib/format'
import { storeLabel } from '@/lib/stores'
import { suggestedQuantity } from '@/lib/shopping'
import { MovementSheet, REASON_LABEL } from '@/components/MovementSheet'
import { ProductThumb, StockBadge } from '@/components/ProductRow'
import { Badge, EmptyState, Loading, Page, PageHeader, cx, useConfirm, useToast } from '@/components/ui'

export default function ProductDetail() {
  const { id } = useParams()
  const { hid, user } = useHousehold()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const who = useWho()
  const { data: products, isLoading } = useProducts()
  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()
  const { data: lots = [] } = useLots()
  const { data: shopping = [] } = useShopping()
  const { data: movements = [] } = useMovements(id, 60)
  const { data: prices = [] } = usePrices(id)
  const [move, setMove] = useState<'in' | 'out' | null>(null)
  const product = products?.find((p) => p.id === id)

  const priceStats = useMemo(() => {
    if (!prices.length) return null
    const vals = prices.map((p) => Number(p.unit_price))
    const totalQty = prices.reduce((s, p) => s + Number(p.quantity), 0)
    const avg = prices.reduce((s, p) => s + Number(p.unit_price) * Number(p.quantity), 0) / (totalQty || 1)
    return { last: vals[vals.length - 1], avg, min: Math.min(...vals), max: Math.max(...vals) }
  }, [prices])

  // Comparação entre supermercados — só com preço normalizado (por kg/l/unidade de embalagem).
  const byStore = useMemo(() => {
    const norm = prices.filter((p) => p.normalized_price !== null)
    if (norm.length < 2) return null
    const m = new Map<string, { label: string; sum: number; n: number; min: number }>()
    for (const p of norm) {
      const k = p.store_chain === 'outros' ? p.store_name : storeLabel(p.store_chain)
      const e = m.get(k) ?? { label: k, sum: 0, n: 0, min: Infinity }
      e.sum += Number(p.normalized_price); e.n++; e.min = Math.min(e.min, Number(p.normalized_price))
      m.set(k, e)
    }
    if (m.size < 2) return null
    return [...m.values()].map((e) => ({ ...e, avg: e.sum / e.n })).sort((a, b) => a.avg - b.avg)
  }, [prices])

  if (isLoading) return <Loading />
  if (!product) return <><PageHeader title="Produto" back="/stock" /><Page><EmptyState title="Produto não encontrado" text="Pode ter sido arquivado por outro membro da casa." /></Page></>

  const category = categories.find((c) => c.id === product.category_id)
  const location = locations.find((l) => l.id === product.location_id)
  const productLots = lots.filter((l) => l.product_id === product.id)
  const inList = shopping.some((i) => i.product_id === product.id && i.status === 'open')
  const packUnit = product.package_unit === 'kg' ? 'kg' : product.package_unit === 'l' ? 'L' : 'un.'

  const addToList = async () => {
    const dismissed = shopping.find((i) => i.product_id === product.id && i.status === 'dismissed')
    if (dismissed) {
      const { error } = await supabase.from('shopping_list_items').update({ status: 'open', checked: false }).eq('id', dismissed.id)
      if (error) return toast(friendlyError(error), 'alert')
      qc.invalidateQueries({ queryKey: keys.shopping(hid) })
      return toast('Adicionado à lista de compras.')
    }
    const { data: list } = await supabase.from('shopping_lists').select('id').eq('household_id', hid).eq('is_default', true).single()
    const { error } = await supabase.from('shopping_list_items').insert({
      list_id: list!.id, household_id: hid, product_id: product.id, source: 'manual', quantity: suggestedQuantity(product), created_by: user.id,
    })
    if (error && !String(error.message).includes('duplicate')) return toast(friendlyError(error), 'alert')
    qc.invalidateQueries({ queryKey: keys.shopping(hid) })
    toast('Adicionado à lista de compras.')
  }

  const toggleArchive = async () => {
    if (!product.archived && !(await confirm({ title: 'Arquivar produto?', text: 'Deixa de aparecer no stock e na lista de compras. O histórico de movimentos e preços mantém-se e pode reativá-lo mais tarde.', confirm: 'Arquivar' }))) return
    const { error } = await supabase.from('products').update({ archived: !product.archived }).eq('id', product.id)
    if (error) return toast(friendlyError(error), 'alert')
    qc.invalidateQueries({ queryKey: keys.products(hid) })
    toast(product.archived ? 'Produto reativado.' : 'Produto arquivado.')
  }

  return (
    <>
      <PageHeader title={product.name} subtitle={[product.brand, category?.name].filter(Boolean).join(' · ')} back
        actions={<Link to={`/stock/${product.id}/editar`} aria-label="Editar" className="h-10 w-10 grid place-items-center rounded-full hover:bg-sand"><Pencil size={19} /></Link>} />
      <Page>
        <div className="card p-5">
          <div className="flex items-center gap-4">
            <ProductThumb product={product} size={64} />
            <div className="flex-1">
              <p className="text-[40px] leading-none font-bold tabular-nums">{qty(product.quantity)}<span className="text-base font-semibold text-ink-muted ml-1.5">{unitShort(product.unit)}</span></p>
              <div className="flex gap-1.5 mt-2"><StockBadge product={product} />{product.archived && <Badge>Arquivado</Badge>}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-5">
            <button className="btn h-14 bg-ink text-white rounded-2xl text-base" onClick={() => setMove('out')}><Minus size={20} />Retirar</button>
            <button className="btn-primary h-14 rounded-2xl text-base" onClick={() => setMove('in')}><Plus size={20} />Adicionar</button>
          </div>
          <p className="text-xs text-ink-muted mt-3 text-center">Mínimo {qty(product.min_quantity)} · Ideal {qty(product.ideal_quantity)} {unitShort(product.unit)}</p>
        </div>

        {!inList && !product.archived && (
          <button onClick={addToList} className="card w-full p-4 flex items-center gap-3 text-left">
            <ShoppingCart size={19} className="text-sage-700" /><span className="flex-1 font-medium">Adicionar à lista de compras</span>
            <span className="text-sm text-ink-muted">{qty(suggestedQuantity(product))} {unitShort(product.unit)}</span>
          </button>
        )}

        <div className="card p-4 grid grid-cols-2 gap-4">
          <Info label="Categoria" value={category ? `${category.name}` : 'Sem categoria'} />
          <Info label="Localização" value={location?.name ?? '—'} />
          <Info label="Marca" value={product.brand || '—'} />
          <Info label="Embalagem" value={product.package_size ? `${qty(product.package_size)} ${packUnit}` : '—'} />
          <Info label="Última entrada" value={product.last_in_at ? fmtDate(product.last_in_at) : '—'} />
          <Info label="Última saída" value={product.last_out_at ? fmtDate(product.last_out_at) : '—'} />
          <Info label="Último preço" value={money(product.last_price)} />
          <Info label="Preço médio" value={money(product.avg_price)} />
          {product.notes && <div className="col-span-2"><Info label="Observações" value={product.notes} /></div>}
        </div>

        {productLots.length > 0 && (
          <section className="space-y-2">
            <h2 className="section-title px-1">Validades (consumir primeiro)</h2>
            <div className="card divide-y divide-line/70">
              {productLots.map((l) => { const d = daysUntil(l.expires_on); return (
                <div key={l.id} className="flex items-center px-4 py-3 gap-3">
                  <span className="flex-1">{qty(l.quantity)} {unitShort(product.unit)}</span>
                  <span className="text-sm text-ink-soft">{fmtDate(l.expires_on)}</span>
                  <Badge tone={d < 0 ? 'alert' : d <= 7 ? 'warn' : 'ok'}>{d < 0 ? 'Expirado' : d === 0 ? 'Hoje' : `${d} d`}</Badge>
                </div>) })}
            </div>
          </section>
        )}

        <section className="space-y-2">
          <h2 className="section-title px-1">Histórico de preços</h2>
          {!priceStats ? <div className="card p-4 text-sm text-ink-muted">Ainda não há compras registadas deste produto.</div> : (
            <div className="card p-4 space-y-4">
              <div className="grid grid-cols-4 gap-2 text-center">
                {[['Último', priceStats.last], ['Médio', priceStats.avg], ['Menor', priceStats.min], ['Maior', priceStats.max]].map(([l, v]) => (
                  <div key={l as string} className="rounded-xl bg-base py-2"><p className="font-bold text-sm tabular-nums">{money(v as number)}</p><p className="text-[11px] text-ink-muted">{l}</p></div>
                ))}
              </div>
              {prices.length > 1 && (
                <div className="h-44 -ml-3">
                  <ResponsiveContainer>
                    <LineChart data={prices.map((p) => ({ d: fmtDateShort(p.purchased_at), v: Number(p.unit_price), s: p.store_name }))}>
                      <CartesianGrid stroke="#ECEAE3" vertical={false} />
                      <XAxis dataKey="d" tick={{ fontSize: 11, fill: '#8A8C83' }} tickLine={false} axisLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: '#8A8C83' }} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => `${Number(v).toFixed(2)}€`} domain={['auto', 'auto']} />
                      <Tooltip formatter={(v) => [money(Number(v)), 'Preço unitário']} labelFormatter={(l, p) => `${l} · ${p?.[0]?.payload?.s ?? ''}`} />
                      <Line type="linear" dataKey="v" stroke="#62805A" strokeWidth={2} dot={{ r: 4, fill: '#62805A', stroke: '#fff', strokeWidth: 2 }} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
              {byStore ? (
                <div>
                  <p className="text-sm font-semibold mb-2">Comparação entre supermercados <span className="font-normal text-ink-muted">(preço por {packUnit})</span></p>
                  <div className="space-y-1.5">
                    {byStore.map((s, i) => (
                      <div key={s.label} className="flex items-center gap-2 text-sm">
                        <span className={cx('flex-1', i === 0 && 'font-semibold text-sage-700')}>{s.label}{i === 0 && ' · mais barato'}</span>
                        <span className="tabular-nums">{money(s.avg)}</span>
                        <span className="text-xs text-ink-muted w-16 text-right">{s.n} {s.n === 1 ? 'compra' : 'compras'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-muted">
                  {product.package_size ? 'A comparação entre supermercados aparece quando houver compras em pelo menos duas lojas.'
                    : 'Para comparar preços entre supermercados, indique o tamanho da embalagem (kg, litros ou unidades) na edição do produto.'}
                </p>
              )}
            </div>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="section-title px-1">Movimentos</h2>
          {movements.length === 0 ? <div className="card p-4 text-sm text-ink-muted">Sem movimentos.</div> : (
            <div className="card divide-y divide-line/70">
              {movements.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={cx('h-9 w-9 rounded-xl grid place-items-center font-bold', m.direction === 'in' ? 'bg-sage-50 text-sage-700' : 'bg-sand text-ink-soft')}>{m.direction === 'in' ? '+' : '−'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium">{m.direction === 'in' ? '+' : '−'}{qty(m.quantity)} · {REASON_LABEL[m.reason] ?? m.reason}</p>
                    <p className="text-xs text-ink-muted truncate">{relativeDay(m.occurred_at)} · {who(m.user_id)}{m.note ? ` · ${m.note}` : ''}</p>
                  </div>
                  <span className="text-sm text-ink-muted tabular-nums">= {qty(m.balance_after)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <button onClick={toggleArchive} className="btn-ghost w-full">{product.archived ? <><ArchiveRestore size={18} />Reativar produto</> : <><Archive size={18} />Arquivar produto</>}</button>
      </Page>
      <MovementSheet product={move ? product : null} direction={move ?? 'out'} onClose={() => setMove(null)} />
    </>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-[11px] uppercase tracking-wide text-ink-muted font-semibold">{label}</p><p className="font-medium mt-0.5">{value ?? '—'}</p></div>
}
