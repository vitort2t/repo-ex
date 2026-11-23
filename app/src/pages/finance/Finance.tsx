import { CalendarDays, ChevronLeft, ChevronRight, FileUp, Globe2, Landmark, ListOrdered, PiggyBank, Plus, ShoppingBasket, Target, TrendingDown, TrendingUp, Wallet, BarChart3, Tags } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { useBalances, useFinLookups, useTransactions } from '@/hooks/finance'
import { fmtMonth, fmtMonthShort, isoDate, money, percent } from '@/lib/format'
import { axis, C, euroTick } from '@/lib/chart'
import { categoryChanges, consolidate, expensesByCategory, expensesByPerson, monthlySeries, monthsBack, monthSummary, previousMonth, savingsSeries } from '@/lib/finance'
import { useFinanceUI } from '@/components/finance/FinanceUI'
import { Change } from '@/components/StoreDashboard'
import { EmptyState, ErrorBox, Loading, Page, PageHeader, cx } from '@/components/ui'

function Tile({ label, value, sub, to, tone }: { label: string; value: string; sub?: ReactNode; to?: string; tone?: 'ok' | 'wine' | 'navy' | 'plum' }) {
  const body = (
    <div className="card p-3.5 h-full">
      <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide leading-tight">{label}</p>
      <p className={cx('text-lg font-bold tabular-nums mt-1', tone === 'ok' && 'text-ok-ink', tone === 'wine' && 'text-wine-600', tone === 'plum' && 'text-plum-600', tone === 'navy' && 'text-navy-600')}>{value}</p>
      {sub && <div className="text-xs text-ink-muted mt-0.5">{sub}</div>}
    </div>
  )
  return to ? <Link to={to} className="block active:scale-[.99] transition">{body}</Link> : body
}

function ChartCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return <div className="card p-4 space-y-3"><p className="font-semibold">{title}</p>{children}{footer}</div>
}

const Nav = [
  { to: '/financas/movimentos', label: 'Movimentos', icon: ListOrdered },
  { to: '/financas/contas', label: 'As nossas contas', icon: Landmark },
  { to: '/financas/heitor', label: 'Heitor · Brasil', icon: Globe2 },
  { to: '/financas/calendario', label: 'Calendário', icon: CalendarDays },
  { to: '/financas/orcamento', label: 'Orçamento', icon: Wallet },
  { to: '/financas/objetivos', label: 'Os nossos objetivos', icon: Target },
  { to: '/despesas', label: 'Supermercados', icon: ShoppingBasket },
  { to: '/financas/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/financas/importar', label: 'Importar extrato', icon: FileUp },
  { to: '/financas/categorias', label: 'Categorias e pessoas', icon: Tags },
]

