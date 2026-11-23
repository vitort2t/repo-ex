import { ChevronRight, TrendingDown, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmtDate, fmtMonth, fmtMonthShort, isoDate, money, parseIsoDate, percent } from '@/lib/format'
import { indicators, inRange, monthlyByStore, periodRange, PERIODS, previousRange, storeChanges, totalsByStore, type PeriodKey, type Range } from '@/lib/stats'
import { STORES, storeColor, storeLabel } from '@/lib/stores'
import type { Purchase, StoreChain } from '@/lib/types'
import { Chips, cx } from './ui'

/** “ONDE GASTAMOS O NOSSO DINHEIRO?” — comparação entre supermercados, só com compras confirmadas. */
export function StoreDashboard({ purchases }: { purchases: Purchase[] }) {
  const [period, setPeriod] = useState<PeriodKey>('this_month')
  const [custom, setCustom] = useState<Range>(() => periodRange('this_month'))
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const range = periodRange(period, new Date(), custom)
  const prevRange = previousRange(range)
  const current = useMemo(() => inRange(purchases, range), [purchases, range.from, range.to])
  const previous = useMemo(() => inRange(purchases, prevRange), [purchases, prevRange.from, prevRange.to])
  const stores = useMemo(() => totalsByStore(current), [current])
  const ind = useMemo(() => indicators(current, previous), [current, previous])
  const changes = useMemo(() => storeChanges(current, previous), [current, previous])

  // A evolução mensal mostra sempre pelo menos 6 meses, para se perceber a tendência.
  const evoRange: Range = useMemo(() => {
    const from = parseIsoDate(range.from), to = parseIsoDate(range.to)
    const sixBack = new Date(to.getFullYear(), to.getMonth() - 5, 1)
    return { from: isoDate(from < sixBack ? from : sixBack), to: range.to }
  }, [range.from, range.to])
  const monthly = useMemo(() => monthlyByStore(purchases, evoRange, fmtMonthShort), [purchases, evoRange])
  const chainsInEvo = STORES.filter((s) => monthly.some((m) => (m[s.key] ?? 0) > 0))
  const max = stores[0]?.total ?? 0
  const prevLabel = period === 'this_month' || period === 'last_month' ? 'mês anterior' : 'período anterior'

  return (
    <section className="space-y-3">
      <div className="px-1 pt-3">
        <h2 className="text-[17px] font-extrabold tracking-tight uppercase">Onde gastamos o nosso dinheiro?</h2>
        <p className="text-sm text-ink-muted">Despesas por supermercado, a partir das faturas confirmadas.</p>
      </div>
      <Chips value={period} onChange={setPeriod} options={PERIODS.map((p) => ({ value: p.key, label: p.label }))} />
      {period === 'custom' && (
        <div className="grid grid-cols-2 gap-2">
          <label><span className="label">De</span><input type="date" className="input" value={custom.from} max={custom.to} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} /></label>
          <label><span className="label">Até</span><input type="date" className="input" value={custom.to} min={custom.from} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} /></label>
        </div>
      )}
      <p className="text-xs text-ink-muted px-1">{fmtDate(range.from)} – {fmtDate(range.to)}</p>

      {current.length === 0 ? (
        <div className="card p-5 text-sm text-ink-muted text-center">Não há compras confirmadas neste período.</div>
      ) : (<>
        {/* Indicadores automáticos */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card p-4 col-span-2">
            <p className="text-xs text-ink-muted font-medium">Onde mais gastámos</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="h-3 w-3 rounded-full" style={{ background: ind.top?.color }} />
              <p className="text-xl font-bold flex-1">{ind.top?.label}</p>
              <p className="text-xl font-bold tabular-nums">{money(ind.top?.total)}</p>
            </div>
            <p className="text-xs text-ink-muted mt-1">{percent(ind.top?.share)} do total{ind.bottom ? ` · onde menos gastámos: ${ind.bottom.label} (${money(ind.bottom.total)})` : ''}</p>
          </div>
          <Kpi label="Total em supermercados" value={money(ind.total)}
               sub={ind.change === null ? `Sem dados no ${prevLabel}` : <Change v={ind.change} suffix={`vs ${prevLabel}`} />} />
          <Kpi label="Compras realizadas" value={String(ind.count)} sub={`${stores.length} ${stores.length === 1 ? 'supermercado' : 'supermercados'}`} />
          <Kpi label="Valor médio por fatura" value={money(ind.average)} />
          <Kpi label={`Total no ${prevLabel}`} value={money(ind.previousTotal)} />
        </div>

        {/* Despesas por supermercado */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center">
            <p className="font-semibold flex-1">Despesas por supermercado</p>
            <div className="flex bg-champagne rounded-lg p-0.5 text-xs font-semibold">
              {(['chart', 'table'] as const).map((v) => <button key={v} onClick={() => setView(v)} className={cx('px-2.5 h-7 rounded-md', view === v ? 'bg-white shadow-card' : 'text-ink-muted')}>{v === 'chart' ? 'Gráfico' : 'Tabela'}</button>)}
            </div>
          </div>
          {view === 'chart' ? (
            <div className="space-y-1">
              {stores.map((s) => (
                <Link key={s.key} to={`/despesas/loja/${s.key}`} className="block group rounded-xl -mx-2 px-2 py-2 hover:bg-base" title={`${s.label}: ${money(s.total)} (${percent(s.share)}) em ${s.count} compras`}>
                  <div className="flex items-baseline gap-2 text-sm mb-1.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0 self-center" style={{ background: s.color }} />
                    <span className="font-semibold flex-1">{s.label}</span>
                    <span className="font-bold tabular-nums">{money(s.total)}</span>
                    <span className="text-ink-muted tabular-nums w-14 text-right">{percent(s.share)}</span>
                    <ChevronRight size={15} className="text-ink-muted self-center" />
                  </div>
                  <div className="h-3 rounded-r-[4px] bg-transparent">
                    <div className="h-full rounded-r-[4px] rounded-l-sm transition-all duration-500" style={{ width: `${max ? Math.max(2, (s.total / max) * 100) : 0}%`, background: s.color }} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-ink-muted"><th className="font-medium py-1">Supermercado</th><th className="font-medium text-right">Total</th><th className="font-medium text-right">%</th><th className="font-medium text-right">Compras</th><th className="font-medium text-right">Média</th></tr></thead>
              <tbody className="divide-y divide-line/70">
                {stores.map((s) => (
                  <tr key={s.key}><td className="py-2"><Link to={`/despesas/loja/${s.key}`} className="font-semibold text-navy-700">{s.label}</Link></td>
                    <td className="text-right tabular-nums">{money(s.total)}</td><td className="text-right tabular-nums">{percent(s.share)}</td>
                    <td className="text-right tabular-nums">{s.count}</td><td className="text-right tabular-nums">{money(s.average)}</td></tr>
                ))}
                <tr className="font-bold"><td className="py-2">Total</td><td className="text-right tabular-nums">{money(ind.total)}</td><td className="text-right">100%</td><td className="text-right">{ind.count}</td><td className="text-right tabular-nums">{money(ind.average)}</td></tr>
              </tbody>
            </table>
          )}
          <p className="text-xs text-ink-muted">Toque num supermercado para ver todas as faturas registadas.</p>
        </div>

        {/* Comparação com o período anterior */}
        <div className="card p-4 space-y-2">
          <p className="font-semibold">Comparação com o {prevLabel}</p>
          <div className="divide-y divide-line/70">
            {changes.map((c) => (
              <div key={c.key} className="flex items-center gap-2 py-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: storeColor(c.key) }} />
                <span className="flex-1 font-medium">{c.label}</span>
                <span className="text-ink-muted tabular-nums">{money(c.previous)}</span>
                <span className="text-ink-muted">→</span>
                <span className="font-semibold tabular-nums w-20 text-right">{money(c.current)}</span>
                <span className="w-16 text-right">{c.change === null ? <span className="text-xs text-ink-muted">novo</span> : <Change v={c.change} compact />}</span>
              </div>
            ))}
          </div>
        </div>
      </>)}

      {/* Evolução mensal */}
      {monthly.some((m) => m.total > 0) && (
        <div className="card p-4 space-y-3">
          <p className="font-semibold">Evolução mensal por supermercado</p>
          <div className="h-56 -ml-2">
            <ResponsiveContainer>
              <BarChart data={monthly} barCategoryGap="22%">
                <CartesianGrid stroke="#ECE4DA" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8B8F98' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#8B8F98' }} tickLine={false} axisLine={false} width={44} tickFormatter={(v) => `${Math.round(Number(v))}€`} />
                <Tooltip cursor={{ fill: 'rgba(20,38,61,.05)' }} content={<MonthTooltip />} />
                {chainsInEvo.map((s, i) => (
                  <Bar isAnimationActive={false} key={s.key} dataKey={s.key} stackId="a" fill={s.color} stroke="#fff" strokeWidth={2}
                       radius={i === chainsInEvo.length - 1 ? [4, 4, 0, 0] : 0} name={s.label} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {chainsInEvo.map((s) => <span key={s.key} className="flex items-center gap-1.5 text-xs text-ink-soft"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
          </div>
          <MonthOverMonth rows={monthly} />
        </div>
      )}
    </section>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-ink-muted font-medium leading-tight">{label}</p>
      <p className="text-lg font-bold tabular-nums mt-1">{value}</p>
      {sub && <div className="text-xs text-ink-muted mt-0.5">{sub}</div>}
    </div>
  )
}

export function Change({ v, suffix, compact, goodWhenUp }: { v: number; suffix?: string; compact?: boolean; goodWhenUp?: boolean }) {
  // Para despesas, gastar mais é desfavorável (alerta); para rendimentos/poupança é o contrário.
  const up = v > 0.0005, down = v < -0.0005
  const good = goodWhenUp ? up : down, bad = goodWhenUp ? down : up
  return (
    <span className={cx('inline-flex items-center gap-1 font-semibold tabular-nums', bad && 'text-alert-ink', good && 'text-ok-ink', !up && !down && 'text-ink-muted')}>
      {up ? <TrendingUp size={13} /> : down ? <TrendingDown size={13} /> : null}
      {up ? '+' : ''}{percent(v)}{!compact && suffix ? <span className="font-normal text-ink-muted"> {suffix}</span> : null}
    </span>
  )
}

type TipProps = { active?: boolean; payload?: { dataKey: string; value: number }[]; label?: string }
function MonthTooltip({ active, payload, label }: TipProps) {
  if (!active || !payload?.length) return null
  const rows = payload.filter((p) => p.value > 0).sort((a, b) => b.value - a.value)
  const total = rows.reduce((s, r) => s + r.value, 0)
  return (
    <div className="bg-white rounded-xl shadow-sheet border border-line px-3 py-2 text-xs min-w-[160px]">
      <p className="font-semibold mb-1 capitalize">{label}</p>
      {rows.map((r) => (
        <div key={r.dataKey} className="flex items-center gap-2 py-0.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: storeColor(r.dataKey as StoreChain) }} />
          <span className="flex-1 text-ink-soft">{storeLabel(r.dataKey as StoreChain)}</span><span className="tabular-nums">{money(r.value)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t border-line mt-1 pt-1 font-semibold"><span>Total</span><span className="tabular-nums">{money(total)}</span></div>
    </div>
  )
}

function MonthOverMonth({ rows }: { rows: ReturnType<typeof monthlyByStore> }) {
  const last = rows[rows.length - 1], prev = rows[rows.length - 2]
  if (!last || !prev) return null
  const ch = prev.total > 0 ? (last.total - prev.total) / prev.total : null
  return (
    <p className="text-sm text-ink-soft">
      {fmtMonth(`${last.month}-01`)}: <b className="text-ink">{money(last.total)}</b>
      {ch !== null ? <> · <Change v={ch} suffix={`face a ${fmtMonthShort(`${prev.month}-01`)}`} /></> : ` · sem compras em ${fmtMonthShort(`${prev.month}-01`)}`}
    </p>
  )
}
