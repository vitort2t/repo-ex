import { BarChart3, ChevronLeft, ChevronRight, PiggyBank, Receipt } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { budgetForMonth, useBudgets, useCategories, usePurchaseItemsInRange, usePurchases } from '@/hooks/data'
import { fmtDate, fmtMonth, isoDate, money, percent } from '@/lib/format'
import { addMonths, monthEnd, monthStart } from '@/lib/stats'
import { storeColor, storeLabel } from '@/lib/stores'
import { Change, StoreDashboard } from '@/components/StoreDashboard'
import { EmptyState, ErrorBox, Loading, Page, PageHeader, ProgressBar, cx } from '@/components/ui'

export default function Expenses() {
  const { data: purchases, isLoading, error, refetch } = usePurchases()
  const { data: budgets } = useBudgets()
  const { data: categories = [] } = useCategories()
  const [month, setMonth] = useState(() => monthStart(new Date()))
  const from = isoDate(month), to = isoDate(monthEnd(month))
  const prevMonth = addMonths(month, -1)
  const { data: items = [] } = usePurchaseItemsInRange(from, to)
  const { data: prevItems = [] } = usePurchaseItemsInRange(isoDate(prevMonth), isoDate(monthEnd(prevMonth)))

  const confirmed = useMemo(() => (purchases ?? []).filter((p) => p.status === 'confirmed'), [purchases])
  const inMonth = confirmed.filter((p) => p.purchased_at >= from && p.purchased_at <= to)
  const inPrev = confirmed.filter((p) => p.purchased_at >= isoDate(prevMonth) && p.purchased_at <= isoDate(monthEnd(prevMonth)))
  const total = inMonth.reduce((s, p) => s + p.total_paid, 0)
  const prevTotal = inPrev.reduce((s, p) => s + p.total_paid, 0)
  const budget = budgetForMonth(budgets, from)
  const isCurrent = from === isoDate(monthStart(new Date()))

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) {
      const c = categories.find((x) => x.id === it.category_id)
      const k = c ? c.grp : 'Sem categoria'
      m.set(k, (m.get(k) ?? 0) + Number(it.line_total))
    }
    const sum = [...m.values()].reduce((a, b) => a + b, 0)
    return [...m.entries()].map(([k, v]) => ({ k, v, share: sum ? v / sum : 0 })).sort((a, b) => b.v - a.v)
  }, [items, categories])

  // Quanto foi poupado (descontos de linha + descontos globais) e análise simples face ao mês anterior
  const savedOf = (ps: typeof inMonth, its: typeof items) => ps.reduce((s, p) => s + Number(p.discount_total || 0), 0) + its.reduce((s, it) => s + Number(it.discount || 0), 0)
  const saved = savedOf(inMonth, items), prevSaved = savedOf(inPrev, prevItems)
  const groupTotals = (its: typeof items) => {
    const m = new Map<string, number>()
    for (const it of its) { const c = categories.find((x) => x.id === it.category_id); const k = c ? c.grp : 'Sem categoria'; m.set(k, (m.get(k) ?? 0) + Number(it.line_total)) }
    return m
  }
  const storeTotals = (ps: typeof inMonth) => { const m = new Map<string, number>(); for (const p of ps) m.set(storeLabel(p.store_chain), (m.get(storeLabel(p.store_chain)) ?? 0) + p.total_paid); return m }
  const diffs = (a: Map<string, number>, b: Map<string, number>) => [...new Set([...a.keys(), ...b.keys()])].map((k) => ({ k, diff: (a.get(k) ?? 0) - (b.get(k) ?? 0) }))
  const storeDiffs = diffs(storeTotals(inMonth), storeTotals(inPrev))
  const catDiffs = diffs(groupTotals(items), groupTotals(prevItems))
  const topStore = [...storeTotals(inMonth).entries()].sort((a, b) => b[1] - a[1])[0]
  const economized = [...storeDiffs.map((d) => ({ ...d, k: d.k })), ...catDiffs.map((d) => ({ ...d, k: d.k }))].filter((d) => d.diff < -0.009).sort((a, b) => a.diff - b.diff).slice(0, 3)
  const increased = [...storeDiffs, ...catDiffs].filter((d) => d.diff > 0.009).sort((a, b) => b.diff - a.diff).slice(0, 3)

  if (isLoading) return <><PageHeader title="Despesas" /><Loading /></>
  if (error && !purchases) return <><PageHeader title="Despesas" /><Page><ErrorBox error={error} retry={refetch} /></Page></>

  return (
    <>
      <PageHeader title="Despesas" subtitle="Supermercados"
        actions={<>
          <Link to="/despesas/relatorios" aria-label="Relatórios" className="h-10 w-10 grid place-items-center rounded-full hover:bg-champagne"><BarChart3 size={20} /></Link>
          <Link to="/despesas/orcamento" aria-label="Orçamento" className="h-10 w-10 grid place-items-center rounded-full hover:bg-champagne"><PiggyBank size={20} /></Link>
        </>} />
      <Page>
        {confirmed.length === 0 ? (
          <EmptyState icon={<Receipt />} title="Ainda não há compras registadas" text="Importe uma fatura ou registe uma compra para começar a acompanhar as despesas."
            action={<Link to="/faturas/nova" className="btn-primary">Adicionar fatura</Link>} />
        ) : (<>
          {/* Painel do mês */}
          <div className="card p-4 space-y-4">
            <div className="flex items-center gap-2">
              <button aria-label="Mês anterior" onClick={() => setMonth(addMonths(month, -1))} className="h-10 w-10 grid place-items-center rounded-full bg-champagne"><ChevronLeft size={20} /></button>
              <p className="flex-1 text-center font-semibold">{fmtMonth(month)}</p>
              <button aria-label="Mês seguinte" onClick={() => setMonth(addMonths(month, 1))} disabled={isCurrent} className="h-10 w-10 grid place-items-center rounded-full bg-champagne disabled:opacity-30"><ChevronRight size={20} /></button>
            </div>
            <div className="text-center">
              <p className="text-[34px] font-bold tabular-nums leading-tight">{money(total)}</p>
              <p className="text-sm text-ink-muted">
                {inMonth.length} {inMonth.length === 1 ? 'compra' : 'compras'} · média {money(inMonth.length ? total / inMonth.length : 0)}
              </p>
              <p className="text-sm mt-1">
                Mês anterior: <b className="tabular-nums">{money(prevTotal)}</b>{prevTotal > 0 && <> · <Change v={(total - prevTotal) / prevTotal} /></>}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-xl bg-ok-bg/60 py-2"><p className="font-bold tabular-nums text-ok-ink">{money(saved)}</p><p className="text-[11px] text-ink-muted">Poupado em descontos</p></div>
              <div className="rounded-xl bg-base py-2"><p className="font-bold tabular-nums">{money(prevSaved)}</p><p className="text-[11px] text-ink-muted">Descontos no mês anterior</p></div>
            </div>
            {budget !== null && (
              <Link to="/despesas/orcamento" className="block space-y-1.5">
                <ProgressBar value={budget > 0 ? total / budget : 0} />
                <div className="flex justify-between text-xs text-ink-muted">
                  <span>{percent(budget > 0 ? total / budget : 0)} de {money(budget)}</span>
                  <span className={cx(budget - total < 0 && 'text-alert-ink font-semibold')}>{budget - total >= 0 ? `Restam ${money(budget - total)}` : `Ultrapassado em ${money(total - budget)}`}</span>
                </div>
              </Link>
            )}
          </div>

          {inMonth.length > 0 && (
            <div className="card p-4 space-y-2 text-sm">
              <p className="font-semibold text-base">Análise do mês</p>
              <p><span className="text-ink-muted">Onde gastámos mais: </span><b>{topStore ? `${topStore[0]} (${money(topStore[1])})` : '—'}</b>{byCategory[0] ? <> · categoria <b>{byCategory[0].k}</b></> : null}</p>
              <p><span className="text-ink-muted">Onde conseguimos economizar: </span>{economized.length ? economized.map((d, i) => <span key={d.k}>{i ? ', ' : ''}<b>{d.k}</b> (−{money(Math.abs(d.diff))})</span>) : 'nada baixou face ao mês anterior.'}</p>
              <p><span className="text-ink-muted">Despesas que aumentaram: </span>{increased.length ? increased.map((d, i) => <span key={d.k}>{i ? ', ' : ''}<b>{d.k}</b> (+{money(d.diff)})</span>) : 'nenhuma.'}</p>
              <p className="text-ink-muted">Comparação: {money(total)} este mês vs {money(prevTotal)} no mês anterior{prevTotal > 0 ? <> (<Change v={(total - prevTotal) / prevTotal} />)</> : null}.</p>
            </div>
          )}

          {byCategory.length > 0 && (
            <div className="card p-4 space-y-2.5">
              <p className="font-semibold">Por categoria</p>
              {byCategory.map((c) => (
                <div key={c.k}>
                  <div className="flex text-sm mb-1"><span className="flex-1">{c.k}</span><span className="font-semibold tabular-nums">{money(c.v)}</span><span className="w-14 text-right text-ink-muted tabular-nums">{percent(c.share)}</span></div>
                  <div className="h-2 rounded-r-[4px]"><div className="h-full bg-navy-500 rounded-r-[4px]" style={{ width: `${Math.max(2, c.share * 100)}%` }} /></div>
                </div>
              ))}
              <p className="text-xs text-ink-muted">Calculado a partir dos artigos das faturas (antes de descontos globais).</p>
            </div>
          )}

          <section className="space-y-2">
            <h2 className="section-title px-1">Compras de {fmtMonth(month).toLowerCase()}</h2>
            {inMonth.length === 0 ? <div className="card p-4 text-sm text-ink-muted">Sem compras neste mês.</div> : (
              <div className="card divide-y divide-line/70">
                {inMonth.map((p) => (
                  <Link key={p.id} to={`/despesas/compra/${p.id}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: storeColor(p.store_chain) }} />
                    <div className="flex-1 min-w-0"><p className="font-medium truncate">{p.store_name}</p><p className="text-xs text-ink-muted">{fmtDate(p.purchased_at)}{p.receipt_id ? ' · com fatura' : ''}</p></div>
                    <span className="font-semibold tabular-nums">{money(p.total_paid)}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <StoreDashboard purchases={purchases ?? []} />
        </>)}
      </Page>
    </>
  )
}
