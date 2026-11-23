import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Globe2, Paperclip, PiggyBank } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useHousehold } from '@/hooks/auth'
import { useCreateMovement, useFinLookups, useGoals, useHeitorTransfers, useInvalidateFinance } from '@/hooks/finance'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { isoDate, parseDecimal } from '@/lib/format'
import { FREQ_LABEL, moneyBRL, type FinCategory, type FinTx, type Frequency } from '@/lib/finance'
import { Field, NumberInput, Segmented, Sheet, Spinner, cx, useToast } from '../ui'

export type MovementType = 'income' | 'expense' | 'transfer' | 'heitor' | 'savings'

export const TYPE_META: Record<MovementType, { label: string; icon: typeof ArrowUpRight; tone: string }> = {
  income: { label: 'Nova entrada', icon: ArrowDownLeft, tone: 'bg-ok-bg text-ok-ink' },
  expense: { label: 'Nova despesa', icon: ArrowUpRight, tone: 'bg-wine-50 text-wine-600' },
  transfer: { label: 'Transferência entre contas', icon: ArrowLeftRight, tone: 'bg-navy-50 text-navy-600' },
  heitor: { label: 'Envio de dinheiro ao Heitor', icon: Globe2, tone: 'bg-plum-50 text-plum-600' },
  savings: { label: 'Movimento de poupança', icon: PiggyBank, tone: 'bg-champagne text-taupe-dark' },
}

