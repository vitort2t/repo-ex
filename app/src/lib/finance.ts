// Tipos e cálculos do módulo financeiro. Todas as somas usam apenas valores efetivamente
// realizados (status = 'done'), salvo quando indicado (previstos/pendentes).
import { isoDate, parseIsoDate } from './format'

export type FinPerson = { id: string; household_id: string; name: string; kind: 'member' | 'beneficiary'; user_id: string | null; archived: boolean }
export type AccountKind = 'bank' | 'cash' | 'savings' | 'credit_card'
export type FinAccount = {
  id: string; household_id: string; name: string; kind: AccountKind; owner_person_id: string | null; institution: string | null
  currency: 'EUR' | 'BRL'; opening_balance: number; opening_date: string; reserved_amount: number; archived: boolean; sort: number
}
export type AccountBalance = {
  id: string; household_id: string; name: string; kind: AccountKind; currency: 'EUR' | 'BRL'; owner_person_id: string | null
  institution: string | null; archived: boolean; reserved_amount: number; opening_balance: number; balance: number; pending_out: number; pending_in: number
}
export type FinCategory = { id: string; household_id: string; kind: 'income' | 'expense' | 'savings'; parent_id: string | null; name: string; system_key: string | null; sort: number; archived: boolean }
export type TxStatus = 'planned' | 'pending' | 'done' | 'cancelled'
export type FinTx = {
  id: string; household_id: string; client_id: string | null; nature: 'income' | 'expense' | 'transfer'; direction: 'in' | 'out'
  status: TxStatus; amount: number; currency: 'EUR' | 'BRL'; date: string; description: string; category_id: string | null
  account_id: string | null; person_id: string | null; beneficiary_id: string | null; scope: 'shared' | 'individual'
  payment_method: string | null; notes: string | null; proof_path: string | null; transfer_group: string | null
  transfer_kind: 'internal' | 'savings' | 'card_payment' | null; goal_id: string | null; recurring_id: string | null
  purchase_id: string | null; import_id: string | null; source: 'manual' | 'purchase' | 'recurring' | 'import'
  created_by: string | null; updated_by: string | null; created_at: string; updated_at: string
}
export type HeitorTransfer = { transaction_id: string; amount_eur: number; amount_brl: number | null; fx_rate: number | null; fees_eur: number; service: string | null; purpose: string | null }
export type FinBudget = { id: string; household_id: string; month: string; scope: 'total' | 'category' | 'person'; category_id: string | null; person_id: string | null; amount: number }
export type BudgetStatus = { budget_id: string; scope: FinBudget['scope']; category_id: string | null; person_id: string | null; amount: number; spent: number; planned: number }
export type FinGoal = { id: string; household_id: string; name: string; target_amount: number; initial_amount: number; start_date: string; deadline: string | null; account_id: string | null; notes: string | null; archived: boolean; accumulated: number }
export type Frequency = 'weekly' | 'monthly' | 'yearly' | 'days'
export type FinRecurring = {
  id: string; household_id: string; type: 'income' | 'expense'; description: string; amount: number; category_id: string | null
  account_id: string | null; person_id: string | null; beneficiary_id: string | null; frequency: Frequency; interval_n: number
  next_due: string; end_date: string | null; active: boolean; notes: string | null
}

export const ACCOUNT_KIND_LABEL: Record<AccountKind, string> = { bank: 'Conta bancária', cash: 'Numerário', savings: 'Poupança', credit_card: 'Cartão de crédito' }
export const STATUS_LABEL: Record<TxStatus, string> = { planned: 'Previsto', pending: 'Pendente', done: 'Realizado', cancelled: 'Anulado' }
export const FREQ_LABEL: Record<Frequency, string> = { weekly: 'Semanal', monthly: 'Mensal', yearly: 'Anual', days: 'A cada N dias' }

const r2 = (n: number) => Math.round(n * 100) / 100
const num = (v: unknown) => Number(v) || 0
export const monthKey = (d: string) => d.slice(0, 7)

export function inMonth(t: Pick<FinTx, 'date'>, month: string) { return t.date.startsWith(month) }

