import { Download } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { budgetForMonth, useBudgets, useCategories, usePurchaseItemsInRange, usePurchases } from '@/hooks/data'
import { fmtMonth, fmtMonthShort, isoDate, money, parseIsoDate, percent, qty } from '@/lib/format'
import { exportCsv, exportXlsx } from '@/lib/export'
import { indicators, monthEnd, monthTotals, totalsByStore, addMonths } from '@/lib/stats'
import { Change } from '@/components/StoreDashboard'
import { Page, PageHeader, Segmented } from '@/components/ui'

export default function Reports() {
  const [tab, setTab] = useState<'month' | 'year'>('month')
  return (
    <>
      <PageHeader title="Relatórios" back />
      <Page>
        <Segmented value={tab} onChange={setTab} options={[{ value: 'month', label: 'Mensal' }, { value: 'year', label: 'Anual' }]} />
        {tab === 'month' ? <MonthReport /> : <YearReport />}
      </Page>
    </>
  )
}

function Line({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-baseline justify-between py-2.5 text-sm"><span className="text-ink-soft">{label}</span><span className="font-semibold text-right">{value}</span></div>
}

function MonthReport() {
  const { data: purchases = [] } = usePurchases()
  const { data: categories = [] } = useCategories()
  const { data: budgets } = useBudgets()
  const months = useMemo(() => Array.from({ length: 24 }, (_, i) => isoDate(addMonths(new Date(), -i))), [])
  const [month, setMonth] = useState(months[0])
  const from = month, to = isoDate(monthEnd(parseIsoDate(month)))
  const { data: items = [] } = usePurchaseItemsInRange(from, to)
  const prevFrom = isoDate(addMonths(parseIsoDate(month), -1))
  const cur = purchases.filter((p) => p.status === 'confirmed' && p.purchased_at >= from && p.purchased_at <= to)
  const prev = purchases.filter((p) => p.status === 'confirmed' && p.purchased_at >= prevFrom && p.purchased_at < from)
  const ind = indicators(cur, prev)
  const budget = budgetForMonth(budgets, month)

  const catTotals = useMemo(() => {
    const m = new Map<string, number>()
    for (const it of items) { const c = categories.find((x) => x.id === it.category_id); const k = c?.name ?? 'Sem categoria'; m.set(k, (m.get(k) ?? 0) + Number(it.line_total)) }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [items, categories])
  const topProducts = useMemo(() => {
    const m = new Map<string, { name: string; q: number; v: number }>()
    for (const it of items) { const k = it.product_id ?? it.name; const e = m.get(k) ?? { name: it.name, q: 0, v: 0 }; e.q += Number(it.quantity); e.v += Number(it.line_total); m.set(k, e) }
    return [...m.values()].sort((a, b) => b.q - a.q).slice(0, 8)
  }, [items])
  const totalUnits = items.reduce((s, it) => s + Number(it.quantity), 0)

  const doExport = (kind: 'csv' | 'xlsx') => {
    const resumo = [{ Mês: fmtMonth(month), 'Total gasto (€)': ind.total, Compras: ind.count, 'Média por compra (€)': ind.average,
      'Supermercado principal': ind.top?.label ?? '', 'Categoria com maior despesa': catTotals[0]?.[0] ?? '', 'Orçamento (€)': budget ?? '' }]
    const compras = cur.map((p) => ({ Data: p.purchased_at, Supermercado: p.store_name, Cadeia: p.store_chain, 'Total (€)': p.total_paid, Pagamento: p.payment_method ?? '' }))
    const artigos = items.map((it) => ({ Data: it.purchases.purchased_at, Artigo: it.name, Quantidade: Number(it.quantity), 'Valor (€)': Number(it.line_total),
      Categoria: categories.find((c) => c.id === it.category_id)?.name ?? '' }))
    if (kind === 'csv') exportCsv(`relatorio-${month.slice(0, 7)}.csv`, compras)
    else exportXlsx(`relatorio-${month.slice(0, 7)}.xlsx`, [{ name: 'Resumo', rows: resumo }, { name: 'Compras', rows: compras }, { name: 'Artigos', rows: artigos }])
  }

  return (
    <div className="space-y-4">
      <select className="input" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês">
        {months.map((m) => <option key={m} value={m}>{fmtMonth(m)}</option>)}
      </select>
      <div className="card px-4 divide-y divide-line/70">
        <Line label="Total gasto" value={<>{money(ind.total)} {ind.change !== null && <Change v={ind.change} />}</>} />
        <Line label="Número de compras" value={ind.count} />
        <Line label="Média por compra" value={money(ind.average)} />
        <Line label="Total de produtos comprados" value={qty(totalUnits)} />
        <Line label="Supermercado onde mais comprámos" value={ind.top ? `${ind.top.label} (${money(ind.top.total)})` : '—'} />
        <Line label="Categoria com maior despesa" value={catTotals[0] ? `${catTotals[0][0]} (${money(catTotals[0][1])})` : '—'} />
        <Line label="Orçamento" value={budget !== null ? `${money(budget)} · ${percent(budget ? ind.total / budget : 0)} usado` : 'Não definido'} />
      </div>
      {topProducts.length > 0 && (
        <div className="card p-4">
          <p className="font-semibold mb-2">Produtos mais comprados</p>
          {topProducts.map((p) => <div key={p.name} className="flex text-sm py-1.5"><span className="flex-1 truncate">{p.name}</span><span className="text-ink-muted w-16 text-right">{qty(p.q)} un.</span><span className="w-20 text-right tabular-nums">{money(p.v)}</span></div>)}
        </div>
      )}
      <ExportButtons onExport={doExport} />
    </div>
  )
}

function YearReport() {
  const { data: purchases = [] } = usePurchases()
  const thisYear = new Date().getFullYear()
  const years = useMemo(() => Array.from(new Set([thisYear, ...purchases.map((p) => Number(p.purchased_at.slice(0, 4)))])).sort((a, b) => b - a), [purchases, thisYear])
  const [year, setYear] = useState(thisYear)
  const from = `${year}-01-01`, to = `${year}-12-31`
  const { data: items = [] } = usePurchaseItemsInRange(from, to)
  const cur = purchases.filter((p) => p.status === 'confirmed' && p.purchased_at.startsWith(String(year)))
  const prevYear = purchases.filter((p) => p.status === 'confirmed' && p.purchased_at.startsWith(String(year - 1)))
  const totals = monthTotals(cur)
  const total = cur.reduce((s, p) => s + p.total_paid, 0)
  const prevTotal = prevYear.reduce((s, p) => s + p.total_paid, 0)
  const elapsed = year === thisYear ? new Date().getMonth() + 1 : 12
  const rows = Array.from({ length: 12 }, (_, i) => { const k = `${year}-${String(i + 1).padStart(2, '0')}`; return { k, label: fmtMonthShort(`${k}-01`), total: totals.get(k) ?? 0 } })
  const withData = rows.filter((r) => r.total > 0)
  const maxM = withData.length ? withData.reduce((a, b) => (b.total > a.total ? b : a)) : null
  const minM = withData.length ? withData.reduce((a, b) => (b.total < a.total ? b : a)) : null
  const stores = totalsByStore(cur)

  // Evolução de preços: produtos comprados mais de uma vez no ano (primeiro vs último preço unitário).
  const priceChanges = useMemo(() => {
    const m = new Map<string, { name: string; first: number; last: number; firstD: string; lastD: string }>()
    for (const it of [...items].sort((a, b) => a.purchases.purchased_at.localeCompare(b.purchases.purchased_at))) {
      if (!it.product_id) continue
      const u = Number(it.line_total) / Number(it.quantity)
      const e = m.get(it.product_id)
      if (!e) m.set(it.product_id, { name: it.name, first: u, last: u, firstD: it.purchases.purchased_at, lastD: it.purchases.purchased_at })
      else { e.last = u; e.lastD = it.purchases.purchased_at }
    }
    return [...m.values()].filter((e) => e.firstD !== e.lastD && e.first > 0).map((e) => ({ ...e, ch: (e.last - e.first) / e.first }))
      .sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch)).slice(0, 8)
  }, [items])

  const doExport = (kind: 'csv' | 'xlsx') => {
    const mensal = rows.map((r) => ({ Mês: fmtMonth(`${r.k}-01`), 'Total (€)': r.total }))
    const lojas = stores.map((s) => ({ Supermercado: s.label, 'Total (€)': s.total, '%': Math.round(s.share * 1000) / 10, Compras: s.count }))
    if (kind === 'csv') exportCsv(`relatorio-${year}.csv`, mensal)
    else exportXlsx(`relatorio-${year}.xlsx`, [{ name: 'Mensal', rows: mensal }, { name: 'Supermercados', rows: lojas },
      { name: 'Preços', rows: priceChanges.map((p) => ({ Produto: p.name, 'Primeiro (€)': Math.round(p.first * 100) / 100, 'Último (€)': Math.round(p.last * 100) / 100, 'Variação %': Math.round(p.ch * 1000) / 10 })) }])
  }

  return (
    <div className="space-y-4">
      <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Ano">{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
      <div className="card px-4 divide-y divide-line/70">
        <Line label={`Total gasto em ${year}`} value={money(total)} />
        <Line label="Média mensal" value={money(total / elapsed)} />
        <Line label="Mês mais caro" value={maxM ? `${fmtMonth(`${maxM.k}-01`)} (${money(maxM.total)})` : '—'} />
        <Line label="Mês mais económico" value={minM ? `${fmtMonth(`${minM.k}-01`)} (${money(minM.total)})` : '—'} />
        <Line label={`Comparação com ${year - 1}`} value={prevTotal > 0 ? <>{money(prevTotal)} → {money(total)} <Change v={(total - prevTotal) / prevTotal} /></> : 'Sem dados do ano anterior'} />
      </div>
      {withData.length > 0 && (
        <div className="card p-4">
          <p className="font-semibold mb-2">Gastos por mês</p>
          <div className="h-52 -ml-2">
            <ResponsiveContainer>
              <BarChart data={rows}>
                <CartesianGrid stroke="#ECEAE3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A8C83' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8A8C83' }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${Math.round(Number(v))}€`} />
                <Tooltip cursor={{ fill: 'rgba(42,44,40,.05)' }} formatter={(v) => [money(Number(v)), 'Total']} />
                <Bar isAnimationActive={false} dataKey="total" fill="#62805A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      {priceChanges.length > 0 && (
        <div className="card p-4">
          <p className="font-semibold mb-2">Evolução de preços em {year}</p>
          {priceChanges.map((p) => <div key={p.name} className="flex items-center text-sm py-1.5 gap-2"><span className="flex-1 truncate">{p.name}</span><span className="text-ink-muted tabular-nums">{money(p.first)} → {money(p.last)}</span><span className="w-16 text-right"><Change v={p.ch} compact /></span></div>)}
          <p className="text-xs text-ink-muted mt-2">Preço por unidade comprada, primeira vs última compra do ano.</p>
        </div>
      )}
      <ExportButtons onExport={doExport} />
    </div>
  )
}

function ExportButtons({ onExport }: { onExport: (k: 'csv' | 'xlsx') => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <button className="btn-secondary" onClick={() => onExport('csv')}><Download size={18} />CSV</button>
      <button className="btn-secondary" onClick={() => onExport('xlsx')}><Download size={18} />Excel</button>
    </div>
  )
}


