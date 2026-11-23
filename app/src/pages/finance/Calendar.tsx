import { CalendarDays, Plus, Repeat } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useHousehold } from '@/hooks/auth'
import { useFinLookups, useInvalidateFinance, useRecurring, useTransactions } from '@/hooks/finance'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { daysUntil, fmtDate, isoDate, money, parseDecimal } from '@/lib/format'
import { FREQ_LABEL, nextOccurrences, type FinRecurring, type Frequency } from '@/lib/finance'
import { CategorySelect } from '@/components/finance/MovementForm'
import { useFinanceUI } from '@/components/finance/FinanceUI'
import { TxRow } from '@/components/finance/TxRow'
import { Badge, EmptyState, Field, NumberInput, Page, PageHeader, Segmented, Sheet, Spinner, useToast } from '@/components/ui'

export default function Calendar() {
  const { hid } = useHousehold()
  const { data: txs = [] } = useTransactions()
  const { data: rules = [] } = useRecurring()
  const L = useFinLookups()
  const inv = useInvalidateFinance()
  const { openDetail } = useFinanceUI()
  const [edit, setEdit] = useState<FinRecurring | 'new' | null>(null)

  // Garante que as ocorrências dos próximos 45 dias existem.
  useEffect(() => { supabase.rpc('fin_generate_recurring', { p_household: hid, p_horizon_days: 45 }).then(({ data }) => { if (data) inv() }) }, [hid]) // eslint-disable-line react-hooks/exhaustive-deps

  const upcoming = useMemo(() => txs.filter((t) => (t.status === 'planned' || t.status === 'pending') && t.date <= isoDate(new Date(Date.now() + 60 * 86400000)))
    .filter((t) => !(t.nature === 'transfer' && t.direction === 'in')).sort((a, b) => a.date.localeCompare(b.date)), [txs])
  const overdue = upcoming.filter((t) => t.date < isoDate())
  const groups = useMemo(() => {
    const m = new Map<string, typeof upcoming>()
    for (const t of upcoming.filter((x) => x.date >= isoDate())) m.set(t.date, [...(m.get(t.date) ?? []), t])
    return [...m.entries()]
  }, [upcoming])
  const outNext30 = upcoming.filter((t) => t.direction === 'out' && daysUntil(t.date) <= 30).reduce((s, t) => s + t.amount, 0)
  const inNext30 = upcoming.filter((t) => t.direction === 'in' && daysUntil(t.date) <= 30).reduce((s, t) => s + t.amount, 0)

  return (
    <>
      <PageHeader title="Calendário financeiro" back="/financas"
        actions={<button aria-label="Nova recorrência" onClick={() => setEdit('new')} className="h-10 w-10 grid place-items-center rounded-full bg-navy-600 text-white"><Plus size={22} /></button>} />
      <Page>
        <div className="card p-4 grid grid-cols-2 gap-2 text-center">
          <div><p className="text-lg font-bold tabular-nums text-wine-600">{money(outNext30)}</p><p className="text-[11px] text-ink-muted">A pagar (30 dias)</p></div>
          <div><p className="text-lg font-bold tabular-nums text-ok-ink">{money(inNext30)}</p><p className="text-[11px] text-ink-muted">A receber (30 dias)</p></div>
        </div>
        <p className="text-xs text-ink-muted px-1">Os valores previstos só contam como pagos/recebidos depois de os confirmar (toque no movimento → Confirmar).</p>

        {overdue.length > 0 && (
          <section className="space-y-2">
            <h2 className="section-title px-1 text-alert-ink">Em atraso</h2>
            <div className="card divide-y divide-line/70 overflow-hidden border-alert/30">{overdue.map((t) => <TxRow key={t.id} tx={t} onClick={() => openDetail(t)} />)}</div>
          </section>
        )}
        {groups.length === 0 && overdue.length === 0 ? (
          <EmptyState icon={<CalendarDays />} title="Sem pagamentos previstos" text="Registe as despesas fixas (renda, contas, seguros…) e os rendimentos recorrentes para os ver aqui com antecedência."
            action={<button className="btn-primary" onClick={() => setEdit('new')}>Nova despesa fixa</button>} />
        ) : groups.map(([d, list]) => (
          <section key={d} className="space-y-2">
            <div className="flex items-center px-1"><h2 className="section-title flex-1">{fmtDate(d)}</h2>{daysUntil(d) <= 3 && <Badge tone="warn">{daysUntil(d) === 0 ? 'Hoje' : `Em ${daysUntil(d)} dias`}</Badge>}</div>
            <div className="card divide-y divide-line/70 overflow-hidden">{list.map((t) => <TxRow key={t.id} tx={t} onClick={() => openDetail(t)} />)}</div>
          </section>
        ))}

        <section className="space-y-2">
          <h2 className="section-title px-1">Despesas e rendimentos fixos</h2>
          {rules.length === 0 ? <div className="card p-4 text-sm text-ink-muted">Ainda não há recorrências.</div> : (
            <div className="card divide-y divide-line/70">
              {rules.map((r) => (
                <button key={r.id} onClick={() => setEdit(r)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                  <span className="h-10 w-10 rounded-xl bg-navy-50 text-navy-600 grid place-items-center"><Repeat size={18} /></span>
                  <span className="flex-1 min-w-0"><span className="block font-medium truncate">{r.description}{!r.active && ' (pausada)'}</span>
                    <span className="block text-xs text-ink-muted truncate">{r.frequency === 'days' ? `A cada ${r.interval_n} dias` : r.interval_n > 1 ? `${FREQ_LABEL[r.frequency]} (a cada ${r.interval_n})` : FREQ_LABEL[r.frequency]} · próxima {fmtDate(r.next_due)} · {L.catName(r.category_id)}</span></span>
                  <span className={r.type === 'income' ? 'font-semibold text-ok-ink tabular-nums' : 'font-semibold tabular-nums'}>{r.type === 'income' ? '+' : '−'}{money(r.amount)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </Page>
      {edit && <RecurringSheet rule={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function RecurringSheet({ rule, onClose }: { rule: FinRecurring | null; onClose: () => void }) {
  const { hid, user } = useHousehold()
  const L = useFinLookups()
  const inv = useInvalidateFinance()
  const toast = useToast()
  const [type, setType] = useState<'income' | 'expense'>(rule?.type ?? 'expense')
  const [desc, setDesc] = useState(rule?.description ?? '')
  const [amount, setAmount] = useState(rule ? String(rule.amount).replace('.', ',') : '')
  const [cat, setCat] = useState(rule?.category_id ?? '')
  const [acc, setAcc] = useState(rule?.account_id ?? '')
  const [person, setPerson] = useState(rule?.person_id ?? L.me?.id ?? '')
  const [freq, setFreq] = useState<Frequency>(rule?.frequency ?? 'monthly')
  const [every, setEvery] = useState(String(rule?.interval_n ?? 1))
  const [next, setNext] = useState(rule?.next_due ?? isoDate())
  const [end, setEnd] = useState(rule?.end_date ?? '')
  const [active, setActive] = useState(rule?.active ?? true)
  const [busy, setBusy] = useState(false)
  const preview = nextOccurrences({ next_due: next, frequency: freq, interval_n: Math.max(1, Number(every) || 1), end_date: end || null }, 4)

  const save = async () => {
    const a = parseDecimal(amount)
    if (!desc.trim()) return toast('Indique a descrição.', 'alert')
    if (a === null || a <= 0) return toast('Indique o valor previsto.', 'alert')
    setBusy(true)
    const row = { description: desc.trim(), amount: a, category_id: cat || null, account_id: acc || null, person_id: person || null,
                  frequency: freq, interval_n: Math.max(1, Number(every) || 1), next_due: next, end_date: end || null, active }
    const { error } = rule
      ? await supabase.from('fin_recurring').update(row).eq('id', rule.id)
      : await supabase.from('fin_recurring').insert({ ...row, type, household_id: hid, created_by: user.id })
    if (!error) await supabase.rpc('fin_generate_recurring', { p_household: hid, p_horizon_days: 45 })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'alert')
    inv(); toast('Guardado. As próximas ocorrências ficam previstas no calendário.'); onClose()
  }

  return (
    <Sheet open onClose={onClose} title={rule ? 'Editar recorrência' : 'Nova despesa ou rendimento fixo'}
      footer={<div className="py-2"><button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Guardar'}</button></div>}>
      {!rule && <Segmented value={type} onChange={(v) => { setType(v); setCat('') }} options={[{ value: 'expense', label: 'Despesa' }, { value: 'income', label: 'Rendimento' }]} />}
      <Field label="Descrição"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ex.: Renda, Internet, Salário" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor previsto (€)"><NumberInput value={amount} onChange={setAmount} /></Field>
        <Field label="Próximo vencimento"><input type="date" className="input" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Periodicidade"><select className="input" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>{(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}</select></Field>
        <Field label={freq === 'days' ? 'Número de dias' : 'A cada'}><NumberInput value={every} onChange={setEvery} decimals={false} /></Field>
      </div>
      <Field label="Categoria"><CategorySelect kind={rule?.type ?? type} value={cat} onChange={setCat} cats={L.cats} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Conta de pagamento"><select className="input" value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">—</option>{L.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        <Field label="Pessoa"><select className="input" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">—</option>{L.people.filter((p) => p.kind === 'member').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      </div>
      <Field label="Termina em (opcional)"><input type="date" className="input" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
      {rule && <label className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[#14263D]" checked={active} onChange={(e) => setActive(e.target.checked)} /><span>Ativa</span></label>}
      <p className="text-xs text-ink-muted">Próximas datas: {preview.map((d) => fmtDate(d)).join(' · ') || '—'}</p>
    </Sheet>
  )
}