/** Raiz (categoria principal) de uma categoria. */
export function rootOf(catId: string | null, cats: Map<string, FinCategory>): FinCategory | null {
  let c = catId ? cats.get(catId) ?? null : null
  let guard = 0
  while (c?.parent_id && guard++ < 5) c = cats.get(c.parent_id) ?? c
  return c
}

export function isHeitor(t: FinTx, cats: Map<string, FinCategory>, heitorId: string | null) {
  return t.nature === 'expense' && (rootOf(t.category_id, cats)?.system_key === 'heitor' || (!!heitorId && t.beneficiary_id === heitorId))
}

export type MonthSummary = {
  income: number; expenses: number; ownTransfers: number; heitor: number; saved: number; net: number
  plannedIncome: number; plannedExpenses: number; pendingExpenses: number
}

/** Resumo do mês (EUR). Transferências próprias nunca contam como rendimento/despesa. */
export function monthSummary(txs: FinTx[], month: string, cats: Map<string, FinCategory>, heitorId: string | null, savingsAccounts: Set<string>): MonthSummary {
  const m = txs.filter((t) => inMonth(t, month) && t.currency === 'EUR' && t.status !== 'cancelled')
  const done = m.filter((t) => t.status === 'done')
  const income = r2(done.filter((t) => t.nature === 'income').reduce((s, t) => s + num(t.amount), 0))
  const expenses = r2(done.filter((t) => t.nature === 'expense').reduce((s, t) => s + num(t.amount), 0))
  const ownTransfers = r2(done.filter((t) => t.nature === 'transfer' && t.direction === 'out').reduce((s, t) => s + num(t.amount), 0))
  const heitor = r2(done.filter((t) => isHeitor(t, cats, heitorId)).reduce((s, t) => s + num(t.amount), 0))
  // Poupado = entradas líquidas nas contas de poupança através de transferências próprias
  const saved = r2(done.filter((t) => t.nature === 'transfer' && t.account_id && savingsAccounts.has(t.account_id))
    .reduce((s, t) => s + (t.direction === 'in' ? num(t.amount) : -num(t.amount)), 0))
  const open = m.filter((t) => t.status === 'planned' || t.status === 'pending')
  return {
    income, expenses, ownTransfers, heitor, saved, net: r2(income - expenses),
    plannedIncome: r2(open.filter((t) => t.nature === 'income').reduce((s, t) => s + num(t.amount), 0)),
    plannedExpenses: r2(open.filter((t) => t.nature === 'expense' && t.status === 'planned').reduce((s, t) => s + num(t.amount), 0)),
    pendingExpenses: r2(open.filter((t) => t.nature === 'expense' && t.status === 'pending').reduce((s, t) => s + num(t.amount), 0)),
  }
}

export function previousMonth(month: string) { const d = parseIsoDate(`${month}-01`); return isoDate(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7) }
export function monthsBack(month: string, n: number): string[] {
  const d = parseIsoDate(`${month}-01`)
  return Array.from({ length: n }, (_, i) => isoDate(new Date(d.getFullYear(), d.getMonth() - (n - 1 - i), 1)).slice(0, 7))
}

export type CategoryTotal = { id: string; name: string; total: number; share: number }
/** Despesas realizadas por categoria principal. */
export function expensesByCategory(txs: FinTx[], months: string[], cats: Map<string, FinCategory>): CategoryTotal[] {
  const m = new Map<string, number>()
  for (const t of txs) {
    if (t.nature !== 'expense' || t.status !== 'done' || t.currency !== 'EUR' || !months.includes(monthKey(t.date))) continue
    const root = rootOf(t.category_id, cats)
    const k = root?.id ?? 'none'
    m.set(k, (m.get(k) ?? 0) + num(t.amount))
  }
  const total = [...m.values()].reduce((a, b) => a + b, 0)
  return [...m.entries()].map(([id, v]) => ({ id, name: id === 'none' ? 'Sem categoria' : cats.get(id)?.name ?? '—', total: r2(v), share: total ? v / total : 0 }))
    .sort((a, b) => b.total - a.total)
}

