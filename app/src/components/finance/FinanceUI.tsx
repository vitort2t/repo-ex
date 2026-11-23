import { Ban, CheckCircle2, ExternalLink, Paperclip, Pencil, ShoppingBasket } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useFinLookups, useHeitorTransfers, useInvalidateFinance, useTransactions } from '@/hooks/finance'
import { useWho } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { fmtDate, isoDate, money, parseDecimal, relativeDay } from '@/lib/format'
import { moneyBRL, moneyCur, STATUS_LABEL, type FinTx } from '@/lib/finance'
import { Badge, Field, NumberInput, Sheet, Spinner, cx, useConfirm, useToast } from '../ui'
import { MovementForm, NewMovementMenu, type MovementType } from './MovementForm'

type Ctx = { openNew: (t?: MovementType) => void; openDetail: (tx: FinTx) => void; openEdit: (tx: FinTx) => void }
const FinCtx = createContext<Ctx>({ openNew: () => {}, openDetail: () => {}, openEdit: () => {} })
export const useFinanceUI = () => useContext(FinCtx)

/** Fornece o botão "+ Novo movimento", o formulário e a ficha de detalhe a toda a aplicação. */
export function FinanceUIProvider({ children }: { children: ReactNode }) {
  const [menu, setMenu] = useState(false)
  const [type, setType] = useState<MovementType | null>(null)
  const [edit, setEdit] = useState<FinTx | null>(null)
  const [detail, setDetail] = useState<FinTx | null>(null)
  const openNew = useCallback((t?: MovementType) => { if (t) setType(t); else setMenu(true) }, [])
  const openDetail = useCallback((tx: FinTx) => setDetail(tx), [])
  const openEdit = useCallback((tx: FinTx) => { setDetail(null); setEdit(tx) }, [])
  return (
    <FinCtx.Provider value={{ openNew, openDetail, openEdit }}>
      {children}
      <NewMovementMenu open={menu} onClose={() => setMenu(false)} onPick={(t) => { setMenu(false); setType(t) }} />
      {(type || edit) && <MovementForm type={type} edit={edit} onClose={() => { setType(null); setEdit(null) }} />}
      {detail && <TxDetail txId={detail.id} fallback={detail} onClose={() => setDetail(null)} onEdit={openEdit} />}
    </FinCtx.Provider>
  )
}

export function StatusBadge({ s }: { s: FinTx['status'] }) {
  const tone = s === 'done' ? 'ok' : s === 'pending' ? 'warn' : s === 'planned' ? 'neutral' : 'alert'
  return <Badge tone={tone}>{STATUS_LABEL[s]}</Badge>
}

