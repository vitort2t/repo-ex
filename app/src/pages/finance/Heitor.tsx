import { Download, Globe2, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useFinLookups, useHeitorTransfers, useTransactions } from '@/hooks/finance'
import { fmtDate, fmtMonthShort, isoDate, money } from '@/lib/format'
import { axis, C, euroTick } from '@/lib/chart'
import { exportXlsx } from '@/lib/export'
import { moneyBRL, monthsBack } from '@/lib/finance'
import { useFinanceUI } from '@/components/finance/FinanceUI'
import { EmptyState, Page, PageHeader } from '@/components/ui'

export default function Heitor() {
  const { data: txs = [] } = useTransactions()
  const { data: details = [] } = useHeitorTransfers()
  const L = useFinLookups()
  const { openNew, openDetail } = useFinanceUI()
  const thisYear = isoDate().slice(0, 4), thisMonth = isoDate().slice(0, 7)
  const [year, setYear] = useState(thisYear)
  const [purpose, setPurpose] = useState('')

  // Envios = movimentos com detalhes de câmbio (não anulados e realizados)
  const sends = useMemo(() => details.map((d) => ({ d, t: txs.find((t) => t.id === d.transaction_id) }))
    .filter((x) => x.t && x.t.status === 'done')
    .map((x) => ({ ...x.d, tx: x.t! })).sort((a, b) => b.tx.date.localeCompare(a.tx.date)), [details, txs])
  const purposes = Array.from(new Set(sends.map((s) => s.purpose).filter(Boolean))) as string[]
  const years = Array.from(new Set([thisYear, ...sends.map((s) => s.tx.date.slice(0, 4))])).sort().reverse()
  const filtered = sends.filter((s) => (year === 'all' || s.tx.date.startsWith(year)) && (!purpose || s.purpose === purpose))

  const sum = (arr: typeof sends, f: (s: (typeof sends)[number]) => number) => arr.reduce((a, s) => a + f(s), 0)
  const monthTotal = sum(sends.filter((s) => s.tx.date.startsWith(thisMonth)), (s) => s.amount_eur)
  const yearTotal = sum(sends.filter((s) => s.tx.date.startsWith(thisYear)), (s) => s.amount_eur)
  const allTotal = sum(sends, (s) => s.amount_eur)
  const monthsWith = new Set(sends.map((s) => s.tx.date.slice(0, 7))).size
  const fees = sum(filtered, (s) => s.fees_eur)
  const brlTotal = sum(filtered, (s) => s.amount_brl ?? 0)
  const avgRate = (() => { const w = filtered.filter((s) => s.fx_rate); const e = sum(w, (s) => s.amount_eur); return e ? sum(w, (s) => (s.fx_rate ?? 0) * s.amount_eur) / e : null })()
  // Outras despesas do Heitor (escola, saúde…) registadas como despesas com beneficiário/categoria Heitor
  const otherHeitor = txs.filter((t) => t.status === 'done' && t.nature === 'expense' && !details.some((d) => d.transaction_id === t.id)
    && (t.beneficiary_id === L.heitor?.id || L.catName(t.category_id).startsWith('Heitor')) && (year === 'all' || t.date.startsWith(year)))

  const chart = monthsBack(year === 'all' || year === thisYear ? thisMonth : `${year}-12`, 12).map((m) => ({
    label: fmtMonthShort(`${m}-01`), eur: sum(sends.filter((s) => s.tx.date.startsWith(m) && (!purpose || s.purpose === purpose)), (s) => s.amount_eur) }))
  const yearly = years.filter((y) => y !== 'all').map((y) => ({ y, total: sum(sends.filter((s) => s.tx.date.startsWith(y)), (s) => s.amount_eur) })).reverse()

  const doExport = () => exportXlsx(`heitor-${year}.xlsx`, [{ name: 'Envios', rows: filtered.map((s) => ({
    Data: s.tx.date, 'Enviado (€)': s.amount_eur, 'Recebido (R$)': s.amount_brl ?? '', 'Taxa (R$/€)': s.fx_rate ?? '', 'Taxas (€)': s.fees_eur,
    'Total saído (€)': s.tx.amount, Serviço: s.service ?? '', Finalidade: s.purpose ?? '', Conta: L.accountName(s.tx.account_id), Observações: s.tx.notes ?? '' })) }])

  return (
    <>
      <PageHeader title="Heitor · Brasil" subtitle="Apoio financeiro" back="/financas"
        actions={<button aria-label="Novo envio" onClick={() => openNew('heitor')} className="h-10 w-10 grid place-items-center rounded-full bg-plum-500 text-white"><Plus size={22} /></button>} />
      <Page>
        <div className="grid grid-cols-2 gap-2.5">
          {[['Enviado este mês', money(monthTotal)], [`Enviado em ${thisYear}`, money(yearTotal)], ['Total acumulado', money(allTotal)], ['Média mensal', money(monthsWith ? allTotal / monthsWith : 0)]].map(([l, v]) => (
            <div key={l} className="card p-3.5"><p className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">{l}</p><p className="text-lg font-bold tabular-nums text-plum-600 mt-1">{v}</p></div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <select className="input h-10 text-sm" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Ano"><option value="all">Todos os anos</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
          <select className="input h-10 text-sm" value={purpose} onChange={(e) => setPurpose(e.target.value)} aria-label="Finalidade"><option value="">Todas as finalidades</option>{purposes.map((p) => <option key={p} value={p}>{p}</option>)}</select>
        </div>
        <div className="card p-4 grid grid-cols-3 gap-2 text-center text-sm">
          <div><p className="font-bold tabular-nums">{moneyBRL(brlTotal)}</p><p className="text-[11px] text-ink-muted">Recebido no Brasil</p></div>
          <div><p className="font-bold tabular-nums">{money(fees)}</p><p className="text-[11px] text-ink-muted">Taxas pagas</p></div>
          <div><p className="font-bold tabular-nums">{avgRate ? avgRate.toFixed(3).replace('.', ',') : '—'}</p><p className="text-[11px] text-ink-muted">Taxa média R$/€</p></div>
        </div>

        <div className="card p-4 space-y-2">
          <p className="font-semibold">Envios por mês (€)</p>
          <div className="h-44 -ml-2"><ResponsiveContainer><BarChart data={chart}><CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="label" {...axis} interval={1} /><YAxis {...axis} width={44} tickFormatter={euroTick} />
            <Tooltip cursor={{ fill: C.cursor }} formatter={(v) => [money(Number(v)), 'Enviado']} /><Bar isAnimationActive={false} dataKey="eur" fill={C.plum} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
          {yearly.length > 1 && <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">{yearly.map((y) => <span key={y.y}><span className="text-ink-muted">{y.y}:</span> <b className="tabular-nums">{money(y.total)}</b></span>)}</div>}
        </div>

        {filtered.length === 0 ? (
          <EmptyState icon={<Globe2 />} title="Sem envios neste período" text="Registe cada transferência com o valor em euros, o valor recebido em reais e a taxa aplicada."
            action={<button className="btn-primary" onClick={() => openNew('heitor')}>Registar envio</button>} />
        ) : (
          <div className="card divide-y divide-line/70 overflow-hidden">
            {filtered.map((s) => (
              <button key={s.transaction_id} onClick={() => openDetail(s.tx)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <span className="h-10 w-10 rounded-xl bg-plum-50 text-plum-600 grid place-items-center shrink-0"><Globe2 size={18} /></span>
                <span className="flex-1 min-w-0"><span className="block font-medium">{fmtDate(s.tx.date)}{s.purpose ? ` · ${s.purpose}` : ''}</span>
                  <span className="block text-xs text-ink-muted truncate">{[s.service, s.fx_rate ? `${String(s.fx_rate).replace('.', ',')} R$/€` : null, s.fees_eur ? `taxas ${money(s.fees_eur)}` : null].filter(Boolean).join(' · ')}</span></span>
                <span className="text-right"><span className="block font-semibold tabular-nums">{money(s.amount_eur)}</span><span className="block text-xs text-ink-muted tabular-nums">{moneyBRL(s.amount_brl)}</span></span>
              </button>
            ))}
          </div>
        )}
        {otherHeitor.length > 0 && <p className="text-sm text-ink-soft px-1">Outras despesas do Heitor no período (escola, saúde…): <b>{money(otherHeitor.reduce((a, t) => a + t.amount, 0))}</b> em {otherHeitor.length} movimento(s).</p>}
        <button className="btn-secondary w-full" onClick={doExport}><Download size={18} />Exportar envios (Excel)</button>
        <p className="text-xs text-ink-muted px-1">A taxa de câmbio de cada envio é a efetivamente aplicada nesse dia e nunca é recalculada. Os envios contam como apoio familiar (despesa), nunca como rendimento.</p>
      </Page>
    </>
  )
}
