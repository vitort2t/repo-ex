import { AlertTriangle, Bell, Boxes, CalendarClock, ChevronRight, Receipt, Search, ShoppingCart, Wallet } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useHousehold } from '@/hooks/auth'
import { budgetForMonth, useBudgets, useLots, useNotifications, useProducts, usePurchases, useShopping } from '@/hooks/data'
import { daysUntil, fmtDate, greeting, isoDate, money, percent, qty, unitShort } from '@/lib/format'
import { stockState } from '@/lib/shopping'
import { Badge, Page, ProgressBar, cx } from '@/components/ui'

function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: 'warn' | 'alert' | 'ok' }) {
  return (
    <div className="rounded-xl bg-base px-3 py-2.5">
      <p className={cx('text-xl font-bold tabular-nums', tone === 'warn' && 'text-warn-ink', tone === 'alert' && 'text-alert-ink', tone === 'ok' && 'text-sage-700')}>{value}</p>
      <p className="text-[11px] text-ink-muted font-medium leading-tight">{label}</p>
    </div>
  )
}

function CardLink({ to, icon, title, children }: { to: string; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Link to={to} className="card p-4 block active:scale-[.995] transition">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-8 w-8 rounded-lg bg-sage-50 text-sage-700 grid place-items-center">{icon}</span>
        <p className="font-semibold flex-1">{title}</p>
        <ChevronRight size={18} className="text-ink-muted" />
      </div>
      {children}
    </Link>
  )
}

