import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useFinLookups, useHeitorTransfers, useTransactions } from '@/hooks/finance'
import { fmtMonth, isoDate, money } from '@/lib/format'
import { rootOf, type FinTx } from '@/lib/finance'
import { normalizeSearch } from '@/lib/search'
import { useFinanceUI } from '@/components/finance/FinanceUI'
import { TxRow } from '@/components/finance/TxRow'
import { Chips, EmptyState, Loading, Page, PageHeader } from '@/components/ui'

type Tipo = 'all' | 'income' | 'expense' | 'transfer' | 'heitor'

export default function Movements() {
  const [params, setParams] = useSearchParams()
  const { data: txs, isLoading } = useTransactions()
  const { data: heitor = [] } = useHeitorTransfers()
  const L = useFinLookups()
  const { openDetail } = useFinanceUI()
  const [q, setQ] = useState('')
  const month = params.get('mes') ?? ''
  const tipo = (params.get('tipo') as Tipo) || 'all'
  const cat = params.get('categoria') ?? ''
  const person = params.get('pessoa') ?? ''
  const account = params.get('conta') ?? ''
  const status = params.get('estado') ?? ''
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }) }
  const heitorIds = useMemo(() => new Set(heitor.map((h) => h.transaction_id)), [heitor])

  const months = useMemo(() => Array.from(new Set((txs ?? []).map((t) => t.date.slice(0, 7)))).sort().reverse(), [txs])
  const list = useMemo(() => {
    const s = normalizeSearch(q)
    return (txs ?? []).filter((t: FinTx) => {
      if (month && !t.date.startsWith(month)) return false
      if (account) { if (t.account_id !== account) return false }
      else if (t.nature === 'transfer' && t.direction === 'in') return false   // mostrar cada transferência uma vez
      if (tipo === 'heitor' && !heitorIds.has(t.id) && rootOf(t.category_id, L.catMap)?.system_key !== 'heitor') return false
      if (tipo !== 'all' && tipo !== 'heitor' && t.nature !== tipo) return false
      if (cat === 'none' && t.category_id) return false
      if (cat && cat !== 'none' && t.category_id !== cat && rootOf(t.category_id, L.catMap)?.id !== cat) return false
      if (person && t.person_id !== person && t.beneficiary_id !== person) return false
      if (status && t.status !== status) return false
      if (s && !normalizeSearch(`${t.description} ${L.catName(t.category_id)} ${t.notes ?? ''}`).includes(s)) return false
      return true
    })
  }, [txs, month, tipo, cat, person, account, status, q, heitorIds, L])

  const done = list.filter((t) => t.status === 'done')
  const inSum = done.filter((t) => t.nature === 'income').reduce((s, t) => s + t.amount, 0)
  const outSum = done.filter((t) => t.nature === 'expense').reduce((s, t) => s + t.amount, 0)
  const activeChips = [cat && L.catName(cat === 'none' ? null : cat), person && L.personName(person), account && L.accountName(account), status].filter(Boolean)

  return (
    <>
      <PageHeader title="Movimentos" subtitle={month ? fmtMonth(`${month}-01`) : 'Todos'} back="/financas" />
      <Page>
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input className="input pl-10" type="search" placeholder="Procurar descrição, categoria…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Chips value={tipo} onChange={(v) => set('tipo', v === 'all' ? '' : v)} options={[
          { value: 'all', label: 'Todos' }, { value: 'income', label: 'Entradas' }, { value: 'expense', label: 'Saídas' },
          { value: 'transfer', label: 'Transferências' }, { value: 'heitor', label: 'Heitor' }]} />
        <div className="grid grid-cols-2 gap-2">
          <select className="input h-10 text-sm" value={month} onChange={(e) => set('mes', e.target.value)} aria-label="Mês">
            <option value="">Todos os meses</option>
            {[isoDate().slice(0, 7), ...months].filter((m, i, a) => a.indexOf(m) === i).map((m) => <option key={m} value={m}>{fmtMonth(`${m}-01`)}</option>)}
          </select>
          <select className="input h-10 text-sm" value={status} onChange={(e) => set('estado', e.target.value)} aria-label="Estado">
            <option value="">Todos os estados</option><option value="done">Realizados</option><option value="planned">Previstos</option><option value="pending">Pendentes</option><option value="cancelled">Anulados</option>
          </select>
          <select className="input h-10 text-sm" value={person} onChange={(e) => set('pessoa', e.target.value)} aria-label="Pessoa">
            <option value="">Todas as pessoas</option>{L.people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <select className="input h-10 text-sm" value={account} onChange={(e) => set('conta', e.target.value)} aria-label="Conta">
            <option value="">Todas as contas</option>{L.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        {activeChips.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {cat && <button className="chip" onClick={() => set('categoria', '')}>{L.catName(cat === 'none' ? null : cat)}<X size={14} /></button>}
          </div>
        )}
        <div className="card p-3 grid grid-cols-3 text-center text-sm">
          <div><p className="font-bold text-ok-ink tabular-nums">{money(inSum)}</p><p className="text-[11px] text-ink-muted">Entradas</p></div>
          <div><p className="font-bold text-wine-600 tabular-nums">{money(outSum)}</p><p className="text-[11px] text-ink-muted">Saídas</p></div>
          <div><p className="font-bold tabular-nums">{money(inSum - outSum)}</p><p className="text-[11px] text-ink-muted">Saldo</p></div>
        </div>
        {isLoading ? <Loading /> : list.length === 0 ? <EmptyState title="Sem movimentos" text="Não há movimentos com estes filtros." /> : (
          <div className="card divide-y divide-line/70 overflow-hidden">
            {list.slice(0, 400).map((t) => <TxRow key={t.id} tx={t} onClick={() => openDetail(t)} />)}
          </div>
        )}
        <p className="text-xs text-ink-muted px-1">Totais apenas com movimentos realizados. Transferências entre contas próprias não entram nas entradas nem nas saídas.</p>
      </Page>
    </>
  )
}
