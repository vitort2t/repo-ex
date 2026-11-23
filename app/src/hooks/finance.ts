// Consultas e operações do módulo financeiro.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import type { AccountBalance, BudgetStatus, FinAccount, FinBudget, FinCategory, FinGoal, FinPerson, FinRecurring, FinTx, HeitorTransfer } from '@/lib/finance'
import { useHousehold } from './auth'

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export const fkeys = {
  people: (h: string) => ['fin_people', h] as const,
  accounts: (h: string) => ['fin_accounts', h] as const,
  balances: (h: string) => ['fin_balances', h] as const,
  categories: (h: string) => ['fin_categories', h] as const,
  txs: (h: string) => ['fin_txs', h] as const,
  heitor: (h: string) => ['fin_heitor', h] as const,
  budgets: (h: string) => ['fin_budgets', h] as const,
  goals: (h: string) => ['fin_goals', h] as const,
  recurring: (h: string) => ['fin_recurring', h] as const,
}

export function usePeople() {
  const { hid } = useHousehold()
  return useQuery({ queryKey: fkeys.people(hid), staleTime: 5 * 60_000,
    queryFn: () => q<FinPerson[]>(supabase.from('fin_people').select('*').eq('household_id', hid).order('kind').order('name')) })
}
export function useAccounts() {
  const { hid } = useHousehold()
  return useQuery({ queryKey: fkeys.accounts(hid),
    queryFn: async () => (await q<FinAccount[]>(supabase.from('fin_accounts').select('*').eq('household_id', hid).order('sort').order('name')))
      .map((a) => ({ ...a, opening_balance: Number(a.opening_balance), reserved_amount: Number(a.reserved_amount) })) })
}
export function useBalances() {
  const { hid } = useHousehold()
  return useQuery({ queryKey: fkeys.balances(hid),
    queryFn: async () => (await q<AccountBalance[]>(supabase.from('fin_account_balances').select('*').eq('household_id', hid).order('name')))
      .map((b) => ({ ...b, balance: Number(b.balance), pending_out: Number(b.pending_out), pending_in: Number(b.pending_in), reserved_amount: Number(b.reserved_amount), opening_balance: Number(b.opening_balance) })) })
}
export function useFinCategories() {
  const { hid } = useHousehold()
  return useQuery({ queryKey: fkeys.categories(hid), staleTime: 5 * 60_000,
    queryFn: () => q<FinCategory[]>(supabase.from('fin_categories').select('*').eq('household_id', hid).order('sort').order('name')) })
}
/** Todos os movimentos dos últimos 3 anos (volume familiar: milhares de linhas no máximo). */
export function useTransactions() {
  const { hid } = useHousehold()
  return useQuery({ queryKey: fkeys.txs(hid),
    queryFn: async () => {
      const since = `${new Date().getFullYear() - 3}-01-01`
      const rows: FinTx[] = []
      for (let from = 0; ; from += 1000) {
        const page = await q<FinTx[]>(supabase.from('fin_transactions').select('*').eq('household_id', hid).gte('date', since)
          .order('date', { ascending: false }).order('created_at', { ascending: false }).range(from, from + 999))
        rows.push(...page.map((t) => ({ ...t, amount: Number(t.amount) })))
        if (page.length < 1000) break
      }
      return rows
    } })
}
export function useHeitorTransfers() {
  const { hid } = useHousehold()
  return useQuery({ queryKey: fkeys.heitor(hid),
    queryFn: async () => (await q<HeitorTransfer[]>(supabase.from('fin_heitor_transfers').select('*').eq('household_id', hid)))
      .map((h) => ({ ...h, amount_eur: Number(h.amount_eur), amount_brl: h.amount_brl === null ? null : Number(h.amount_brl), fx_rate: h.fx_rate === null ? null : Number(h.fx_rate), fees_eur: Number(h.fees_eur) })) })
}
export function useFinBudgets() {
  const { hid } = useHousehold()
  return useQuery({ queryKey: fkeys.budgets(hid), queryFn: () => q<FinBudget[]>(supabase.from('fin_budgets').select('*').eq('household_id', hid).order('month', { ascending: false })) })
}
export function useBudgetStatus(month: string) {
  const { hid } = useHousehold()
  return useQuery({ queryKey: [...fkeys.budgets(hid), 'status', month],
    queryFn: async () => (await q<BudgetStatus[]>(supabase.rpc('fin_budget_status', { p_household: hid, p_month: `${month}-01` })))
      .map((b) => ({ ...b, amount: Number(b.amount), spent: Number(b.spent), planned: Number(b.planned) })) })
}
export function useGoals() {
  const { hid } = useHousehold()
  return useQuery({ queryKey: fkeys.goals(hid),
    queryFn: async () => (await q<FinGoal[]>(supabase.from('fin_goal_progress').select('*').eq('household_id', hid).order('created_at')))
      .map((g) => ({ ...g, target_amount: Number(g.target_amount), initial_amount: Number(g.initial_amount), accumulated: Number(g.accumulated) })) })
}
export function useRecurring() {
  const { hid } = useHousehold()
  return useQuery({ queryKey: fkeys.recurring(hid),
    queryFn: async () => (await q<FinRecurring[]>(supabase.from('fin_recurring').select('*').eq('household_id', hid).order('next_due')))
      .map((r) => ({ ...r, amount: Number(r.amount) })) })
}

/** Mapas úteis (categorias, pessoas, contas) e identificadores especiais. */
export function useFinLookups() {
  const { data: cats = [] } = useFinCategories()
  const { data: people = [] } = usePeople()
  const { data: accounts = [] } = useAccounts()
  const { user } = useHousehold()
  return useMemo(() => {
    const catMap = new Map(cats.map((c) => [c.id, c]))
    const heitor = people.find((p) => p.kind === 'beneficiary' && p.name.toLowerCase() === 'heitor') ?? null
    const me = people.find((p) => p.user_id === user.id) ?? null
    const savingsAccounts = new Set(accounts.filter((a) => a.kind === 'savings').map((a) => a.id))
    const catName = (id: string | null) => {
      const c = id ? catMap.get(id) : undefined
      if (!c) return 'Sem categoria'
      const p = c.parent_id ? catMap.get(c.parent_id) : undefined
      return p ? `${p.name} › ${c.name}` : c.name
    }
    return { cats, catMap, people, accounts, heitor, me, savingsAccounts, catName,
      personName: (id: string | null) => people.find((p) => p.id === id)?.name ?? '—',
      accountName: (id: string | null) => accounts.find((a) => a.id === id)?.name ?? 'Sem conta' }
  }, [cats, people, accounts, user.id])
}

export function useInvalidateFinance() {
  const qc = useQueryClient()
  const { hid } = useHousehold()
  return () => { for (const k of Object.values(fkeys)) qc.invalidateQueries({ queryKey: k(hid) }); qc.invalidateQueries({ queryKey: ['notifications', hid] }) }
}

export type MovementPayload = Record<string, unknown>
export function useCreateMovement() {
  const { hid } = useHousehold()
  const inv = useInvalidateFinance()
  return useMutation({
    mutationFn: async ({ clientId, payload }: { clientId: string; payload: MovementPayload }) => {
      const { data, error } = await supabase.rpc('fin_create_movement', { p_household: hid, p_client_id: clientId, p_payload: payload })
      if (error) throw error
      return data as FinTx[]
    },
    onSuccess: inv,
  })
}
