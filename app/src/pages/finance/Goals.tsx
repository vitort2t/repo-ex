import { PiggyBank, Plus, Target } from 'lucide-react'
import { useState } from 'react'
import { useHousehold } from '@/hooks/auth'
import { useFinLookups, useGoals, useInvalidateFinance } from '@/hooks/finance'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { daysUntil, fmtDate, isoDate, money, parseDecimal, percent } from '@/lib/format'
import type { FinGoal } from '@/lib/finance'
import { useFinanceUI } from '@/components/finance/FinanceUI'
import { EmptyState, Field, NumberInput, Page, PageHeader, ProgressBar, Sheet, Spinner, useToast } from '@/components/ui'

export default function Goals() {
  const { data: goals = [] } = useGoals()
  const L = useFinLookups()
  const { openNew } = useFinanceUI()
  const [edit, setEdit] = useState<FinGoal | 'new' | null>(null)
  const active = goals.filter((g) => !g.archived)
  return (
    <>
      <PageHeader title="Os nossos objetivos" back="/financas"
        actions={<button aria-label="Novo objetivo" onClick={() => setEdit('new')} className="h-10 w-10 grid place-items-center rounded-full bg-navy-600 text-white"><Plus size={22} /></button>} />
      <Page>
        {active.length === 0 ? (
          <EmptyState icon={<Target />} title="Ainda não há objetivos" text="Ex.: fundo de emergência, viagens, mudança de casa, reserva familiar, compras importantes."
            action={<button className="btn-primary" onClick={() => setEdit('new')}>Criar objetivo</button>} />
        ) : active.map((g) => {
          const r = g.accumulated / g.target_amount
          const left = Math.max(0, g.target_amount - g.accumulated)
          const days = g.deadline ? daysUntil(g.deadline) : null
          const perMonth = days && days > 0 ? left / Math.max(1, days / 30.4) : null
          return (
            <div key={g.id} className="card p-4 space-y-3">
              <button className="w-full text-left" onClick={() => setEdit(g)}>
                <div className="flex items-baseline gap-2"><p className="font-bold flex-1">{g.name}</p><p className="text-sm font-semibold text-navy-600">{percent(Math.min(1, r))}</p></div>
                <p className="text-sm text-ink-soft"><b className="text-ink tabular-nums">{money(g.accumulated)}</b> de {money(g.target_amount)}{g.account_id ? ` · ${L.accountName(g.account_id)}` : ''}</p>
              </button>
              <ProgressBar value={r} tone="ok" />
              <div className="flex justify-between text-xs text-ink-muted">
                <span>{left > 0 ? `Faltam ${money(left)}` : 'Objetivo atingido 🎉'}</span>
                <span>{g.deadline ? `Prazo ${fmtDate(g.deadline)}${perMonth ? ` · ~${money(perMonth)}/mês` : ''}` : 'Sem prazo'}</span>
              </div>
              <button className="btn-secondary w-full h-10 text-sm" onClick={() => openNew('savings')}><PiggyBank size={16} />Reforçar poupança</button>
            </div>
          )
        })}
        <p className="text-xs text-ink-muted px-1">O valor acumulado soma o valor inicial e as transferências de poupança associadas ao objetivo. Poupar é mover dinheiro entre contas próprias — não é uma despesa.</p>
      </Page>
      {edit && <GoalSheet goal={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function GoalSheet({ goal, onClose }: { goal: FinGoal | null; onClose: () => void }) {
  const { hid } = useHousehold()
  const L = useFinLookups()
  const inv = useInvalidateFinance()
  const toast = useToast()
  const [name, setName] = useState(goal?.name ?? '')
  const [target, setTarget] = useState(goal ? String(goal.target_amount).replace('.', ',') : '')
  const [initial, setInitial] = useState(goal ? String(goal.initial_amount).replace('.', ',') : '')
  const [start, setStart] = useState(goal?.start_date ?? isoDate())
  const [deadline, setDeadline] = useState(goal?.deadline ?? '')
  const [acc, setAcc] = useState(goal?.account_id ?? L.accounts.find((a) => a.kind === 'savings')?.id ?? '')
  const [notes, setNotes] = useState(goal?.notes ?? '')
  const [busy, setBusy] = useState(false)
  const save = async (archive?: boolean) => {
    const t = parseDecimal(target)
    if (!name.trim()) return toast('Indique o nome.', 'alert')
    if (t === null || t <= 0) return toast('Indique o valor pretendido.', 'alert')
    setBusy(true)
    const row = { name: name.trim(), target_amount: t, initial_amount: parseDecimal(initial) ?? 0, start_date: start, deadline: deadline || null, account_id: acc || null, notes: notes.trim() || null }
    const { error } = goal
      ? await supabase.from('fin_goals').update(archive ? { archived: true } : row).eq('id', goal.id)
      : await supabase.from('fin_goals').insert({ ...row, household_id: hid })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'alert')
    inv(); onClose()
  }
  return (
    <Sheet open onClose={onClose} title={goal ? 'Editar objetivo' : 'Novo objetivo'}
      footer={<div className="py-2 space-y-2"><button className="btn-primary w-full" onClick={() => save()} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Guardar'}</button>{goal && <button className="btn-ghost w-full text-sm" onClick={() => save(true)}>Arquivar objetivo</button>}</div>}>
      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Fundo de emergência" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor pretendido (€)"><NumberInput value={target} onChange={setTarget} /></Field>
        <Field label="Já acumulado (€)" hint="Antes de usar o LAR."><NumberInput value={initial} onChange={setInitial} placeholder="0,00" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Início"><input type="date" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
        <Field label="Prazo"><input type="date" className="input" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
      </div>
      <Field label="Conta associada"><select className="input" value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">—</option>{L.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
      <Field label="Observações"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
    </Sheet>
  )
}
