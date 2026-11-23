import { Ban, FileText, Pencil } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/hooks/auth'
import { keys, usePurchase, useReceiptFileUrl, useWho } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { fmtDate, isoDate, money, parseDecimal, qty, relativeDay } from '@/lib/format'
import { storeLabel } from '@/lib/stores'
import type { Receipt } from '@/lib/types'
import { Badge, EmptyState, Field, Loading, NumberInput, Page, PageHeader, Sheet, Spinner, useToast } from '@/components/ui'
import { useQuery } from '@tanstack/react-query'

export default function PurchaseDetail() {
  const { id } = useParams()
  const { hid } = useHousehold()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const who = useWho()
  const { data, isLoading } = usePurchase(id)
  const { data: receipt } = useQuery({
    queryKey: ['receipt-of', data?.purchase.receipt_id],
    enabled: !!data?.purchase.receipt_id,
    queryFn: async () => (await supabase.from('receipts').select('*').eq('id', data!.purchase.receipt_id!).single()).data as Receipt,
  })
  const { data: fileUrl } = useReceiptFileUrl(receipt?.file_path)
  const [editing, setEditing] = useState(false)
  const [voiding, setVoiding] = useState(false)

  if (isLoading) return <Loading />
  if (!data) return <><PageHeader title="Compra" back /><Page><EmptyState title="Compra não encontrada" /></Page></>
  const { purchase: p, items } = data
  const refresh = () => { for (const k of [['purchase', id], keys.purchases(hid), keys.products(hid), keys.movements(hid), keys.receipts(hid), keys.lots(hid)]) qc.invalidateQueries({ queryKey: k }) }

  return (
    <>
      <PageHeader title={p.store_name} subtitle={fmtDate(p.purchased_at)} back
        actions={p.status === 'confirmed' && <button aria-label="Corrigir" onClick={() => setEditing(true)} className="h-10 w-10 grid place-items-center rounded-full hover:bg-sand"><Pencil size={19} /></button>} />
      <Page>
        {p.status === 'voided' && (
          <div className="card p-4 bg-sand/60 text-sm"><b>Compra anulada</b>{p.void_reason ? ` — ${p.void_reason}` : ''}. Não conta nas despesas{p.voided_at ? ` (desde ${fmtDate(p.voided_at)})` : ''}.</div>
        )}
        <div className="card p-5 text-center">
          <p className="text-[34px] font-bold tabular-nums">{money(p.total_paid)}</p>
          <p className="text-sm text-ink-muted">{storeLabel(p.store_chain)} · {items.length} artigos{p.payment_method ? ` · ${p.payment_method}` : ''}</p>
          {p.discount_total > 0 && <p className="text-sm text-sage-700 mt-1">Descontos globais: {money(p.discount_total)}</p>}
          <p className="text-xs text-ink-muted mt-2">Registada por {who(p.created_by)} · {relativeDay(p.created_at)}</p>
          {p.document_number && <p className="text-xs text-ink-muted">Documento: {p.document_number}</p>}
        </div>

        {receipt?.file_path && fileUrl && (
          <a href={fileUrl} target="_blank" rel="noreferrer" className="card p-4 flex items-center gap-3"><FileText size={19} className="text-sage-700" /><span className="font-medium">Ver fatura original</span></a>
        )}

        <div className="card divide-y divide-line/70">
          {items.map((it) => (
            <div key={it.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                {it.product_id ? <Link to={`/stock/${it.product_id}`} className="font-medium text-ink">{it.name}</Link> : <p className="font-medium">{it.name}</p>}
                <p className="text-xs text-ink-muted">{qty(it.quantity)} × {money(Number(it.line_total) / Number(it.quantity))}{Number(it.discount) > 0 ? ` · desconto ${money(it.discount)}` : ''}</p>
              </div>
              {!it.add_to_stock || !it.product_id ? <Badge>sem stock</Badge> : null}
              <span className="font-semibold tabular-nums">{money(it.line_total)}</span>
            </div>
          ))}
          {items.length === 0 && <p className="px-4 py-3 text-sm text-ink-muted">Compra registada sem artigos.</p>}
        </div>
        {p.items_total !== null && Math.abs(Number(p.items_total) - Number(p.discount_total) - p.total_paid) > 0.01 && (
          <p className="text-xs text-warn-ink px-1">Soma dos artigos: {money(p.items_total)} — diferença de {money(p.total_paid - (Number(p.items_total) - Number(p.discount_total)))} face ao total pago.</p>
        )}

        {p.status === 'confirmed' && (
          <button className="btn-danger w-full" onClick={() => setVoiding(true)}><Ban size={18} />Anular ou corrigir compra</button>
        )}
      </Page>

      {editing && <EditSheet purchase={p} onClose={() => setEditing(false)} onSaved={() => { refresh(); setEditing(false) }} />}
      <Sheet open={voiding} onClose={() => setVoiding(false)} title="Anular compra">
        <VoidForm hasReceipt={!!p.receipt_id} onCancel={() => setVoiding(false)} onConfirm={async (reason, revert, reopen) => {
          const { error } = await supabase.rpc('void_purchase', { p_purchase_id: p.id, p_reason: reason || null, p_revert_stock: revert, p_reopen_receipt: reopen })
          if (error) return toast(friendlyError(error), 'alert')
          refresh(); setVoiding(false)
          toast(reopen ? 'Compra anulada. Corrija agora os dados da fatura.' : 'Compra anulada.')
          if (reopen && p.receipt_id) nav(`/faturas/${p.receipt_id}`)
        }} />
      </Sheet>
    </>
  )
}

function VoidForm({ hasReceipt, onCancel, onConfirm }: { hasReceipt: boolean; onCancel: () => void; onConfirm: (reason: string, revert: boolean, reopen: boolean) => Promise<void> }) {
  const [reason, setReason] = useState('')
  const [revert, setRevert] = useState(true)
  const [reopen, setReopen] = useState(hasReceipt)
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-soft">A compra deixa de contar nas despesas e nos gráficos. Fica no histórico como anulada.</p>
      <Field label="Motivo (opcional)"><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: fatura duplicada, valores errados" /></Field>
      <label className="flex items-start gap-3"><input type="checkbox" checked={revert} onChange={(e) => setRevert(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#62805A]" /><span className="text-[15px]">Retirar do stock as quantidades que esta compra adicionou</span></label>
      {hasReceipt && <label className="flex items-start gap-3"><input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#62805A]" /><span className="text-[15px]">Reabrir a fatura para corrigir os artigos e confirmar de novo</span></label>}
      <div className="grid grid-cols-2 gap-3 pt-1">
        <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
        <button className="btn bg-alert text-white" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(reason, revert, reopen); setBusy(false) }}>{busy ? <Spinner className="text-white" /> : 'Anular compra'}</button>
      </div>
    </div>
  )
}

function EditSheet({ purchase, onClose, onSaved }: { purchase: { id: string; store_name: string; purchased_at: string; total_paid: number; payment_method: string | null; document_number: string | null }; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const [store, setStore] = useState(purchase.store_name)
  const [date, setDate] = useState(purchase.purchased_at)
  const [total, setTotal] = useState(String(purchase.total_paid).replace('.', ','))
  const [payment, setPayment] = useState(purchase.payment_method ?? '')
  const [doc, setDoc] = useState(purchase.document_number ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    const t = parseDecimal(total)
    if (t === null || t < 0) return toast('Indique o total pago.', 'alert')
    setBusy(true)
    const { error } = await supabase.rpc('update_purchase', { p_purchase_id: purchase.id, p_store_name: store, p_purchased_at: date, p_total_paid: t, p_payment_method: payment || null, p_document_number: doc || null })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'alert')
    toast('Compra corrigida.'); onSaved()
  }
  return (
    <Sheet open onClose={onClose} title="Corrigir compra" footer={<div className="py-2"><button className="btn-primary w-full" onClick={save} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Guardar'}</button></div>}>
      <p className="text-sm text-ink-muted">Para corrigir artigos ou quantidades, use “Anular ou corrigir compra” e reabra a fatura.</p>
      <Field label="Supermercado"><input className="input" value={store} onChange={(e) => setStore(e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data"><input type="date" className="input" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="Total pago (€)"><NumberInput value={total} onChange={setTotal} /></Field>
      </div>
      <Field label="Pagamento"><input className="input" value={payment} onChange={(e) => setPayment(e.target.value)} /></Field>
      <Field label="Nº do documento / ATCUD"><input className="input" value={doc} onChange={(e) => setDoc(e.target.value)} /></Field>
    </Sheet>
  )
}