export default function Finance() {
  const nav = useNavigate()
  const { openNew } = useFinanceUI()
  const { data: txs, isLoading, error, refetch } = useTransactions()
  const { data: balances = [] } = useBalances()
  const L = useFinLookups()
  const [month, setMonth] = useState(isoDate().slice(0, 7))
  const isCurrent = month === isoDate().slice(0, 7)
  const shift = (n: number) => { const [y, m] = month.split('-').map(Number); setMonth(isoDate(new Date(y, m - 1 + n, 1)).slice(0, 7)) }

  const all = useMemo(() => txs ?? [], [txs])
  const s = useMemo(() => monthSummary(all, month, L.catMap, L.heitor?.id ?? null, L.savingsAccounts), [all, month, L])
  const p = useMemo(() => monthSummary(all, previousMonth(month), L.catMap, L.heitor?.id ?? null, L.savingsAccounts), [all, month, L])
  const cons = consolidate(balances)
  const months = monthsBack(month, 6)
  const series = useMemo(() => monthlySeries(all, months, L.catMap, L.heitor?.id ?? null, L.savingsAccounts).map((r) => ({ ...r, label: fmtMonthShort(`${r.month}-01`) })), [all, months.join(), L]) // eslint-disable-line react-hooks/exhaustive-deps
  const byCat = useMemo(() => expensesByCategory(all, [month], L.catMap), [all, month, L.catMap])
  const analysis = useMemo(() => categoryChanges(all, month, L.catMap), [all, month, L.catMap])
  const byPerson = useMemo(() => expensesByPerson(all, [month], L.people), [all, month, L.people])
  const savings = useMemo(() => savingsSeries(all, L.accounts, monthsBack(month, 12)).map((r) => ({ ...r, label: fmtMonthShort(`${r.month}-01`) })), [all, L.accounts, month])
  const heitor12 = useMemo(() => monthlySeries(all, monthsBack(month, 12), L.catMap, L.heitor?.id ?? null, L.savingsAccounts).map((r) => ({ month: r.month, label: fmtMonthShort(`${r.month}-01`), heitor: r.heitor })), [all, month, L])
  const heitorYear = heitor12.filter((r) => r.month.startsWith(month.slice(0, 4))).reduce((a, r) => a + r.heitor, 0)
  const ch = (a: number, b: number) => (b > 0 ? (a - b) / b : null)
  const open = (q: string) => nav(`/financas/movimentos?mes=${month}${q}`)

  if (isLoading) return <><PageHeader title="Finanças da família" /><Loading /></>
  if (error && !txs) return <><PageHeader title="Finanças da família" /><Page><ErrorBox error={error} retry={refetch} /></Page></>

  return (
    <>
      <PageHeader title="Finanças da família" subtitle="Quanto entra, quanto sai e quanto guardamos"
        actions={<button onClick={() => openNew()} aria-label="Novo movimento" className="h-10 w-10 grid place-items-center rounded-full bg-wine-600 text-white"><Plus size={22} /></button>} />
      <Page>
        <div className="flex items-center gap-2">
          <button aria-label="Mês anterior" onClick={() => shift(-1)} className="h-10 w-10 grid place-items-center rounded-full bg-white border border-line"><ChevronLeft size={20} /></button>
          <p className="flex-1 text-center font-semibold">{fmtMonth(`${month}-01`)}</p>
          <button aria-label="Mês seguinte" onClick={() => shift(1)} disabled={isCurrent} className="h-10 w-10 grid place-items-center rounded-full bg-white border border-line disabled:opacity-30"><ChevronRight size={20} /></button>
        </div>

        {all.length === 0 && balances.length === 0 ? (
          <EmptyState icon={<Wallet />} title="Comece pelas contas" text="Registe as contas bancárias, o numerário e as poupanças. Depois, cada entrada e saída atualiza os saldos."
            action={<div className="flex gap-2 flex-wrap justify-center"><Link to="/financas/contas" className="btn-primary">Criar contas</Link><button className="btn-secondary" onClick={() => openNew()}>Novo movimento</button></div>} />
        ) : null}

        {/* RESUMO DO MÊS */}
        <section className="space-y-2">
          <h2 className="section-title px-1">Resumo do mês</h2>
          <div className="card p-4 bg-navy-600 border-navy-600 text-white">
            <p className="text-xs uppercase tracking-wide text-white/70 font-semibold">Saldo líquido do período</p>
            <p className="text-[32px] font-bold tabular-nums leading-tight">{s.net >= 0 ? '+' : '−'}{money(Math.abs(s.net))}</p>
            <p className="text-sm text-white/75">Mês anterior: {money(p.net)}{ch(s.net, p.net) !== null && p.net > 0 ? ` · ${s.net >= p.net ? '▲' : '▼'} ${percent(Math.abs(ch(s.net, p.net)!))}` : ''}</p>
            <div className="mt-3 pt-3 border-t border-white/15 flex justify-between text-sm">
              <span className="text-white/75">Dinheiro disponível nas contas</span><span className="font-semibold tabular-nums">{money(cons.available)}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Tile label="Rendimentos recebidos" value={money(s.income)} tone="ok" to={`/financas/movimentos?mes=${month}&tipo=income`} sub={ch(s.income, p.income) !== null ? <Change v={ch(s.income, p.income)!} goodWhenUp /> : s.plannedIncome ? `Previsto: ${money(s.plannedIncome)}` : undefined} />
            <Tile label="Despesas pagas" value={money(s.expenses)} tone="wine" to={`/financas/movimentos?mes=${month}&tipo=expense`} sub={ch(s.expenses, p.expenses) !== null ? <Change v={ch(s.expenses, p.expenses)!} /> : undefined} />
            <Tile label="Total poupado" value={money(s.saved)} tone="navy" to="/financas/objetivos" sub={p.saved || s.saved ? <>Mês anterior: {money(p.saved)}</> : 'Transferências para poupança'} />
            <Tile label="Enviado ao Heitor" value={money(s.heitor)} tone="plum" to="/financas/heitor" sub={`No ano: ${money(heitorYear)}`} />
            <Tile label="Transferências próprias" value={money(s.ownTransfers)} to={`/financas/movimentos?mes=${month}&tipo=transfer`} sub="Não contam como despesa" />
            <Tile label="Previsto / pendente" value={money(s.plannedExpenses + s.pendingExpenses)} to="/financas/calendario" sub={s.pendingExpenses ? `Pendente: ${money(s.pendingExpenses)}` : 'Por pagar este mês'} />
          </div>
        </section>

        {/* ANÁLISE SIMPLES */}
        <section className="card p-4 space-y-3">
          <p className="font-semibold">Análise do mês</p>
          <div className="space-y-2.5 text-sm">
            <p><span className="text-ink-muted">Onde gastámos mais: </span>
              {analysis.top.length ? analysis.top.map((c, i) => <button key={c.id} onClick={() => open(`&categoria=${c.id}`)} className="font-semibold text-navy-600">{i ? ', ' : ''}{c.name} ({money(c.total)})</button>) : '—'}</p>
            <div className="flex gap-2"><TrendingDown size={17} className="text-ok shrink-0 mt-0.5" /><p><span className="text-ink-muted">Onde conseguimos economizar: </span>
              {analysis.decreased.length ? analysis.decreased.slice(0, 3).map((c, i) => <span key={c.id}>{i ? ', ' : ''}<b>{c.name}</b> (−{money(Math.abs(c.diff))})</span>) : 'nenhuma categoria baixou face ao mês anterior.'}</p></div>
            <div className="flex gap-2"><TrendingUp size={17} className="text-alert shrink-0 mt-0.5" /><p><span className="text-ink-muted">Despesas que aumentaram: </span>
              {analysis.increased.length ? analysis.increased.slice(0, 3).map((c, i) => <span key={c.id}>{i ? ', ' : ''}<b>{c.name}</b> (+{money(c.diff)}{c.change !== null ? `, ${percent(c.change)}` : ''})</span>) : 'nenhuma.'}</p></div>
            <p className="text-ink-muted">Poupança: <b className="text-ink">{money(s.saved)}</b> este mês {p.saved || s.saved ? <>vs <b className="text-ink">{money(p.saved)}</b> no mês anterior</> : ''}.</p>
          </div>
        </section>

        {/* Atalhos */}
        <div className="grid grid-cols-2 gap-2">
          {Nav.map((n) => <Link key={n.to} to={n.to} className="card px-3 py-3 flex items-center gap-2.5 text-sm font-semibold"><n.icon size={18} strokeWidth={1.8} className="text-navy-600" />{n.label}</Link>)}
        </div>

        {/* GRÁFICO 1 */}
        <ChartCard title="Entradas vs. saídas">
          <div className="h-52 -ml-2"><ResponsiveContainer>
            <BarChart data={series} barGap={2} onClick={(e) => { const m = (e as { activePayload?: { payload: { month: string } }[] })?.activePayload?.[0]?.payload.month; if (m) nav(`/financas/movimentos?mes=${m}`) }}>
              <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} width={48} tickFormatter={euroTick} />
              <Tooltip cursor={{ fill: C.cursor }} formatter={(v, n) => [money(Number(v)), n === 'income' ? 'Entradas' : 'Saídas']} />
              <Legend formatter={(v) => (v === 'income' ? 'Entradas' : 'Saídas')} iconType="square" wrapperStyle={{ fontSize: 12 }} />
              <Bar isAnimationActive={false} dataKey="income" fill={C.navy} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} />
              <Bar isAnimationActive={false} dataKey="expenses" fill={C.wine} radius={[4, 4, 0, 0]} stroke="#fff" strokeWidth={1} />
            </BarChart>
          </ResponsiveContainer></div>
        </ChartCard>

        {/* GRÁFICO 2 */}
        <ChartCard title="Para onde vai o nosso dinheiro?">
          {byCat.length === 0 ? <p className="text-sm text-ink-muted">Sem despesas pagas neste mês.</p> : (
            <div className="space-y-1">
              {byCat.map((c) => (
                <button key={c.id} onClick={() => open(c.id === 'none' ? '&categoria=none' : `&categoria=${c.id}`)} className="block w-full text-left rounded-xl -mx-2 px-2 py-1.5 hover:bg-base">
                  <div className="flex text-sm mb-1"><span className="flex-1 font-medium">{c.name}</span><span className="font-semibold tabular-nums">{money(c.total)}</span><span className="w-14 text-right text-ink-muted tabular-nums">{percent(c.share)}</span></div>
                  <div className="h-2.5"><div className="h-full rounded-r-[4px] rounded-l-sm" style={{ width: `${Math.max(2, c.share * 100)}%`, background: c.name === 'Heitor' ? C.plum : C.wine }} /></div>
                </button>
              ))}
            </div>
          )}
        </ChartCard>

        {/* GRÁFICO 3 */}
        <ChartCard title="Quem gastou?" footer={<p className="text-xs text-ink-muted">Despesas pagas por cada pessoa. Despesas partilhadas contam uma só vez, para quem pagou.</p>}>
          {byPerson.every((x) => x.total === 0) ? <p className="text-sm text-ink-muted">Sem despesas com pessoa indicada neste mês.</p> : (
            <div className="space-y-3">
              {byPerson.map((x) => {
                const max = Math.max(...byPerson.map((y) => y.total), 1)
                return (
                  <button key={x.id} onClick={() => open(`&pessoa=${x.id}`)} className="block w-full text-left">
                    <div className="flex text-sm mb-1"><span className="flex-1 font-semibold">{x.name}</span><span className="tabular-nums font-semibold">{money(x.total)}</span></div>
                    <div className="h-3 flex gap-[2px]" style={{ width: `${Math.max(2, (x.total / max) * 100)}%` }}>
                      {x.shared > 0 && <div className="h-full rounded-l-sm" style={{ flex: x.shared, background: C.navy }} title={`Partilhadas: ${money(x.shared)}`} />}
                      {x.individual > 0 && <div className="h-full rounded-r-[4px]" style={{ flex: x.individual, background: C.rose }} title={`Individuais: ${money(x.individual)}`} />}
                    </div>
                    <p className="text-xs text-ink-muted mt-1">Partilhadas {money(x.shared)} · Individuais {money(x.individual)}</p>
                  </button>
                )
              })}
              <div className="flex gap-4 text-xs text-ink-soft"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C.navy }} />Partilhadas</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: C.rose }} />Individuais</span></div>
            </div>
          )}
        </ChartCard>

        {/* GRÁFICO 4 */}
        <ChartCard title="Heitor no Brasil" footer={<Link to="/financas/heitor" className="text-sm font-semibold text-navy-600">Ver todos os envios</Link>}>
          <div className="h-44 -ml-2"><ResponsiveContainer>
            <BarChart data={heitor12}><CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="label" {...axis} interval={1} /><YAxis {...axis} width={44} tickFormatter={euroTick} />
              <Tooltip cursor={{ fill: C.cursor }} formatter={(v) => [money(Number(v)), 'Enviado']} />
              <Bar isAnimationActive={false} dataKey="heitor" fill={C.plum} radius={[4, 4, 0, 0]} /></BarChart>
          </ResponsiveContainer></div>
        </ChartCard>

        {/* GRÁFICO 5 */}
        <ChartCard title="Evolução das poupanças" footer={L.accounts.some((a) => a.kind === 'savings') ? undefined : <p className="text-xs text-ink-muted">Crie uma conta do tipo “Poupança” para acompanhar esta evolução.</p>}>
          <div className="h-44 -ml-2"><ResponsiveContainer>
            <LineChart data={savings}><CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="label" {...axis} interval={1} /><YAxis {...axis} width={48} tickFormatter={euroTick} />
              <Tooltip formatter={(v) => [money(Number(v)), 'Poupança acumulada']} />
              <Line isAnimationActive={false} type="linear" dataKey="total" stroke={C.navy} strokeWidth={2} dot={{ r: 3, fill: C.navy }} /></LineChart>
          </ResponsiveContainer></div>
        </ChartCard>

        {/* GRÁFICO 6 */}
        <ChartCard title="Evolução do saldo familiar">
          <div className="h-52 -ml-2"><ResponsiveContainer>
            <LineChart data={series}><CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="label" {...axis} /><YAxis {...axis} width={48} tickFormatter={euroTick} />
              <Tooltip formatter={(v, n) => [money(Number(v)), n === 'income' ? 'Entradas' : n === 'expenses' ? 'Saídas' : 'Saldo']} />
              <Legend formatter={(v) => (v === 'income' ? 'Entradas' : v === 'expenses' ? 'Saídas' : 'Saldo do mês')} wrapperStyle={{ fontSize: 12 }} />
              <Line isAnimationActive={false} type="linear" dataKey="income" stroke={C.navy} strokeWidth={2} dot={{ r: 3 }} />
              <Line isAnimationActive={false} type="linear" dataKey="expenses" stroke={C.wine} strokeWidth={2} dot={{ r: 3 }} />
              <Line isAnimationActive={false} type="linear" dataKey="net" stroke={C.taupe} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} /></LineChart>
          </ResponsiveContainer></div>
        </ChartCard>

        <div className="card p-4 flex items-center gap-3">
          <PiggyBank size={20} className="text-navy-600" />
          <p className="text-sm flex-1">Saldo real {money(cons.real)} · disponível {money(cons.available)}{cons.byCurrency.BRL !== undefined ? ` · em reais ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cons.byCurrency.BRL)}` : ''}</p>
          <Link to="/financas/contas" className="text-sm font-semibold text-navy-600">Contas</Link>
        </div>
        <p className="text-xs text-ink-muted px-1">Todos os valores usam apenas movimentos efetivamente realizados. Previstos e pendentes aparecem à parte.</p>
      </Page>
    </>
  )
}
