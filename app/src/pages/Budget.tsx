import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth, useHousehold } from '@/hooks/auth'
import { budgetForMonth, keys, useBudgets, usePurchases } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { fmtMonth, isoDate, money, parseDecimal, percent } from '@/lib/format'
import { addMonths, monthStart } from '@/lib/stats'
import { Field, NumberInput, Page, PageHeader, ProgressBar, Spinner, cx, useToast } from '@/components/ui'

const THRESHOLDS = [50, 75, 90, 100]

export default function Budget() {
  const { hid, household, user } = useHousehold()
  const { refresh } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: budgets } = useBudgets()
  const { data: purchases = [] } = usePurchases()
  const month = isoDate(monthStart(new Date()))
  const current = budgetForMonth(budgets, month)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [thresholds, setThresholds] = useState<number[]>(household.budget_alert_thresholds ?? THRESHOLDS)

  const spentIn = (m: string) => purchases.filter((p) => p.status === 'confirmed' && p.purchased_at.startsWith(m.slice(0, 7))).reduce((s, p) => s + p.total_paid, 0)
  const spent = spentIn(month)
  const history = useMemo(() => Array.from({ length: 6 }, (_, i) => isoDate(addMonths(new Date(), -i)))
    .map((m) => ({ m, budget: budgetForMonth(budgets, m), spent: purchases.filter((p) => p.status === 'confirmed' && p.purchased_at.startsWith(m.slice(0, 7))).reduce((s, p) => s + p.total_paid, 0) })), [budgets, purchases])

  const save = async () => {
    const v = parseDecimal(amount)
    if (v === null || v < 0) return toast('Indique um valor válido.', 'alert')
    setBusy(true)
    const { error } = await supabase.from('monthly_budgets').upsert({ household_id: hid, month, amount: v, created_by: user.id }, { onConflict: 'household_id,month' })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'alert')
    setAmount('')
    qc.invalidateQueries({ queryKey: keys.budgets(hid) })
    toast('Orçamento guardado.')
  }

  const saveThresholds = async (t: number[]) => {
    setThresholds(t)
    const { error } = await supabase.from('households').update({ budget_alert_thresholds: t }).eq('id', hid)
    if (error) return toast(friendlyError(error), 'alert')
    await refresh()
  }

  const ratio = current ? spent / current : 0
  return (
    <>
      <PageHeader title="Orçamento mensal" subtitle={fmtMonth(month)} back />
      <Page>
        <div className="card p-5 space-y-4">
          {current === null ? (
            <p className="text-ink-soft">Ainda não definiu um orçamento. Defina um limite mensal para acompanhar os gastos e receber alertas.</p>
          ) : (<>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><p className="text-lg font-bold tabular-nums">{money(current)}</p><p className="text-xs text-ink-muted">Orçamento</p></div>
              <div><p className="text-lg font-bold tabular-nums">{money(spent)}</p><p className="text-xs text-ink-muted">Gasto</p></div>
              <div><p className={cx('text-lg font-bold tabular-nums', current - spent < 0 ? 'text-alert-ink' : 'text-sage-700')}>{money(current - spent)}</p><p className="text-xs text-ink-muted">Restante</p></div>
            </div>
            <ProgressBar value={ratio} />
            <p className="text-sm text-center text-ink-soft">{percent(ratio)} utilizado</p>
          </>)}
        </div>

        <div className="card p-4 space-y-3">
          <Field label={current === null ? 'Definir orçamento mensal (€)' : 'Alterar orçamento (€)'} hint="Aplica-se a este mês e aos seguintes, até voltar a alterar.">
            <NumberInput value={amount} onChange={setAmount} placeholder={current ? String(current).replace('.', ',') : 'Ex.: 400'} />
          </Field>
          <button className="btn-primary w-full" onClick={save} disabled={busy || !amount}>{busy ? <Spinner className="text-white" /> : 'Guardar orçamento'}</button>
        </div>

        <div className="card p-4 space-y-3">
          <p className="font-semibold">Alertas</p>
          <p className="text-sm text-ink-muted">Receber um aviso quando atingirem:</p>
          <div className="flex flex-wrap gap-2">
            {THRESHOLDS.map((t) => {
              const on = thresholds.includes(t)
              return <button key={t} className={cx('chip', on && 'chip-active')} onClick={() => saveThresholds(on ? thresholds.filter((x) => x !== t) : [...thresholds, t].sort((a, b) => a - b))}>{t === 100 ? 'Ultrapassar 100%' : `${t}%`}</button>
            })}
          </div>
        </div>

        <section className="space-y-2">
          <h2 className="section-title px-1">Últimos meses</h2>
          <div className="card divide-y divide-line/70">
            {history.map((h) => (
              <div key={h.m} className="px-4 py-3 space-y-1.5">
                <div className="flex text-sm"><span className="flex-1 font-medium">{fmtMonth(h.m)}</span>
                  <span className="tabular-nums">{money(h.spent)}{h.budget !== null && <span className="text-ink-muted"> / {money(h.budget)}</span>}</span></div>
                {h.budget !== null && h.budget > 0 && <ProgressBar value={h.spent / h.budget} />}
              </div>
            ))}
          </div>
        </section>
        <p className="text-xs text-ink-muted px-1">Os valores usam apenas compras confirmadas; compras anuladas não contam. {spentIn(month) === 0 && 'Ainda não há compras este mês.'}</p>
      </Page>
    </>
  )
}