export default function Home() {
  const { household, profile } = useHousehold()
  const { data: products = [] } = useProducts()
  const { data: shopping = [] } = useShopping()
  const { data: purchases = [] } = usePurchases()
  const { data: lots = [] } = useLots()
  const { data: budgets } = useBudgets()
  const { data: notifications = [] } = useNotifications()

  const active = products.filter((p) => !p.archived)
  const out = active.filter((p) => stockState(p) === 'out' && p.auto_restock)
  const low = active.filter((p) => stockState(p) === 'low' && p.auto_restock)
  const available = active.filter((p) => Number(p.quantity) > 0)
  const toBuy = shopping.filter((i) => i.status === 'open')
  const confirmed = purchases.filter((p) => p.status === 'confirmed')
  const last = confirmed[0]
  const month = isoDate().slice(0, 7)
  const monthPurchases = confirmed.filter((p) => p.purchased_at.startsWith(month))
  const monthTotal = monthPurchases.reduce((s, p) => s + p.total_paid, 0)
  const budget = budgetForMonth(budgets, isoDate())
  const unread = notifications.filter((n) => !n.read).length

  const expiring = useMemo(() => {
    const byName = new Map(products.map((p) => [p.id, p]))
    return lots.filter((l) => daysUntil(l.expires_on) <= household.expiry_alert_days && byName.get(l.product_id) && !byName.get(l.product_id)!.archived)
      .map((l) => ({ lot: l, product: byName.get(l.product_id)!, days: daysUntil(l.expires_on) }))
  }, [lots, products, household.expiry_alert_days])

  const today = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())

  return (
    <>
      <header className="pt-safe px-4">
        <div className="flex items-start gap-3 pt-5 pb-4">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink-muted">{today.charAt(0).toUpperCase() + today.slice(1)}</p>
            <h1 className="text-[26px] font-bold tracking-tight leading-tight">{greeting()}{profile?.display_name ? `, ${profile.display_name}` : ''}</h1>
            <p className="text-sm text-ink-soft mt-0.5">{household.name}</p>
          </div>
          <Link to="/notificacoes" aria-label="Notificações" className="relative h-11 w-11 rounded-full bg-white border border-line grid place-items-center shadow-card">
            <Bell size={20} />
            {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-alert text-white text-[10px] font-bold grid place-items-center">{unread}</span>}
          </Link>
        </div>
      </header>
      <Page>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/faturas/nova" className="btn-primary h-14 rounded-2xl whitespace-nowrap text-[15px] px-3"><Receipt size={20} />Adicionar fatura</Link>
          <Link to="/stock?pesquisa=1" className="btn-secondary h-14 rounded-2xl whitespace-nowrap text-[15px] px-3"><Search size={20} />Procurar</Link>
        </div>

        <CardLink to="/stock" icon={<Boxes size={18} />} title="Stock">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="Produtos" value={active.length} />
            <Stat label="Disponíveis" value={available.length} tone="ok" />
            <Stat label="Stock baixo" value={low.length} tone={low.length ? 'warn' : undefined} />
            <Stat label="Esgotados" value={out.length} tone={out.length ? 'alert' : undefined} />
          </div>
        </CardLink>

        <CardLink to="/compras" icon={<ShoppingCart size={18} />} title="Compras">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="Na lista de compras" value={toBuy.length} />
            <Stat label={last ? `Última compra · ${fmtDate(last.purchased_at)}` : 'Última compra'} value={last ? money(last.total_paid) : '—'} />
          </div>
          {last && <p className="text-xs text-ink-muted mt-2">{last.store_name}</p>}
        </CardLink>

        <CardLink to="/despesas" icon={<Wallet size={18} />} title="Despesas deste mês">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-2xl font-bold tabular-nums">{money(monthTotal)}</p>
              <p className="text-xs text-ink-muted">{monthPurchases.length} {monthPurchases.length === 1 ? 'compra' : 'compras'}</p>
            </div>
            {budget !== null && (
              <div className="text-right">
                <p className={cx('font-semibold tabular-nums', budget - monthTotal < 0 ? 'text-alert-ink' : 'text-sage-700')}>{money(budget - monthTotal)}</p>
                <p className="text-xs text-ink-muted">{budget - monthTotal < 0 ? 'acima do orçamento' : `disponível de ${money(budget)}`}</p>
              </div>
            )}
          </div>
          {budget !== null ? <>
            <ProgressBar value={budget > 0 ? monthTotal / budget : 0} />
            <p className="text-xs text-ink-muted mt-1.5">{percent(budget > 0 ? monthTotal / budget : 0)} do orçamento utilizado</p>
          </> : <p className="text-xs text-ink-muted">Sem orçamento definido · <span className="text-sage-700 font-semibold">definir</span></p>}
        </CardLink>

        <section className="space-y-2">
          <h2 className="section-title px-1 pt-2">Alertas</h2>
          {out.length + low.length + expiring.length === 0 ? (
            <div className="card p-4 text-sm text-ink-muted">Está tudo em ordem. Não há produtos em falta nem a expirar.</div>
          ) : (
            <div className="card divide-y divide-line/70">
              {out.slice(0, 6).map((p) => (
                <Link key={p.id} to={`/stock/${p.id}`} className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle size={18} className="text-alert" />
                  <span className="flex-1 truncate">{p.name}</span><Badge tone="alert">Esgotado</Badge>
                </Link>
              ))}
              {low.slice(0, 6).map((p) => (
                <Link key={p.id} to={`/stock/${p.id}`} className="flex items-center gap-3 px-4 py-3">
                  <AlertTriangle size={18} className="text-warn" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-sm text-warn-ink font-semibold">{qty(p.quantity)} {unitShort(p.unit)}</span>
                </Link>
              ))}
              {expiring.slice(0, 6).map(({ lot, product, days }) => (
                <Link key={lot.id} to="/stock/validades" className="flex items-center gap-3 px-4 py-3">
                  <CalendarClock size={18} className={days < 0 ? 'text-alert' : 'text-warn'} />
                  <span className="flex-1 truncate">{product.name}</span>
                  <Badge tone={days < 0 ? 'alert' : 'warn'}>{days < 0 ? 'Expirado' : days === 0 ? 'Hoje' : `${days} dias`}</Badge>
                </Link>
              ))}
              {(out.length > 6 || low.length > 6) && <Link to="/compras" className="block px-4 py-3 text-sm font-semibold text-sage-700">Ver lista de compras</Link>}
            </div>
          )}
        </section>
      </Page>
    </>
  )
}
