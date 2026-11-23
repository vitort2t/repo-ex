import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useHousehold } from '@/hooks/auth'
import { useBudgetStatus, useFinLookups, useInvalidateFinance, useTransactions } from '@/hooks/finance'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { fmtMonth, isoDate, money, parseDecimal, percent } from '@/lib/format'
import { expensesByCategory, type BudgetStatus } from '@/lib/finance'
import { CategorySelect } from '@/components/finance/MovementForm'
import { EmptyState, Field, NumberInput, Page, PageHeader, ProgressBar, Segmented, Sheet, Spinner, cx, useConfirm, useToast } from '@/components/ui'

export default function FinBudget() {
  const month = isoDate().slice(0, 7)
  const { data: status = [] } = useBudgetStatus(month)
  const { data: txs = [] } = useTransactions()
  const L = useFinLookups()
  const inv = useInvalidateFinance()
  const toast = useToast()
  const confirm = useConfirm()
  const { hid } = useHousehold()
  const [adding, setAdding] = useState(false)

  const label = (b: BudgetStatus) => b.scope === 'total' ? 'Orçamento familiar total' : b.scope === 'category' ? L.catName(b.category_id) : `Limite individual · ${L.personName(b.person_id)}`
  const sorted = [...status].sort((a, b) => (a.scope === 'total' ? -1 : b.scope === 'total' ? 1 : b.spent / b.amount - a.spent / a.amount))
  const actual = expensesByCategory(txs, [month], L.catMap)

  const remove = async (b: BudgetStatus) => {
    if (!(await confirm({ title: 'Remover este limite?', text: 'Deixa de valer a partir deste mês (os meses anteriores mantêm-se).', confirm: 'Remover', danger: true }))) return
    // Se o limite foi criado este mês, apaga-se; se vem de meses anteriores, grava-se 0 a partir deste mês (histórico intacto).
    const { data: row } = await supabase.from('fin_budgets').select('month').eq('id', b.budget_id).single()
    const { error } = row?.month === `${month}-01`
      ? await supabase.from('fin_budgets').delete().eq('id', b.budget_id)
      : await supabase.from('fin_budgets').insert({ household_id: hid, month: `${month}-01`, scope: b.scope, category_id: b.category_id, person_id: b.person_id, amount: 0 })
    if (error) return toast(friendlyError(error), 'alert')
    inv()
  }

  return (
    <>
      <PageHeader title="Orçamento familiar" subtitle={fmtMonth(`${month}-01`)} back="/financas"
        actions={<button aria-label="Novo limite" onClick={() => setAdding(true)} className="h-10 w-10 grid place-items-center rounded-full bg-navy-600 text-white"><Plus size={22} /></button>} />
      <Page>
        {sorted.length === 0 ? (
          <EmptyState title="Sem orçamento definido" text="Defina o orçamento familiar total e limites para alimentação, transportes, lazer, despesas com o Heitor ou para cada pessoa."
            action={<button className="btn-primary" onClick={() => setAdding(true)}>Definir orçamento</button>} />
        ) : (
          <div className="space-y-2.5">
            {sorted.map((b) => { const r = b.amount ? b.spent / b.amount : 0; return (
              <div key={b.budget_id} className={cx('card p-4 space-y-2', b.scope === 'total' && 'border-navy-100')}>
                <div className="flex items-start gap-2">
                  <p className={cx('flex-1', b.scope === 'total' ? 'font-bold' : 'font-semibold')}>{label(b)}</p>
                  <button aria-label="Remover limite" onClick={() => remove(b)} className="h-8 w-8 -mt-1 grid place-items-center rounded-full hover:bg-champagne text-ink-muted"><Trash2 size={15} /></button>
                </div>
                <ProgressBar value={r} />
                <div className="flex justify-between text-sm">
                  <span className="text-ink-soft">{money(b.spent)} de {money(b.amount)} · <b>{percent(r)}</b></span>
                  <span className={cx('font-semibold', b.amount - b.spent < 0 ? 'text-alert-ink' : 'text-ok-ink')}>{b.amount - b.spent >= 0 ? `Restam ${money(b.amount - b.spent)}` : `+${money(b.spent - b.amount)}`}</span>
                </div>
                {b.planned > 0 && <p className="text-xs text-ink-muted">Ainda previsto este mês: {money(b.planned)} → poderá chegar a {percent((b.spent + b.planned) / b.amount)}.</p>}
              </div>) })}
          </div>
        )}
        {actual.length > 0 && (
          <div className="card p-4">
            <p className="font-semibold mb-2">Gasto real por categoria (este mês)</p>
            {actual.map((c) => <div key={c.id} className="flex text-sm py-1"><span className="flex-1">{c.name}</span><span className="tabular-nums font-medium">{money(c.total)}</span></div>)}
          </div>
        )}
        <p className="text-xs text-ink-muted px-1">Alertas automáticos aos 50%, 75%, 90% e 100% (configuráveis em Despesas › Orçamento do supermercado). Só contam despesas efetivamente pagas.</p>
      </Page>
      {adding && <BudgetSheet onClose={() => setAdding(false)} />}
    </>
  )
}