export type Change = { id: string; name: string; current: number; previous: number; diff: number; change: number | null }
/** Análise simples: o que aumentou e onde se economizou face ao mês anterior. */
export function categoryChanges(txs: FinTx[], month: string, cats: Map<string, FinCategory>): { increased: Change[]; decreased: Change[]; top: CategoryTotal[] } {
  const cur = new Map(expensesByCategory(txs, [month], cats).map((c) => [c.id, c]))
  const prev = new Map(expensesByCategory(txs, [previousMonth(month)], cats).map((c) => [c.id, c]))
  const ids = new Set([...cur.keys(), ...prev.keys()])
  const all: Change[] = [...ids].map((id) => {
    const c = cur.get(id)?.total ?? 0, p = prev.get(id)?.total ?? 0
    return { id, name: cur.get(id)?.name ?? prev.get(id)?.name ?? '—', current: c, previous: p, diff: r2(c - p), change: p > 0 ? (c - p) / p : null }
  })
  return {
    increased: all.filter((x) => x.diff > 0.009).sort((a, b) => b.diff - a.diff),
    decreased: all.filter((x) => x.diff < -0.009).sort((a, b) => a.diff - b.diff),
    top: [...cur.values()].slice(0, 3),
  }
}

export type MonthRow = { month: string; income: number; expenses: number; net: number; saved: number; heitor: number }
export function monthlySeries(txs: FinTx[], months: string[], cats: Map<string, FinCategory>, heitorId: string | null, savingsAccounts: Set<string>): MonthRow[] {
  return months.map((m) => { const s = monthSummary(txs, m, cats, heitorId, savingsAccounts); return { month: m, income: s.income, expenses: s.expenses, net: s.net, saved: s.saved, heitor: s.heitor } })
}

/** Quem pagou: despesas realizadas por pessoa, separando partilhadas e individuais. */
export function expensesByPerson(txs: FinTx[], months: string[], people: FinPerson[]) {
  return people.filter((p) => p.kind === 'member').map((p) => {
    const mine = txs.filter((t) => t.nature === 'expense' && t.status === 'done' && t.currency === 'EUR' && t.person_id === p.id && months.includes(monthKey(t.date)))
    const shared = r2(mine.filter((t) => t.scope === 'shared').reduce((s, t) => s + num(t.amount), 0))
    const individual = r2(mine.filter((t) => t.scope === 'individual').reduce((s, t) => s + num(t.amount), 0))
    return { id: p.id, name: p.name, shared, individual, total: r2(shared + individual) }
  })
}
export function incomeByPerson(txs: FinTx[], months: string[], people: FinPerson[]) {
  return people.filter((p) => p.kind === 'member').map((p) => ({
    id: p.id, name: p.name,
    total: r2(txs.filter((t) => t.nature === 'income' && t.status === 'done' && t.currency === 'EUR' && t.person_id === p.id && months.includes(monthKey(t.date))).reduce((s, t) => s + num(t.amount), 0)),
  }))
}

/** Saldo acumulado das contas de poupança no fim de cada mês. */
export function savingsSeries(txs: FinTx[], accounts: FinAccount[], months: string[]) {
  const sav = accounts.filter((a) => a.kind === 'savings' && a.currency === 'EUR')
  return months.map((m) => {
    const end = `${m}-31`
    let total = 0
    for (const a of sav) {
      if (a.opening_date.slice(0, 7) > m) continue
      total += num(a.opening_balance)
      for (const t of txs) if (t.account_id === a.id && t.status === 'done' && t.date >= a.opening_date && t.date <= end) total += t.direction === 'in' ? num(t.amount) : -num(t.amount)
    }
    return { month: m, total: r2(total) }
  })
}

/** Gastos fixos (vindos de recorrências) vs variáveis. */
export function fixedVsVariable(txs: FinTx[], months: string[]) {
  const e = txs.filter((t) => t.nature === 'expense' && t.status === 'done' && t.currency === 'EUR' && months.includes(monthKey(t.date)))
  const fixed = r2(e.filter((t) => t.recurring_id).reduce((s, t) => s + num(t.amount), 0))
  return { fixed, variable: r2(e.reduce((s, t) => s + num(t.amount), 0) - fixed) }
}