function TxDetail({ txId, fallback, onClose, onEdit }: { txId: string; fallback: FinTx; onClose: () => void; onEdit: (t: FinTx) => void }) {
  const { data: txs = [] } = useTransactions()
  const { data: heitor = [] } = useHeitorTransfers()
  const L = useFinLookups()
  const who = useWho()
  const inv = useInvalidateFinance()
  const toast = useToast()
  const confirm = useConfirm()
  const tx = txs.find((t) => t.id === txId) ?? fallback
  const h = heitor.find((x) => x.transaction_id === tx.id)
  const pair = tx.transfer_group ? txs.find((t) => t.transfer_group === tx.transfer_group && t.id !== tx.id) : undefined
  const [confirming, setConfirming] = useState(false)
  const [cAmount, setCAmount] = useState(String(tx.amount).replace('.', ','))
  const [cDate, setCDate] = useState(isoDate())
  const [busy, setBusy] = useState(false)

  const openProof = async () => {
    const { data, error } = await supabase.storage.from('finance-docs').createSignedUrl(tx.proof_path!, 600)
    if (error) return toast(friendlyError(error), 'alert')
    window.open(data.signedUrl, '_blank', 'noopener')
  }
  const doConfirm = async () => {
    const a = parseDecimal(cAmount)
    if (a === null || a <= 0) return toast('Indique o valor.', 'alert')
    setBusy(true)
    const { error } = await supabase.rpc('fin_confirm_movement', { p_id: tx.id, p_amount: a, p_date: cDate, p_account_id: null })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'alert')
    inv(); setConfirming(false); toast(tx.nature === 'income' ? 'Recebimento confirmado.' : 'Pagamento confirmado.')
  }
  const cancel = async () => {
    if (!(await confirm({ title: 'Anular movimento?', text: tx.transfer_group ? 'As duas partes da transferência serão anuladas. O movimento fica no histórico como anulado.' : 'Deixa de contar nos saldos e relatórios. Fica no histórico como anulado.', confirm: 'Anular', danger: true }))) return
    const { error } = await supabase.rpc('fin_cancel_movement', { p_id: tx.id, p_reason: null })
    if (error) return toast(friendlyError(error), 'alert')
    inv(); onClose(); toast('Movimento anulado.')
  }

  const kindLabel = tx.nature === 'income' ? 'Entrada' : tx.nature === 'expense' ? (h ? 'Envio ao Heitor' : 'Despesa')
    : tx.transfer_kind === 'savings' ? 'Poupança' : tx.transfer_kind === 'card_payment' ? 'Pagamento de cartão' : 'Transferência'
  const Item = ({ l, v }: { l: string; v: ReactNode }) => <div className="flex justify-between gap-4 py-2 text-sm"><span className="text-ink-muted">{l}</span><span className="font-medium text-right">{v}</span></div>

  return (
    <Sheet open onClose={onClose} title={tx.description}
      footer={tx.status !== 'cancelled' && (
        <div className="grid grid-cols-[auto_auto_1fr] gap-2 py-2">
          {!tx.purchase_id && <button className="btn-danger px-3.5" onClick={cancel} aria-label="Anular"><Ban size={18} /></button>}
          <button className="btn-secondary px-3.5" onClick={() => onEdit(tx)} aria-label="Editar"><Pencil size={18} /></button>
          {tx.status !== 'done'
            ? <button className="btn-primary" onClick={() => setConfirming(true)}><CheckCircle2 size={18} />{tx.nature === 'income' ? 'Confirmar recebimento' : 'Confirmar pagamento'}</button>
            : <button className="btn-secondary" onClick={onClose}>Fechar</button>}
        </div>)}>
      <div className="text-center">
        <p className={cx('text-[32px] font-bold tabular-nums', tx.nature === 'income' ? 'text-ok-ink' : tx.nature === 'expense' ? 'text-wine-600' : 'text-navy-600')}>
          {tx.nature === 'income' ? '+' : tx.nature === 'expense' ? '−' : ''}{moneyCur(tx.amount, tx.currency)}
        </p>
        <div className="flex justify-center gap-2 mt-1"><Badge>{kindLabel}</Badge><StatusBadge s={tx.status} /></div>
      </div>
      {confirming && (
        <div className="rounded-2xl bg-base p-3 space-y-3">
          <p className="text-sm text-ink-soft">Indique o valor e a data efetivos:</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valor (€)"><NumberInput value={cAmount} onChange={setCAmount} /></Field>
            <Field label="Data"><input type="date" className="input" value={cDate} max={isoDate()} onChange={(e) => setCDate(e.target.value)} /></Field>
          </div>
          <button className="btn-primary w-full" onClick={doConfirm} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Confirmar'}</button>
        </div>
      )}
      <div className="divide-y divide-line/70">
        <Item l="Data" v={fmtDate(tx.date)} />
        {tx.nature !== 'transfer' && <Item l="Categoria" v={L.catName(tx.category_id)} />}
        {tx.nature === 'transfer'
          ? <><Item l="De" v={tx.direction === 'out' ? L.accountName(tx.account_id) : L.accountName(pair?.account_id ?? null)} /><Item l="Para" v={tx.direction === 'in' ? L.accountName(tx.account_id) : L.accountName(pair?.account_id ?? null)} /></>
          : <Item l={tx.nature === 'income' ? 'Conta de destino' : 'Conta de origem'} v={L.accountName(tx.account_id)} />}
        {tx.person_id && <Item l={tx.nature === 'income' ? 'Recebido por' : 'Pago por'} v={L.personName(tx.person_id)} />}
        {tx.beneficiary_id && <Item l="Beneficiário" v={L.personName(tx.beneficiary_id)} />}
        {tx.nature === 'expense' && <Item l="Tipo" v={tx.scope === 'shared' ? 'Partilhada' : 'Individual'} />}
        {tx.payment_method && <Item l={tx.nature === 'income' ? 'Origem' : 'Pagamento'} v={tx.payment_method} />}
        {h && <>
          <Item l="Enviado" v={money(h.amount_eur)} />
          <Item l="Recebido no Brasil" v={moneyBRL(h.amount_brl)} />
          <Item l="Taxa de câmbio aplicada" v={h.fx_rate ? `${String(h.fx_rate).replace('.', ',')} R$/€` : '—'} />
          <Item l="Taxas e comissões" v={money(h.fees_eur)} />
          {h.service && <Item l="Serviço" v={h.service} />}
          {h.purpose && <Item l="Finalidade" v={h.purpose} />}
        </>}
        {tx.goal_id && <Item l="Objetivo" v="Associado a um objetivo" />}
        {tx.notes && <Item l="Observações" v={tx.notes} />}
        <Item l="Registado" v={`${who(tx.created_by)} · ${relativeDay(tx.created_at)}`} />
        {tx.updated_by && tx.updated_at !== tx.created_at && <Item l="Última alteração" v={`${who(tx.updated_by)} · ${relativeDay(tx.updated_at)}`} />}
        <Item l="Origem do registo" v={{ manual: 'Manual', purchase: 'Fatura de supermercado', recurring: 'Recorrência', import: 'Extrato importado' }[tx.source]} />
      </div>
      {tx.proof_path && <button className="btn-secondary w-full" onClick={openProof}><Paperclip size={17} />Ver comprovativo</button>}
      {tx.purchase_id && <Link to={`/despesas/compra/${tx.purchase_id}`} onClick={onClose} className="btn-secondary w-full"><ShoppingBasket size={17} />Ver compra e fatura<ExternalLink size={14} /></Link>}
    </Sheet>
  )
}