function BudgetSheet({ onClose }: { onClose: () => void }) {
  const { hid, user } = useHousehold()
  const L = useFinLookups()
  const inv = useInvalidateFinance()
  const toast = useToast()
  const [scope, setScope] = useState<'total' | 'category' | 'person'>('total')
  const [cat, setCat] = useState('')
  const [person, setPerson] = useState('')
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const quick = (key: string) => { const c = L.cats.find((x) => x.system_key === key); if (c) { setScope('category'); setCat(c.id) } }
  const save = async () => {
    const a = parseDecimal(amount)
    if (a === null || a < 0) return toast('Indique o valor.', 'alert')
    if (scope === 'category' && !cat) return toast('Escolha a categoria.', 'alert')
    if (scope === 'person' && !person) return toast('Escolha a pessoa.', 'alert')
    setBusy(true)
    const month = `${isoDate().slice(0, 7)}-01`
    const match = supabase.from('fin_budgets').select('id').eq('household_id', hid).eq('month', month).eq('scope', scope)
    const { data: existing } = await (scope === 'category' ? match.eq('category_id', cat) : scope === 'person' ? match.eq('person_id', person) : match.is('category_id', null).is('person_id', null))
    const { error } = existing?.length
      ? await supabase.from('fin_budgets').update({ amount: a }).eq('id', existing[0].id)
      : await supabase.from('fin_budgets').insert({ household_id: hid, month, scope, category_id: scope === 'category' ? cat : null, person_id: scope === 'person' ? person : null, amount: a, created_by: user.id })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'alert')
    inv(); toast('Orçamento guardado (vale a partir deste mês).'); onClose()
  }
  return (
    <Sheet open onClose={onClose} title="Novo limite" footer={<div className="py-2"><button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Guardar'}</button></div>}>
      <Segmented value={scope} onChange={setScope} options={[{ value: 'total', label: 'Total' }, { value: 'category', label: 'Categoria' }, { value: 'person', label: 'Pessoa' }]} />
      {scope === 'category' && <>
        <div className="flex flex-wrap gap-2">{[['alimentacao', 'Alimentação'], ['transportes', 'Transportes'], ['lazer', 'Lazer'], ['heitor', 'Heitor']].map(([k, l]) => <button key={k} className="chip" onClick={() => quick(k)}>{l}</button>)}</div>
        <Field label="Categoria"><CategorySelect kind="expense" value={cat} onChange={setCat} cats={L.cats} /></Field>
      </>}
      {scope === 'person' && <Field label="Pessoa" hint="Conta as despesas individuais dessa pessoa."><select className="input" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">Escolher…</option>{L.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
      <Field label="Limite mensal (€)"><NumberInput value={amount} onChange={setAmount} placeholder="Ex.: 2000" /></Field>
      <p className="text-xs text-ink-muted">Aplica-se a este mês e aos seguintes, até ser alterado.</p>
    </Sheet>
  )
}