export type Consolidated = { real: number; available: number; pending: number; reserved: number; byCurrency: Record<string, number> }
/** Saldo real, disponível, pendente e reservado (consolidado em EUR; BRL mostrado à parte). */
export function consolidate(balances: AccountBalance[]): Consolidated {
  const eur = balances.filter((b) => !b.archived && b.currency === 'EUR')
  const real = r2(eur.reduce((s, b) => s + num(b.balance), 0))
  const pending = r2(eur.reduce((s, b) => s + num(b.pending_out), 0))
  const reserved = r2(eur.reduce((s, b) => s + num(b.reserved_amount), 0) + eur.filter((b) => b.kind === 'savings').reduce((s, b) => s + Math.max(0, num(b.balance)), 0))
  const liquid = eur.filter((b) => b.kind !== 'savings').reduce((s, b) => s + num(b.balance) - num(b.reserved_amount), 0)
  const byCurrency: Record<string, number> = {}
  for (const b of balances.filter((x) => !x.archived)) byCurrency[b.currency] = r2((byCurrency[b.currency] ?? 0) + num(b.balance))
  return { real, pending, reserved, available: r2(liquid - pending), byCurrency }
}

export function nextOccurrences(r: Pick<FinRecurring, 'next_due' | 'frequency' | 'interval_n' | 'end_date'>, count: number): string[] {
  const out: string[] = []
  let d = parseIsoDate(r.next_due)
  for (let i = 0; i < count; i++) {
    const s = isoDate(d)
    if (r.end_date && s > r.end_date) break
    out.push(s)
    if (r.frequency === 'weekly') d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7 * r.interval_n)
    else if (r.frequency === 'monthly') { const day = parseIsoDate(r.next_due).getDate(); const t = new Date(d.getFullYear(), d.getMonth() + r.interval_n, 1); d = new Date(t.getFullYear(), t.getMonth(), Math.min(day, new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())) }
    else if (r.frequency === 'yearly') d = new Date(d.getFullYear() + r.interval_n, d.getMonth(), d.getDate())
    else d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + r.interval_n)
  }
  return out
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
export const moneyBRL = (v: number | null | undefined) => (v === null || v === undefined ? '—' : brl.format(v))
export const moneyCur = (v: number | null | undefined, cur: 'EUR' | 'BRL' = 'EUR') =>
  cur === 'BRL' ? moneyBRL(v) : v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v)

// ---------------------------------------------------------------- extratos CSV
export type StatementRow = { key: string; date: string; description: string; amount: number }

