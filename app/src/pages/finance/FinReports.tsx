import { Download, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useFinLookups, useHeitorTransfers, useTransactions } from '@/hooks/finance'
import { fmtMonth, isoDate, money, percent } from '@/lib/format'
import { exportXlsx } from '@/lib/export'
import { expensesByCategory, expensesByPerson, fixedVsVariable, incomeByPerson, monthlySeries, type FinTx } from '@/lib/finance'
import { Change } from '@/components/StoreDashboard'
import { Logo } from '@/components/Logo'
import { Page, PageHeader, Segmented } from '@/components/ui'

type P = 'month' | 'quarter' | 'year'

function periodMonths(p: P, anchor: string): string[] {
  const [y, m] = anchor.split('-').map(Number)
  if (p === 'month') return [anchor]
  if (p === 'quarter') { const q0 = Math.floor((m - 1) / 3) * 3; return [0, 1, 2].map((i) => `${y}-${String(q0 + i + 1).padStart(2, '0')}`) }
  return Array.from({ length: 12 }, (_, i) => `${y}-${String(i + 1).padStart(2, '0')}`)
}
function shiftPeriod(p: P, anchor: string, dir: number): string {
  const [y, m] = anchor.split('-').map(Number)
  const d = new Date(y, m - 1 + dir * (p === 'month' ? 1 : p === 'quarter' ? 3 : 12), 1)
  return isoDate(d).slice(0, 7)
}
function periodLabel(p: P, anchor: string) {
  const [y, m] = anchor.split('-').map(Number)
  return p === 'month' ? fmtMonth(`${anchor}-01`) : p === 'quarter' ? `${Math.floor((m - 1) / 3) + 1}.º trimestre de ${y}` : `Ano de ${y}`
}