/** Escolha do tipo de movimento ("+ NOVO MOVIMENTO"). */
export function NewMovementMenu({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (t: MovementType) => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Novo movimento">
      <div className="grid gap-2">
        {(Object.keys(TYPE_META) as MovementType[]).map((t) => {
          const M = TYPE_META[t]
          return (
            <button key={t} onClick={() => onPick(t)} className="flex items-center gap-3 p-3.5 rounded-2xl border border-line hover:bg-base text-left active:scale-[.99] transition">
              <span className={cx('h-11 w-11 rounded-xl grid place-items-center', M.tone)}><M.icon size={21} strokeWidth={1.8} /></span>
              <span className="font-semibold">{M.label}</span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

export function CategorySelect({ kind, value, onChange, cats }: { kind: FinCategory['kind']; value: string; onChange: (v: string) => void; cats: FinCategory[] }) {
  const roots = cats.filter((c) => c.kind === kind && !c.parent_id && !c.archived)
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Sem categoria</option>
      {roots.map((r) => {
        const subs = cats.filter((c) => c.parent_id === r.id && !c.archived)
        return subs.length
          ? <optgroup key={r.id} label={r.name}><option value={r.id}>{r.name} (geral)</option>{subs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
          : <option key={r.id} value={r.id}>{r.name}</option>
      })}
    </select>
  )
}

const today = () => isoDate()
function Row({ children }: { children: ReactNode }) { return <div className="grid grid-cols-2 gap-3">{children}</div> }

/** Formulário de movimento: criação (todos os tipos) e edição. */
export function MovementForm({ type, edit, onClose }: { type: MovementType | null; edit?: FinTx | null; onClose: () => void }) {
  const { hid } = useHousehold()
  const L = useFinLookups()
  const { data: goals = [] } = useGoals()
  const { data: heitorRows = [] } = useHeitorTransfers()
  const create = useCreateMovement()
  const invalidate = useInvalidateFinance()
  const toast = useToast()
  const clientId = useRef(crypto.randomUUID())
  const t: MovementType | null = edit
    ? edit.nature === 'transfer' ? (edit.transfer_kind === 'savings' ? 'savings' : 'transfer')
      : heitorRows.some((h) => h.transaction_id === edit.id) ? 'heitor' : edit.nature
    : type

  const [amount, setAmount] = useState('')
  const [desc, setDesc] = useState('')
  const [date, setDate] = useState(today())
  const [cat, setCat] = useState('')
  const [acc, setAcc] = useState('')
  const [toAcc, setToAcc] = useState('')
  const [status, setStatus] = useState<'done' | 'planned' | 'pending'>('done')
  const [person, setPerson] = useState('')
  const [benef, setBenef] = useState('')
  const [scope, setScope] = useState<'shared' | 'individual'>('shared')
  const [method, setMethod] = useState('')
  const [notes, setNotes] = useState('')
  const [goal, setGoal] = useState('')
  const [proof, setProof] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [more, setMore] = useState(false)
  const [repeat, setRepeat] = useState(false)
  const [freq, setFreq] = useState<Frequency>('monthly')
  const [every, setEvery] = useState('1')
  // Heitor
  const [eur, setEur] = useState('')
  const [brl, setBrl] = useState('')
  const [rate, setRate] = useState('')
  const [fees, setFees] = useState('')
  const [service, setService] = useState('')
  const [purpose, setPurpose] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    clientId.current = crypto.randomUUID()
    if (edit) {
      setAmount(String(edit.amount).replace('.', ',')); setDesc(edit.description); setDate(edit.date); setCat(edit.category_id ?? '')
      setAcc(edit.account_id ?? ''); setStatus(edit.status === 'cancelled' ? 'done' : edit.status); setPerson(edit.person_id ?? '')
      setBenef(edit.beneficiary_id ?? ''); setScope(edit.scope); setMethod(edit.payment_method ?? ''); setNotes(edit.notes ?? ''); setGoal(edit.goal_id ?? '')
      setProof(edit.proof_path); setMore(false)
      const h = heitorRows.find((x) => x.transaction_id === edit.id)
      if (h) { setEur(String(h.amount_eur).replace('.', ',')); setBrl(h.amount_brl === null ? '' : String(h.amount_brl).replace('.', ',')); setRate(h.fx_rate === null ? '' : String(h.fx_rate).replace('.', ',')); setFees(String(h.fees_eur).replace('.', ',')); setService(h.service ?? ''); setPurpose(h.purpose ?? '') }
    } else if (type) {
      setAmount(''); setDesc(''); setDate(today()); setCat(''); setStatus('done'); setNotes(''); setProof(null); setRepeat(false); setMore(false)
      setPerson(L.me?.id ?? ''); setBenef(type === 'heitor' ? L.heitor?.id ?? '' : ''); setScope('shared'); setMethod(''); setGoal('')
      setEur(''); setBrl(''); setRate(''); setFees(''); setService(''); setPurpose('')
      const active = L.accounts.filter((a) => !a.archived && a.currency === 'EUR')
      const mine = active.find((a) => a.owner_person_id === L.me?.id && a.kind === 'bank') ?? active.find((a) => a.kind === 'bank')
      setAcc(mine?.id ?? ''); setToAcc(type === 'savings' ? active.find((a) => a.kind === 'savings')?.id ?? '' : '')
    }
  }, [type, edit]) // eslint-disable-line react-hooks/exhaustive-deps

  const accounts = L.accounts.filter((a) => !a.archived || a.id === acc)
  const members = L.people.filter((p) => p.kind === 'member' && !p.archived)
  const isTransfer = t === 'transfer' || t === 'savings'
  const heitorPreview = useMemo(() => {
    const e = parseDecimal(eur), b = parseDecimal(brl), r = parseDecimal(rate)
    if (e && b && !r) return `Taxa efetiva: ${(b / e).toFixed(4).replace('.', ',')} BRL/EUR`
    if (e && r && !b) return `Valor estimado no Brasil: ${moneyBRL(e * r)}`
    return null
  }, [eur, brl, rate])

  if (!t) return null
  const meta = TYPE_META[t]
  const locked = !!edit?.purchase_id

  const uploadProof = async (file: File) => {
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
      const path = `${hid}/comprovativos/${crypto.randomUUID()}.${ext}`
      const { error } = await supabase.storage.from('finance-docs').upload(path, file, { contentType: file.type || undefined })
      if (error) throw error
      setProof(path)
    } catch (e) { toast(friendlyError(e), 'alert') } finally { setUploading(false) }
  }

  const submit = async () => {
    const value = parseDecimal(amount)
    if (t !== 'heitor' && !locked && (value === null || value <= 0)) return toast('Indique o valor.', 'alert')
    if (t === 'heitor' && !(parseDecimal(eur)! > 0)) return toast('Indique o valor enviado em euros.', 'alert')
    if (isTransfer && !edit && (!acc || !toAcc)) return toast('Escolha a conta de origem e a de destino.', 'alert')
    if (status === 'done' && date > today()) return toast('Um valor com data futura só pode ficar “previsto”.', 'alert')
    const description = desc.trim() || (t === 'savings' ? 'Poupança' : t === 'transfer' ? 'Transferência entre contas' : t === 'heitor' ? 'Envio para o Heitor' : '')
    if (!description) return toast('Indique uma descrição.', 'alert')
    const heitor = t === 'heitor' ? { amount_eur: parseDecimal(eur), amount_brl: parseDecimal(brl), fx_rate: parseDecimal(rate), fees_eur: parseDecimal(fees) ?? 0, service, purpose } : undefined
    setBusy(true)
    try {
      if (edit) {
        const payload: Record<string, unknown> = locked
          ? { category_id: cat || null, account_id: acc || null, person_id: person || null, scope, payment_method: method, notes }
          : { amount: value, date, description, status, notes, ...(isTransfer ? { goal_id: goal || null } : {
              category_id: cat || null, account_id: acc || null, person_id: person || null, beneficiary_id: benef || null, scope, payment_method: method, proof_path: proof ?? '' }),
              ...(heitor ? { heitor } : {}) }
        const { error } = await supabase.rpc('fin_update_movement', { p_id: edit.id, p_payload: payload })
        if (error) throw error
        invalidate()
        toast('Movimento atualizado.')
      } else {
        let recurringId: string | null = null
        if (repeat && (t === 'income' || t === 'expense')) {
          const n = Math.max(1, Number(every) || 1)
          const { nextOccurrences } = await import('@/lib/finance')
          const next = nextOccurrences({ next_due: date, frequency: freq, interval_n: n, end_date: null }, 2)[1]
          const { data: rec, error } = await supabase.from('fin_recurring').insert({
            household_id: hid, type: t, description, amount: value, category_id: cat || null, account_id: acc || null,
            person_id: person || null, beneficiary_id: benef || null, frequency: freq, interval_n: n, next_due: next,
          }).select('id').single()
          if (error) throw error
          recurringId = rec.id
        }
        await create.mutateAsync({ clientId: clientId.current, payload: {
          type: t, status, amount: value, date, description, category_id: cat || null, account_id: acc || null, to_account_id: toAcc || null,
          person_id: person || null, beneficiary_id: benef || null, scope, payment_method: method, notes, proof_path: proof,
          goal_id: goal || null, recurring_id: recurringId, heitor,
        } })
        if (recurringId) await supabase.rpc('fin_generate_recurring', { p_household: hid, p_horizon_days: 45 })
        invalidate()
        toast(status === 'done' ? 'Movimento registado.' : 'Movimento previsto registado.')
      }
      onClose()
    } catch (e) { toast(friendlyError(e), 'alert') } finally { setBusy(false) }
  }

  return (
    <Sheet open onClose={onClose} title={<span className="flex items-center gap-2.5"><span className={cx('h-8 w-8 rounded-lg grid place-items-center', meta.tone)}><meta.icon size={17} /></span>{edit ? 'Editar movimento' : meta.label}</span>}
      footer={<div className="py-2"><button className={cx('w-full', t === 'expense' || t === 'heitor' ? 'btn-accent' : 'btn-primary')} onClick={submit} disabled={busy || uploading}>{busy ? <Spinner className="text-white" /> : edit ? 'Guardar alterações' : 'Registar'}</button></div>}>
      {locked && <p className="text-sm bg-champagne rounded-xl px-3.5 py-2.5 text-ink-soft">Este movimento vem de uma fatura de supermercado. O valor e a data corrigem-se na compra (Despesas › compra). Aqui pode indicar a conta, quem pagou e a categoria.</p>}

      {t === 'heitor' ? (
        <>
          <Row>
            <Field label="Enviado (€)"><NumberInput value={eur} onChange={setEur} placeholder="0,00" autoFocus={!edit} /></Field>
            <Field label="Recebido no Brasil (R$)"><NumberInput value={brl} onChange={setBrl} placeholder="0,00" /></Field>
          </Row>
          <Row>
            <Field label="Taxa de câmbio (R$ por €)" hint="Se vazio, calculada a partir dos valores."><NumberInput value={rate} onChange={setRate} placeholder="ex.: 5,90" /></Field>
            <Field label="Taxas e comissões (€)"><NumberInput value={fees} onChange={setFees} placeholder="0,00" /></Field>
          </Row>
          {heitorPreview && <p className="text-xs text-plum-600 -mt-2">{heitorPreview}</p>}
          <Row>
            <Field label="Serviço"><input className="input" list="services" value={service} onChange={(e) => setService(e.target.value)} placeholder="Wise, Remitly…" /><datalist id="services">{['Wise', 'Remitly', 'Western Union', 'Transferência bancária', 'Revolut'].map((s) => <option key={s} value={s} />)}</datalist></Field>
            <Field label="Finalidade"><input className="input" list="purposes" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Escola, mensalidade…" /><datalist id="purposes">{['Mensalidade', 'Escola', 'Material escolar', 'Vestuário', 'Saúde', 'Outros'].map((s) => <option key={s} value={s} />)}</datalist></Field>
          </Row>
        </>
      ) : (
        <Field label={t === 'income' ? 'Valor recebido (€)' : 'Valor (€)'}>
          <NumberInput value={amount} onChange={setAmount} placeholder="0,00" className="h-14 text-2xl font-bold" autoFocus={!edit} />
        </Field>
      )}

      {!locked && <Field label="Descrição"><input className="input" value={desc} onChange={(e) => setDesc(e.target.value)}
        placeholder={t === 'income' ? 'Ex.: Salário de novembro' : t === 'expense' ? 'Ex.: Eletricidade' : t === 'heitor' ? 'Envio para o Heitor' : 'Ex.: Poupança do mês'} /></Field>}

      {(t === 'income' || t === 'expense') && <Field label="Categoria"><CategorySelect kind={t} value={cat} onChange={setCat} cats={L.cats} /></Field>}

      {isTransfer ? (
        !edit && <Row>
          <Field label="Da conta"><select className="input" value={acc} onChange={(e) => setAcc(e.target.value)}><option value="">Escolher…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Para a conta"><select className="input" value={toAcc} onChange={(e) => setToAcc(e.target.value)}><option value="">Escolher…</option>{accounts.filter((a) => a.id !== acc && (t !== 'savings' || a.kind === 'savings')).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
        </Row>
      ) : (
        <Field label={t === 'income' ? 'Conta de destino' : 'Conta de origem'}>
          <select className="input" value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="">Sem conta associada</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.currency !== 'EUR' ? ` (${a.currency})` : ''}</option>)}
          </select>
        </Field>
      )}
      {isTransfer && !edit && L.accounts.length < 2 && <p className="text-xs text-warn-ink -mt-2">Crie primeiro as contas em Finanças › As nossas contas.</p>}
      {t === 'savings' && !edit && !L.accounts.some((a) => a.kind === 'savings') && <p className="text-xs text-warn-ink -mt-2">Ainda não existe nenhuma conta do tipo “Poupança”.</p>}

      {!locked && <Row>
        <Field label="Data"><input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Estado">
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            <option value="done">{t === 'income' ? 'Recebido' : t === 'expense' || t === 'heitor' ? 'Pago' : 'Realizado'}</option>
            <option value="planned">Previsto</option>
            {!isTransfer && <option value="pending">Pendente</option>}
          </select>
        </Field>
      </Row>}

      {(t === 'savings' || (isTransfer && goals.length > 0)) && (
        <Field label="Objetivo (opcional)"><select className="input" value={goal} onChange={(e) => setGoal(e.target.value)}><option value="">—</option>{goals.filter((g) => !g.archived).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></Field>
      )}

      {!isTransfer && (
        <>
          <button type="button" className="text-sm font-semibold text-navy-600" onClick={() => setMore((v) => !v)}>{more ? 'Menos detalhes' : 'Mais detalhes (pessoa, beneficiário, comprovativo…)'}</button>
          {more && (
            <div className="space-y-4">
              <Row>
                <Field label={t === 'income' ? 'Quem recebeu' : 'Quem pagou'}><select className="input" value={person} onChange={(e) => setPerson(e.target.value)}><option value="">—</option>{members.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                {t !== 'income'
                  ? <Field label="Beneficiário"><select className="input" value={benef} onChange={(e) => setBenef(e.target.value)}><option value="">Família</option>{L.people.filter((p) => !p.archived).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
                  : <Field label="Origem"><input className="input" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Empresa, cliente…" /></Field>}
              </Row>
              {t !== 'income' && <>
                <div><span className="label">Tipo de despesa</span><Segmented value={scope} onChange={setScope} options={[{ value: 'shared', label: 'Partilhada' }, { value: 'individual', label: 'Individual' }]} /></div>
                {!locked && t === 'expense' && <Field label="Método de pagamento"><input className="input" list="methods" value={method} onChange={(e) => setMethod(e.target.value)} placeholder="Cartão, MB Way…" /><datalist id="methods">{['Cartão de débito', 'Cartão de crédito', 'MB Way', 'Transferência', 'Débito direto', 'Numerário'].map((m) => <option key={m} value={m} />)}</datalist></Field>}
              </>}
              <Field label="Observações"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              {!locked && <label className="flex items-center gap-3 cursor-pointer">
                <span className="h-11 w-11 rounded-xl bg-champagne grid place-items-center">{uploading ? <Spinner size={18} /> : <Paperclip size={18} />}</span>
                <span className="text-sm flex-1">{proof ? 'Comprovativo anexado ✓' : 'Anexar comprovativo (foto ou PDF)'}</span>
                <input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadProof(e.target.files[0])} />
              </label>}
              {!edit && (t === 'income' || t === 'expense') && (
                <div className="rounded-2xl border border-line p-3 space-y-3">
                  <label className="flex items-center gap-3"><input type="checkbox" className="h-5 w-5 accent-[#14263D]" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} /><span className="text-[15px]">Repete-se (despesa/rendimento fixo)</span></label>
                  {repeat && <Row>
                    <select className="input" value={freq} onChange={(e) => setFreq(e.target.value as Frequency)}>{(Object.keys(FREQ_LABEL) as Frequency[]).map((f) => <option key={f} value={f}>{FREQ_LABEL[f]}</option>)}</select>
                    <NumberInput value={every} onChange={setEvery} decimals={false} ariaLabel={freq === 'days' ? 'Número de dias' : 'Intervalo'} placeholder={freq === 'days' ? 'dias' : 'a cada'} />
                  </Row>}
                  {repeat && <p className="text-xs text-ink-muted">As próximas ocorrências ficam “previstas” no calendário até as confirmar.</p>}
                </div>
              )}
            </div>
          )}
        </>
      )}
      {isTransfer && <p className="text-xs text-ink-muted">Transferências entre contas próprias não contam como rendimento nem como despesa.{t === 'savings' ? ' Ficam registadas como poupança.' : ''}</p>}
    </Sheet>
  )
}