function parseAmount(s: string): number | null {
  let t = s.trim().replace(/\s|€|EUR/gi, '')
  if (!t) return null
  const neg = /^\(.*\)$/.test(t) || t.endsWith('-')
  t = t.replace(/[()]/g, '').replace(/-$/, '')
  if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')   // 1.234,56
  else t = t.replace(/,/g, '')                                         // 1,234.56
  const n = Number(t)
  return Number.isFinite(n) ? (neg ? -Math.abs(n) : n) : null
}
function parseDate(s: string): string | null {
  const t = s.trim()
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
  return null
}
function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++ } else q = !q }
    else if (ch === sep && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

/**
 * Interpreta extratos CSV dos bancos portugueses (separador ; ou , e formatos de valor/data comuns).
 * Deteta colunas de data, descrição e valor (ou débito/crédito). Não decide se é rendimento,
 * despesa ou transferência — isso é feito na revisão.
 */
export function parseStatementCsv(text: string): { rows: StatementRow[]; warnings: string[] } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim())
  const warnings: string[] = []
  if (!lines.length) return { rows: [], warnings: ['Ficheiro vazio.'] }
  const sep = [';', ',', '\t'].map((s) => [s, lines.slice(0, 10).reduce((n, l) => n + (l.split(s).length - 1), 0)] as const).sort((a, b) => b[1] - a[1])[0][0]
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  let headerIdx = lines.findIndex((l) => { const n = norm(l); return /data/.test(n) && /(descri|movimento|historico|designa)/.test(n) })
  if (headerIdx < 0) headerIdx = 0
  const header = splitCsvLine(lines[headerIdx], sep).map(norm)
  const find = (re: RegExp) => header.findIndex((h) => re.test(h))
  const iDate = Math.max(0, find(/data (mov|lanc|oper)|^data$|^date/) >= 0 ? find(/data (mov|lanc|oper)|^data$|^date/) : find(/data/))
  const iDesc = find(/descri|movimento|historico|designa|description/)
  const iAmount = find(/^montante|^valor|^importe|amount/)
  const iDebit = find(/debito|debit/)
  const iCredit = find(/credito|credit/)
  if (iDesc < 0 || (iAmount < 0 && iDebit < 0 && iCredit < 0)) {
    return { rows: [], warnings: ['Não foi possível identificar as colunas (data, descrição, valor). Verifique se o ficheiro é o extrato em CSV.'] }
  }
  const rows: StatementRow[] = []
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i], sep)
    const date = parseDate(c[iDate] ?? '')
    if (!date) continue
    let amount: number | null = null
    if (iAmount >= 0) amount = parseAmount(c[iAmount] ?? '')
    else {
      const d = parseAmount(c[iDebit] ?? ''), cr = parseAmount(c[iCredit] ?? '')
      amount = cr ? Math.abs(cr) : d ? -Math.abs(d) : null
    }
    if (amount === null || amount === 0) continue
    rows.push({ key: String(i), date, description: (c[iDesc] ?? '').replace(/\s+/g, ' ').trim() || 'Movimento', amount: r2(amount) })
  }
  if (!rows.length) warnings.push('Nenhum movimento encontrado no ficheiro.')
  return { rows, warnings }
}

/** Sugestão de natureza/categoria a partir da descrição (o utilizador confirma sempre). */
export function suggestForRow(desc: string, amount: number, cats: FinCategory[]): { nature: 'income' | 'expense' | 'transfer' | null; categoryKey: string | null } {
  const d = desc.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (/\b(trf|transf|transferencia|mb way|mbway)\b/.test(d)) return { nature: null, categoryKey: null }   // pode ser própria ou de terceiros: perguntar
  if (/pagamento.*cartao|pag\.? cartao|liquidacao cartao/.test(d)) return { nature: 'transfer', categoryKey: null }
  const rules: [RegExp, string][] = [
    [/mercadona|continente|pingo doce|lidl|aldi|auchan|intermarche|minipreco/, 'alimentacao.supermercado'],
    [/galp|bp |repsol|prio|cepsa|combust/, 'transportes.combustivel'], [/via ?verde|portag/, 'transportes.portagens'],
    [/edp|endesa|iberdrola|goldenergy/, 'contas.eletricidade'], [/aguas|smas|epal/, 'contas.agua'],
    [/meo|nos |vodafone|nowo|digi/, 'contas.internet'], [/farmacia/, 'saude.medicamentos'],
    [/renda|senhorio/, 'habitacao.renda'], [/condominio/, 'habitacao.condominio'], [/restaurante|uber eats|glovo|bolt food/, 'alimentacao.restaurantes'],
    [/comissao|manutencao conta|imposto selo/, 'financeiro.comissoes_bancarias'],
    [/salario|vencimento|ordenado/, 'income.salarios'], [/seg social|subsidio|iefp/, 'income.subsidios'], [/reembolso|devolucao/, 'income.reembolsos'],
  ]
  for (const [re, key] of rules) if (re.test(d)) {
    const cat = cats.find((c) => c.system_key === key)
    if (!cat) continue
    const nature = cat.kind === 'income' ? 'income' : 'expense'
    if ((nature === 'income') !== (amount > 0)) continue
    return { nature, categoryKey: key }
  }
  return { nature: amount > 0 ? null : 'expense', categoryKey: null }
}