export default function FinReports() {
  const { data: txs = [] } = useTransactions()
  const { data: heitor = [] } = useHeitorTransfers()
  const L = useFinLookups()
  const [p, setP] = useState<P>('month')
  const [anchor, setAnchor] = useState(isoDate().slice(0, 7))
  const months = periodMonths(p, anchor)
  const prevMonths = periodMonths(p, shiftPeriod(p, anchor, -1))

  const calc = (ms: string[]) => {
    const rows = monthlySeries(txs, ms, L.catMap, L.heitor?.id ?? null, L.savingsAccounts)
    const sum = (k: 'income' | 'expenses' | 'saved' | 'heitor' | 'net') => rows.reduce((s, r) => s + r[k], 0)
    const open = txs.filter((t) => ms.includes(t.date.slice(0, 7)) && (t.status === 'planned' || t.status === 'pending') && t.nature !== 'transfer')
    return { rows, income: sum('income'), expenses: sum('expenses'), saved: sum('saved'), heitor: sum('heitor'), net: sum('net'),
      plannedIn: open.filter((t) => t.nature === 'income' && t.status === 'planned').reduce((s, t) => s + t.amount, 0),
      plannedOut: open.filter((t) => t.nature === 'expense' && t.status === 'planned').reduce((s, t) => s + t.amount, 0),
      pendingOut: open.filter((t) => t.nature === 'expense' && t.status === 'pending').reduce((s, t) => s + t.amount, 0) }
  }
  const cur = useMemo(() => calc(months), [txs, months.join(), L]) // eslint-disable-line react-hooks/exhaustive-deps
  const prev = useMemo(() => calc(prevMonths), [txs, prevMonths.join(), L]) // eslint-disable-line react-hooks/exhaustive-deps
  const cats = expensesByCategory(txs, months, L.catMap)
  const incP = incomeByPerson(txs, months, L.people)
  const expP = expensesByPerson(txs, months, L.people)
  const fv = fixedVsVariable(txs, months)
  const hRows = heitor.map((h) => ({ h, t: txs.find((t) => t.id === h.transaction_id) })).filter((x): x is { h: typeof heitor[number]; t: FinTx } => !!x.t && x.t.status === 'done' && months.includes(x.t.date.slice(0, 7)))
  const ch = (a: number, b: number) => (b > 0 ? (a - b) / b : null)

  const doExport = () => {
    const inP = (ids: string[]) => txs.filter((t) => ids.includes(t.date.slice(0, 7)) && t.status !== 'cancelled' && !(t.nature === 'transfer' && t.direction === 'in'))
    exportXlsx(`lar-relatorio-${months[0]}${months.length > 1 ? `_${months[months.length - 1]}` : ''}.xlsx`, [
      { name: 'Resumo', rows: [
        { Indicador: 'Rendimentos recebidos', 'Valor (€)': cur.income, 'Período anterior (€)': prev.income },
        { Indicador: 'Despesas pagas', 'Valor (€)': cur.expenses, 'Período anterior (€)': prev.expenses },
        { Indicador: 'Saldo líquido', 'Valor (€)': cur.net, 'Período anterior (€)': prev.net },
        { Indicador: 'Poupado', 'Valor (€)': cur.saved, 'Período anterior (€)': prev.saved },
        { Indicador: 'Enviado ao Heitor', 'Valor (€)': cur.heitor, 'Período anterior (€)': prev.heitor },
        { Indicador: 'Gastos fixos', 'Valor (€)': fv.fixed, 'Período anterior (€)': '' },
        { Indicador: 'Gastos variáveis', 'Valor (€)': fv.variable, 'Período anterior (€)': '' },
        { Indicador: 'Rendimentos previstos (não recebidos)', 'Valor (€)': cur.plannedIn, 'Período anterior (€)': '' },
        { Indicador: 'Despesas previstas (não pagas)', 'Valor (€)': cur.plannedOut, 'Período anterior (€)': '' },
        { Indicador: 'Despesas pendentes', 'Valor (€)': cur.pendingOut, 'Período anterior (€)': '' }] },
      { name: 'Por mês', rows: cur.rows.map((r) => ({ Mês: fmtMonth(`${r.month}-01`), 'Entradas (€)': r.income, 'Saídas (€)': r.expenses, 'Saldo (€)': r.net, 'Poupado (€)': r.saved, 'Heitor (€)': r.heitor })) },
      { name: 'Categorias', rows: cats.map((c) => ({ Categoria: c.name, 'Total (€)': c.total, '%': Math.round(c.share * 1000) / 10 })) },
      { name: 'Pessoas', rows: [...incP.map((x) => ({ Pessoa: x.name, Tipo: 'Rendimentos', 'Total (€)': x.total })), ...expP.map((x) => ({ Pessoa: x.name, Tipo: 'Despesas pagas', 'Total (€)': x.total }))] },
      { name: 'Heitor', rows: hRows.map(({ h, t }) => ({ Data: t.date, 'Enviado (€)': h.amount_eur, 'Recebido (R$)': h.amount_brl ?? '', 'Taxa': h.fx_rate ?? '', 'Taxas (€)': h.fees_eur, Finalidade: h.purpose ?? '' })) },
      { name: 'Movimentos', rows: inP(months).map((t) => ({ Data: t.date, Descrição: t.description, Tipo: t.nature, Estado: t.status, 'Valor': t.amount, Moeda: t.currency,
          Categoria: L.catName(t.category_id), Conta: L.accountName(t.account_id), Pessoa: t.person_id ? L.personName(t.person_id) : '', Beneficiário: t.beneficiary_id ? L.personName(t.beneficiary_id) : '' })) },
    ])
  }

  const Row = ({ l, v, sub }: { l: string; v: React.ReactNode; sub?: React.ReactNode }) => <div className="flex items-baseline justify-between py-2.5 text-sm gap-3"><span className="text-ink-soft">{l}</span><span className="font-semibold text-right">{v}{sub && <span className="block text-xs font-normal">{sub}</span>}</span></div>

  return (
    <>
      <PageHeader title="Relatórios financeiros" back="/financas" />
      <Page className="print:px-0">
        <div className="hidden print:block mb-4"><Logo size={30} slogan /></div>
        <div className="print:hidden space-y-3">
          <Segmented value={p} onChange={(v) => { setP(v) }} options={[{ value: 'month', label: 'Mensal' }, { value: 'quarter', label: 'Trimestral' }, { value: 'year', label: 'Anual' }]} />
          <div className="flex items-center gap-2">
            <button className="btn-secondary h-10 px-3" onClick={() => setAnchor(shiftPeriod(p, anchor, -1))}>‹</button>
            <p className="flex-1 text-center font-semibold">{periodLabel(p, anchor)}</p>
            <button className="btn-secondary h-10 px-3" onClick={() => setAnchor(shiftPeriod(p, anchor, 1))} disabled={months[0] > isoDate().slice(0, 7)}>›</button>
          </div>
        </div>
        <h2 className="hidden print:block text-xl font-bold">{periodLabel(p, anchor)}</h2>

        <div className="card px-4 divide-y divide-line/70">
          <Row l="Rendimentos recebidos" v={money(cur.income)} sub={ch(cur.income, prev.income) !== null && <Change v={ch(cur.income, prev.income)!} goodWhenUp suffix="vs anterior" />} />
          <Row l="Despesas pagas" v={money(cur.expenses)} sub={ch(cur.expenses, prev.expenses) !== null && <Change v={ch(cur.expenses, prev.expenses)!} suffix="vs anterior" />} />
          <Row l="Saldo líquido" v={money(cur.net)} sub={<span className="text-ink-muted">anterior: {money(prev.net)}</span>} />
          <Row l="Poupado" v={money(cur.saved)} sub={<span className="text-ink-muted">anterior: {money(prev.saved)}</span>} />
          <Row l="Enviado ao Heitor" v={money(cur.heitor)} />
          <Row l="Gastos fixos / variáveis" v={`${money(fv.fixed)} / ${money(fv.variable)}`} />
        </div>
        <div className="card px-4 divide-y divide-line/70">
          <p className="py-2.5 text-xs uppercase tracking-wide text-ink-muted font-semibold">Ainda não realizados</p>
          <Row l="Rendimentos previstos" v={money(cur.plannedIn)} />
          <Row l="Despesas previstas" v={money(cur.plannedOut)} />
          <Row l="Despesas pendentes" v={money(cur.pendingOut)} />
        </div>

        <div className="card p-4">
          <p className="font-semibold mb-2">Despesas por categoria</p>
          {cats.length === 0 ? <p className="text-sm text-ink-muted">Sem despesas.</p> : cats.map((c) => (
            <Link key={c.id} to={p === 'month' ? `/financas/movimentos?mes=${anchor}&categoria=${c.id}` : `/financas/movimentos?categoria=${c.id}`} className="flex text-sm py-1.5">
              <span className="flex-1">{c.name}</span><span className="tabular-nums font-medium">{money(c.total)}</span><span className="w-14 text-right text-ink-muted tabular-nums">{percent(c.share)}</span>
            </Link>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          <div className="card p-4"><p className="font-semibold mb-2">Rendimentos por pessoa</p>{incP.map((x) => <div key={x.id} className="flex text-sm py-1"><span className="flex-1">{x.name}</span><span className="tabular-nums">{money(x.total)}</span></div>)}</div>
          <div className="card p-4"><p className="font-semibold mb-2">Despesas pagas por pessoa</p>{expP.map((x) => <div key={x.id} className="flex text-sm py-1"><span className="flex-1">{x.name}</span><span className="tabular-nums">{money(x.total)}</span><span className="w-32 text-right text-xs text-ink-muted">partilh. {money(x.shared)}</span></div>)}</div>
        </div>
        {months.length > 1 && (
          <div className="card p-4 overflow-x-auto">
            <p className="font-semibold mb-2">Evolução do saldo</p>
            <table className="w-full text-sm"><thead><tr className="text-xs text-ink-muted text-right"><th className="text-left font-medium">Mês</th><th className="font-medium">Entradas</th><th className="font-medium">Saídas</th><th className="font-medium">Saldo</th><th className="font-medium">Poupado</th></tr></thead>
              <tbody className="divide-y divide-line/70">{cur.rows.map((r) => <tr key={r.month} className="text-right tabular-nums"><td className="text-left py-1.5">{fmtMonth(`${r.month}-01`)}</td><td>{money(r.income)}</td><td>{money(r.expenses)}</td><td className={r.net < 0 ? 'text-alert-ink' : ''}>{money(r.net)}</td><td>{money(r.saved)}</td></tr>)}</tbody></table>
          </div>
        )}
        {hRows.length > 0 && <div className="card p-4"><p className="font-semibold mb-1">Transferências para o Heitor</p><p className="text-sm text-ink-soft">{hRows.length} envio(s) · {money(hRows.reduce((s, x) => s + x.h.amount_eur, 0))} enviados · {money(hRows.reduce((s, x) => s + x.h.fees_eur, 0))} em taxas</p></div>}

        <div className="grid grid-cols-2 gap-3 print:hidden">
          <button className="btn-secondary" onClick={doExport}><Download size={18} />Excel</button>
          <button className="btn-secondary" onClick={() => window.print()}><Printer size={18} />PDF</button>
        </div>
        <p className="text-xs text-ink-muted px-1 print:hidden">PDF: abre a impressão do sistema — escolha “Guardar como PDF” (no iPhone: Partilhar › Imprimir › gesto de ampliar).</p>
        <p className="hidden print:block text-xs text-ink-muted mt-6">LAR. · relatório gerado em {new Date().toLocaleString('pt-PT')} · apenas valores realizados, salvo indicação.</p>
      </Page>
    </>
  )
}


