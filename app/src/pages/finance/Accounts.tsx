import { ArrowLeftRight, Banknote, CreditCard, Landmark, Pencil, PiggyBank, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useHousehold } from '@/hooks/auth'
import { useBalances, useFinLookups, useInvalidateFinance } from '@/hooks/finance'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { isoDate, parseDecimal } from '@/lib/format'
import { ACCOUNT_KIND_LABEL, consolidate, moneyCur, type AccountKind, type FinAccount } from '@/lib/finance'
import { useFinanceUI } from '@/components/finance/FinanceUI'
import { EmptyState, Field, NumberInput, Page, PageHeader, Sheet, Spinner, cx, useToast } from '@/components/ui'

const ICON: Record<AccountKind, typeof Landmark> = { bank: Landmark, cash: Banknote, savings: PiggyBank, credit_card: CreditCard }

export default function Accounts() {
  const { data: balances = [] } = useBalances()
  const L = useFinLookups()
  const { openNew } = useFinanceUI()
  const [edit, setEdit] = useState<FinAccount | 'new' | null>(null)
  const c = consolidate(balances)
  const active = balances.filter((b) => !b.archived)
  const archived = balances.filter((b) => b.archived)

  return (
    <>
      <PageHeader title="As nossas contas" back="/financas"
        actions={<button aria-label="Nova conta" onClick={() => setEdit('new')} className="h-10 w-10 grid place-items-center rounded-full bg-navy-600 text-white"><Plus size={22} /></button>} />
      <Page>
        <div className="card p-4 space-y-3">
          <div className="flex items-end justify-between">
            <div><p className="text-xs uppercase tracking-wide text-ink-muted font-semibold">Saldo familiar consolidado</p><p className="text-[28px] font-bold tabular-nums">{moneyCur(c.real)}</p></div>
            {c.byCurrency.BRL !== undefined && <p className="text-sm text-ink-soft text-right">+ {moneyCur(c.byCurrency.BRL, 'BRL')}<br /><span className="text-xs text-ink-muted">em reais</span></p>}
          </div>
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="rounded-xl bg-base py-2"><p className="font-bold tabular-nums">{moneyCur(c.available)}</p><p className="text-[11px] text-ink-muted">Disponível</p></div>
            <div className="rounded-xl bg-base py-2"><p className="font-bold tabular-nums text-warn-ink">{moneyCur(c.pending)}</p><p className="text-[11px] text-ink-muted">Por pagar (mês)</p></div>
            <div className="rounded-xl bg-base py-2"><p className="font-bold tabular-nums text-navy-600">{moneyCur(c.reserved)}</p><p className="text-[11px] text-ink-muted">Reservado</p></div>
          </div>
          <p className="text-xs text-ink-muted">Disponível = saldo das contas à ordem e numerário − valores reservados − despesas previstas/pendentes do mês. Poupanças contam como reservadas. Cartões de crédito entram com o valor em dívida.</p>
        </div>
        <button className="btn-secondary w-full" onClick={() => openNew('transfer')}><ArrowLeftRight size={18} />Transferência entre contas</button>

        {active.length === 0 ? (
          <EmptyState icon={<Landmark />} title="Ainda não há contas" text="Registe a conta de cada um, a conta conjunta (se existir), o numerário, as poupanças e os cartões de crédito."
            action={<button className="btn-primary" onClick={() => setEdit('new')}>Criar conta</button>} />
        ) : (
          <div className="card divide-y divide-line/70 overflow-hidden">
            {active.map((b) => { const I = ICON[b.kind]; const acc = L.accounts.find((a) => a.id === b.id); return (
              <div key={b.id} className="flex items-center gap-3 px-4 py-3">
                <Link to={`/financas/movimentos?conta=${b.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <span className={cx('h-10 w-10 rounded-xl grid place-items-center shrink-0', b.kind === 'savings' ? 'bg-champagne text-taupe-dark' : 'bg-navy-50 text-navy-600')}><I size={19} strokeWidth={1.8} /></span>
                  <span className="min-w-0">
                    <span className="block font-semibold truncate">{b.name}</span>
                    <span className="block text-xs text-ink-muted truncate">{ACCOUNT_KIND_LABEL[b.kind]} · {b.owner_person_id ? L.personName(b.owner_person_id) : 'Conjunta'}{b.institution ? ` · ${b.institution}` : ''}</span>
                  </span>
                </Link>
                <span className="text-right">
                  <span className={cx('block font-bold tabular-nums', b.balance < 0 && 'text-alert-ink')}>{moneyCur(b.balance, b.currency)}</span>
                  {(b.pending_out > 0 || b.reserved_amount > 0) && <span className="block text-[11px] text-ink-muted">{[b.pending_out > 0 ? `−${moneyCur(b.pending_out, b.currency)} previsto` : '', b.reserved_amount > 0 ? `${moneyCur(b.reserved_amount, b.currency)} reservado` : ''].filter(Boolean).join(' · ')}</span>}
                </span>
                <button aria-label="Editar conta" onClick={() => acc && setEdit(acc)} className="h-9 w-9 grid place-items-center rounded-full hover:bg-champagne text-ink-muted"><Pencil size={16} /></button>
              </div>) })}
          </div>
        )}
        {archived.length > 0 && <p className="text-xs text-ink-muted px-1">{archived.length} conta(s) arquivada(s): {archived.map((a) => a.name).join(', ')}.</p>}
      </Page>
      {edit && <AccountSheet account={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  )
}

function AccountSheet({ account, onClose }: { account: FinAccount | null; onClose: () => void }) {
  const { hid } = useHousehold()
  const L = useFinLookups()
  const inv = useInvalidateFinance()
  const toast = useToast()
  const [name, setName] = useState(account?.name ?? '')
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'bank')
  const [owner, setOwner] = useState(account?.owner_person_id ?? L.me?.id ?? '')
  const [inst, setInst] = useState(account?.institution ?? '')
  const [currency, setCurrency] = useState<'EUR' | 'BRL'>(account?.currency ?? 'EUR')
  const [opening, setOpening] = useState(account ? String(account.opening_balance).replace('.', ',') : '')
  const [openingDate, setOpeningDate] = useState(account?.opening_date ?? isoDate())
  const [reserved, setReserved] = useState(account ? String(account.reserved_amount).replace('.', ',') : '')
  const [busy, setBusy] = useState(false)

  const save = async (archive?: boolean) => {
    if (!name.trim()) return toast('Indique o nome da conta.', 'alert')
    const ob = parseDecimal(opening) ?? 0, rs = parseDecimal(reserved) ?? 0
    if (rs < 0) return toast('O valor reservado não pode ser negativo.', 'alert')
    setBusy(true)
    const row = { name: name.trim(), kind, owner_person_id: owner || null, institution: inst.trim() || null, opening_balance: ob, opening_date: openingDate, reserved_amount: rs }
    const { error } = account
      ? await supabase.from('fin_accounts').update(archive !== undefined ? { archived: archive } : row).eq('id', account.id)
      : await supabase.from('fin_accounts').insert({ ...row, household_id: hid, currency })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'alert')
    inv(); toast(account ? 'Conta atualizada.' : 'Conta criada.'); onClose()
  }

  return (
    <Sheet open onClose={onClose} title={account ? 'Editar conta' : 'Nova conta'}
      footer={<div className="py-2 space-y-2"><button className="btn-primary w-full" onClick={() => save()} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Guardar'}</button>
        {account && <button className="btn-ghost w-full text-sm" onClick={() => save(!account.archived)}>{account.archived ? 'Reativar conta' : 'Arquivar conta'}</button>}</div>}>
      <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Conta do Vitor" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo"><select className="input" value={kind} onChange={(e) => setKind(e.target.value as AccountKind)}>{(Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((k) => <option key={k} value={k}>{ACCOUNT_KIND_LABEL[k]}</option>)}</select></Field>
        <Field label="Titular"><select className="input" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Conjunta</option>{L.people.filter((p) => p.kind === 'member').map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Instituição"><input className="input" value={inst} onChange={(e) => setInst(e.target.value)} placeholder="Banco" /></Field>
        <Field label="Moeda"><select className="input" value={currency} disabled={!!account} onChange={(e) => setCurrency(e.target.value as 'EUR' | 'BRL')}><option value="EUR">Euro (€)</option><option value="BRL">Real (R$)</option></select></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={kind === 'credit_card' ? 'Dívida inicial (negativo)' : 'Saldo inicial'} hint="Saldo na data indicada."><NumberInput value={opening} onChange={setOpening} placeholder="0,00" /></Field>
        <Field label="Data do saldo inicial"><input type="date" className="input" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} /></Field>
      </div>
      {kind !== 'savings' && kind !== 'credit_card' && <Field label="Valor reservado (opcional)" hint="Dinheiro desta conta que não deve ser gasto."><NumberInput value={reserved} onChange={setReserved} placeholder="0,00" /></Field>}
      <p className="text-xs text-ink-muted">O saldo atual é calculado: saldo inicial + entradas − saídas realizadas a partir dessa data. Não guardamos credenciais bancárias.</p>
    </Sheet>
  )
}
