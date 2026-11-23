import { useEffect, useState } from 'react'
import { useRecordMovement } from '@/hooks/data'
import { friendlyError, errorCode } from '@/lib/errors'
import { isoDate, qty, unitShort } from '@/lib/format'
import type { Product } from '@/lib/types'
import { Field, Segmented, Sheet, Spinner, Stepper, cx, useConfirm, useToast } from './ui'

const OUT_REASONS = [
  { value: 'consumption', label: 'Consumo' },
  { value: 'waste', label: 'Desperdício' },
  { value: 'expired', label: 'Validade' },
  { value: 'gift', label: 'Oferta' },
  { value: 'correction', label: 'Correção' },
]
const IN_REASONS = [
  { value: 'purchase', label: 'Compra' },
  { value: 'gift', label: 'Oferta' },
  { value: 'correction', label: 'Correção' },
]

export const REASON_LABEL: Record<string, string> = {
  consumption: 'Consumo', waste: 'Desperdício', expired: 'Validade', gift: 'Oferta', correction: 'Correção',
  purchase: 'Compra', initial: 'Stock inicial', void: 'Compra anulada',
}

export function MovementSheet({ product, direction: initial, onClose }: { product: Product | null; direction: 'in' | 'out'; onClose: () => void }) {
  const [direction, setDirection] = useState<'in' | 'out'>(initial)
  const [amount, setAmount] = useState(1)
  const [reason, setReason] = useState(initial === 'in' ? 'purchase' : 'consumption')
  const [date, setDate] = useState(isoDate())
  const [expires, setExpires] = useState('')
  const [note, setNote] = useState('')
  const record = useRecordMovement()
  const confirm = useConfirm()
  const toast = useToast()

  useEffect(() => {
    if (product) { setDirection(initial); setAmount(1); setReason(initial === 'in' ? 'purchase' : 'consumption'); setDate(isoDate()); setExpires(''); setNote('') }
  }, [product, initial])

  if (!product) return null
  const current = Number(product.quantity)
  const next = Math.round((current + (direction === 'in' ? amount : -amount)) * 1000) / 1000
  const reasons = direction === 'in' ? IN_REASONS : OUT_REASONS
  const step = ['kg', 'l'].includes(product.unit) ? 0.5 : 1

  const submit = async () => {
    if (amount <= 0) return toast('Indique uma quantidade maior que zero.', 'alert')
    let allowNegative = false
    if (direction === 'out' && next < 0) {
      allowNegative = await confirm({
        title: 'Stock insuficiente',
        text: `Só existem ${qty(current)} ${unitShort(product.unit)} de ${product.name}. Retirar ${qty(amount)} deixará o stock negativo (${qty(next)}). Quer mesmo continuar?`,
        confirm: 'Retirar mesmo assim', danger: true,
      })
      if (!allowNegative) return
    }
    const today = isoDate()
    const occurredAt = date === today ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString()
    try {
      const res = await record.mutateAsync({
        product, direction, quantity: amount, reason, occurredAt, allowNegative,
        expiresOn: direction === 'in' && expires ? expires : null, note: note.trim() || null,
      })
      toast(res.queued
        ? 'Guardado no dispositivo — será sincronizado quando houver internet.'
        : `${direction === 'in' ? 'Adicionado' : 'Retirado'}: ${qty(amount)} ${unitShort(product.unit)} · agora ${qty(next)}`)
      onClose()
    } catch (e) {
      if (errorCode(e).includes('NEGATIVE_STOCK')) toast('O stock mudou entretanto e já não há unidades suficientes.', 'alert')
      else toast(friendlyError(e), 'alert')
    }
  }

  return (
    <Sheet open onClose={onClose} title={product.name}
      footer={<div className="py-2">
        <button className={cx('w-full', direction === 'in' ? 'btn-primary' : 'btn bg-navy-600 text-white')} onClick={submit} disabled={record.isPending}>
          {record.isPending ? <Spinner className="text-white" /> : direction === 'in' ? `Adicionar ${qty(amount)}` : `Retirar ${qty(amount)}`}
        </button>
      </div>}>
      <Segmented value={direction} onChange={(d) => { setDirection(d); setReason(d === 'in' ? 'purchase' : 'consumption') }}
                 options={[{ value: 'out', label: '− Retirar' }, { value: 'in', label: '+ Adicionar' }]} />
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-ink-muted">Stock atual: <b className="text-ink">{qty(current)} {unitShort(product.unit)}</b></span>
        <span className={cx('font-semibold', next < 0 ? 'text-alert-ink' : next <= Number(product.min_quantity) ? 'text-warn-ink' : 'text-ok-ink')}>
          Novo stock: {qty(next)}
        </span>
      </div>
      <Stepper value={amount} onChange={setAmount} step={step} />
      <div>
        <span className="label">Motivo</span>
        <div className="flex flex-wrap gap-2">
          {reasons.map((r) => (
            <button key={r.value} type="button" onClick={() => setReason(r.value)} className={cx('chip', reason === r.value && 'chip-active')}>{r.label}</button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Data"><input type="date" className="input" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></Field>
        {direction === 'in'
          ? <Field label="Validade (opcional)"><input type="date" className="input" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
          : <Field label="Nota (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
      </div>
    </Sheet>
  )
}
