import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Globe2, PiggyBank, ShoppingBasket } from 'lucide-react'
import { fmtDateShort } from '@/lib/format'
import { moneyCur, type FinTx } from '@/lib/finance'
import { useFinLookups, useHeitorTransfers } from '@/hooks/finance'
import { cx } from '../ui'
import { StatusBadge } from './FinanceUI'

export function TxRow({ tx, onClick }: { tx: FinTx; onClick: () => void }) {
  const L = useFinLookups()
  const { data: heitor = [] } = useHeitorTransfers()
  const isH = heitor.some((h) => h.transaction_id === tx.id)
  const Icon = tx.purchase_id ? ShoppingBasket : isH ? Globe2 : tx.nature === 'income' ? ArrowDownLeft : tx.nature === 'expense' ? ArrowUpRight : tx.transfer_kind === 'savings' ? PiggyBank : ArrowLeftRight
  const tone = tx.nature === 'income' ? 'bg-ok-bg text-ok-ink' : isH ? 'bg-plum-50 text-plum-600' : tx.nature === 'expense' ? 'bg-wine-50 text-wine-600' : 'bg-navy-50 text-navy-600'
  const sub = tx.nature === 'transfer'
    ? `${tx.direction === 'out' ? 'Sai de' : 'Entra em'} ${L.accountName(tx.account_id)}`
    : [L.catName(tx.category_id), tx.person_id ? L.personName(tx.person_id) : null].filter(Boolean).join(' · ')
  return (
    <button onClick={onClick} className={cx('w-full flex items-center gap-3 px-4 py-3 text-left', tx.status === 'cancelled' && 'opacity-50')}>
      <span className={cx('h-10 w-10 shrink-0 rounded-xl grid place-items-center', tone)}><Icon size={18} strokeWidth={1.9} /></span>
      <span className="flex-1 min-w-0">
        <span className={cx('block font-medium truncate', tx.status === 'cancelled' && 'line-through')}>{tx.description}</span>
        <span className="block text-xs text-ink-muted truncate">{fmtDateShort(tx.date)} · {sub}</span>
      </span>
      <span className="text-right shrink-0">
        <span className={cx('block font-semibold tabular-nums', tx.nature === 'income' ? 'text-ok-ink' : tx.nature === 'expense' ? 'text-ink' : 'text-navy-600')}>
          {tx.nature === 'income' ? '+' : tx.nature === 'expense' ? '−' : tx.direction === 'out' ? '↗ ' : '↘ '}{moneyCur(tx.amount, tx.currency)}
        </span>
        {tx.status !== 'done' && <StatusBadge s={tx.status} />}
      </span>
    </button>
  )
}
