// Camada de dados: consultas à base de dados (TanStack Query) e operações.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { enqueue, flush, onOutboxChange, pending, type MovementOp, type OutboxOp } from '@/lib/outbox'
import { isNetworkError } from '@/lib/errors'
import type {
  AppNotification, AuditRow, Budget, Category, Invite, Location, Lot, Member, Movement, PriceRow, Product, Profile,
  Purchase, PurchaseItem, Receipt, ReceiptItem, ShoppingItem,
} from '@/lib/types'
import { useHousehold } from './auth'

async function q<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw error
  return data as T
}

export const keys = {
  products: (h: string) => ['products', h] as const,
  categories: (h: string) => ['categories', h] as const,
  locations: (h: string) => ['locations', h] as const,
  members: (h: string) => ['members', h] as const,
  shopping: (h: string) => ['shopping', h] as const,
  purchases: (h: string) => ['purchases', h] as const,
  lots: (h: string) => ['lots', h] as const,
  movements: (h: string, pid?: string) => (pid ? ['movements', h, pid] : ['movements', h]) as readonly unknown[],
  receipts: (h: string) => ['receipts', h] as const,
  notifications: (h: string) => ['notifications', h] as const,
  budgets: (h: string) => ['budgets', h] as const,
}

// ---------------------------------------------------------------- leituras

export function useProducts() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: keys.products(hid),
    queryFn: () => q<Product[]>(supabase.from('products').select('*').eq('household_id', hid).order('name')),
  })
}

export function useCategories() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: keys.categories(hid),
    queryFn: () => q<Category[]>(supabase.from('categories').select('*').eq('household_id', hid).order('sort').order('name')),
    staleTime: 5 * 60_000,
  })
}

export function useLocations() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: keys.locations(hid),
    queryFn: () => q<Location[]>(supabase.from('locations').select('*').eq('household_id', hid).order('sort').order('name')),
    staleTime: 5 * 60_000,
  })
}

export type MemberWithProfile = Member & { profile: Profile | null }
export function useMembers() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: keys.members(hid),
    queryFn: async () => {
      const members = await q<Member[]>(supabase.from('household_members').select('*').eq('household_id', hid))
      const profiles = await q<Profile[]>(supabase.from('profiles').select('id, display_name, email').in('id', members.map((m) => m.user_id)))
      return members.map((m) => ({ ...m, profile: profiles.find((p) => p.id === m.user_id) ?? null })) as MemberWithProfile[]
    },
    staleTime: 5 * 60_000,
  })
}

/** Nome curto de quem fez uma operação. */
export function useWho() {
  const { data } = useMembers()
  const { user } = useHousehold()
  return (uid: string | null | undefined) => {
    if (!uid) return '—'
    if (uid === user.id) return 'Eu'
    return data?.find((m) => m.user_id === uid)?.profile?.display_name ?? 'Membro'
  }
}

export function useShopping() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: keys.shopping(hid),
    queryFn: () => q<ShoppingItem[]>(supabase.from('shopping_list_items').select('*').eq('household_id', hid).in('status', ['open', 'dismissed']).order('created_at')),
  })
}

export function usePurchases() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: keys.purchases(hid),
    queryFn: async () => {
      const since = `${new Date().getFullYear() - 3}-01-01`
      const rows: Purchase[] = []
      // paginação (limite de 1000 linhas por pedido)
      for (let from = 0; ; from += 1000) {
        const page = await q<Purchase[]>(supabase.from('purchases').select('*').eq('household_id', hid)
          .gte('purchased_at', since).order('purchased_at', { ascending: false }).order('created_at', { ascending: false }).range(from, from + 999))
        rows.push(...page.map((p) => ({ ...p, total_paid: Number(p.total_paid) })))
        if (page.length < 1000) break
      }
      return rows
    },
  })
}

export function usePurchase(id: string | undefined) {
  return useQuery({
    queryKey: ['purchase', id],
    enabled: !!id,
    queryFn: async () => {
      const purchase = await q<Purchase>(supabase.from('purchases').select('*').eq('id', id!).single())
      const items = await q<PurchaseItem[]>(supabase.from('purchase_items').select('*').eq('purchase_id', id!).order('created_at'))
      return { purchase, items }
    },
  })
}

export function usePurchaseItemsInRange(from: string, to: string) {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: ['purchase_items', hid, from, to],
    queryFn: async () => {
      const rows = await q<(PurchaseItem & { purchases: Pick<Purchase, 'purchased_at' | 'store_chain' | 'status'> })[]>(
        supabase.from('purchase_items').select('*, purchases!inner(purchased_at, store_chain, status)')
          .eq('household_id', hid).eq('purchases.status', 'confirmed')
          .gte('purchases.purchased_at', from).lte('purchases.purchased_at', to).limit(5000))
      return rows
    },
  })
}

export function useLots() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: keys.lots(hid),
    queryFn: () => q<Lot[]>(supabase.from('inventory_lots').select('*').eq('household_id', hid).gt('quantity', 0).order('expires_on')),
  })
}

export function useMovements(productId?: string, limit = 150) {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: [...keys.movements(hid, productId), limit],
    queryFn: () => {
      let query = supabase.from('stock_movements').select('*').eq('household_id', hid)
      if (productId) query = query.eq('product_id', productId)
      return q<Movement[]>(query.order('occurred_at', { ascending: false }).order('created_at', { ascending: false }).limit(limit))
    },
  })
}

export function usePrices(productId: string | undefined) {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: ['prices', hid, productId],
    enabled: !!productId,
    queryFn: () => q<PriceRow[]>(supabase.from('price_history').select('*').eq('household_id', hid).eq('product_id', productId!).order('purchased_at')),
  })
}

export function useReceipts() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: keys.receipts(hid),
    queryFn: () => q<Receipt[]>(supabase.from('receipts').select('*').eq('household_id', hid)
      .in('status', ['uploaded', 'processing', 'parsed', 'failed']).order('created_at', { ascending: false })),
  })
}

export function useReceipt(id: string | undefined) {
  return useQuery({
    queryKey: ['receipt', id],
    enabled: !!id,
    queryFn: async () => {
      const receipt = await q<Receipt>(supabase.from('receipts').select('*').eq('id', id!).single())
      const items = await q<ReceiptItem[]>(supabase.from('receipt_items').select('*').eq('receipt_id', id!).order('line_no'))
      return { receipt, items }
    },
    networkMode: 'online',
  })
}

export function useReceiptFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['receipt-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    gcTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('receipts').createSignedUrl(path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export function useProductPhotoUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['photo-url', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    gcTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('product-photos').createSignedUrl(path!, 3600)
      if (error) throw error
      return data.signedUrl
    },
  })
}

export type NotificationWithRead = AppNotification & { read: boolean }
export function useNotifications() {
  const { hid, user } = useHousehold()
  return useQuery({
    queryKey: keys.notifications(hid),
    queryFn: async () => {
      const list = await q<AppNotification[]>(supabase.from('notifications').select('*').eq('household_id', hid).order('created_at', { ascending: false }).limit(60))
      const reads = list.length
        ? await q<{ notification_id: string }[]>(supabase.from('notification_reads').select('notification_id').eq('user_id', user.id).in('notification_id', list.map((n) => n.id)))
        : []
      const readSet = new Set(reads.map((r) => r.notification_id))
      return list.map((n) => ({ ...n, read: readSet.has(n.id) })) as NotificationWithRead[]
    },
  })
}

export function useBudgets() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: keys.budgets(hid),
    queryFn: () => q<Budget[]>(supabase.from('monthly_budgets').select('*').eq('household_id', hid).order('month', { ascending: false })),
  })
}

/** Orçamento em vigor num mês (o definido para esse mês ou o mais recente anterior). */
export function budgetForMonth(budgets: Budget[] | undefined, monthIso: string): number | null {
  const m = monthIso.slice(0, 7) + '-01'
  const b = (budgets ?? []).filter((x) => x.month <= m).sort((a, c) => c.month.localeCompare(a.month))[0]
  return b ? Number(b.amount) : null
}

export function useInvites() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: ['invites', hid],
    queryFn: () => q<Invite[]>(supabase.from('household_invites').select('*').eq('household_id', hid).order('created_at', { ascending: false })),
  })
}

export function useAudit() {
  const { hid } = useHousehold()
  return useQuery({
    queryKey: ['audit', hid],
    queryFn: () => q<AuditRow[]>(supabase.from('audit_log').select('*').eq('household_id', hid).order('created_at', { ascending: false }).limit(100)),
  })
}

// ---------------------------------------------------------------- sincronização em tempo real

const TABLE_KEYS: Record<string, (h: string) => readonly unknown[]> = {
  products: (h) => keys.products(h),
  stock_movements: (h) => keys.movements(h),
  inventory_lots: (h) => keys.lots(h),
  shopping_list_items: (h) => keys.shopping(h),
  purchases: (h) => keys.purchases(h),
  receipts: (h) => keys.receipts(h),
  notifications: (h) => keys.notifications(h),
  categories: (h) => keys.categories(h),
  locations: (h) => keys.locations(h),
  monthly_budgets: (h) => keys.budgets(h),
  household_members: (h) => keys.members(h),
  fin_transactions: (h) => ['fin_txs', h],
  fin_accounts: (h) => ['fin_accounts', h],
  fin_categories: (h) => ['fin_categories', h],
  fin_goals: (h) => ['fin_goals', h],
  fin_recurring: (h) => ['fin_recurring', h],
  fin_budgets: (h) => ['fin_budgets', h],
  fin_people: (h) => ['fin_people', h],
  fin_heitor_transfers: (h) => ['fin_heitor', h],
}

export type SyncStatus = 'connecting' | 'live' | 'offline'

/** Subscreve as alterações da casa: o que um membro faz aparece de imediato no outro. */
export function useRealtimeSync(hid: string | undefined): SyncStatus {
  const qc = useQueryClient()
  const [status, setStatus] = useState<SyncStatus>('connecting')
  useEffect(() => {
    if (!hid) return
    const channel = supabase.channel(`household:${hid}`)
    for (const table of Object.keys(TABLE_KEYS)) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `household_id=eq.${hid}` }, (payload) => {
        qc.invalidateQueries({ queryKey: TABLE_KEYS[table](hid) })
        // A lista automática muda quando o stock muda (inserções/remoções feitas pela base de dados).
        if (table === 'products') qc.invalidateQueries({ queryKey: keys.shopping(hid) })
        // Saldos e progresso dos objetivos derivam dos movimentos.
        if (table === 'fin_transactions' || table === 'fin_accounts' || table === 'purchases') {
          qc.invalidateQueries({ queryKey: ['fin_balances', hid] })
          qc.invalidateQueries({ queryKey: ['fin_goals', hid] })
          qc.invalidateQueries({ queryKey: ['fin_txs', hid] })
          qc.invalidateQueries({ queryKey: ['fin_budgets', hid] })
        }
        if (table === 'purchases' || table === 'stock_movements') {
          qc.invalidateQueries({ queryKey: ['purchase_items', hid] })
          qc.invalidateQueries({ queryKey: ['prices', hid] })
          const row = (payload.new ?? payload.old) as { id?: string }
          if (table === 'purchases' && row?.id) qc.invalidateQueries({ queryKey: ['purchase', row.id] })
        }
        if (table === 'receipts') {
          const row = payload.new as { id?: string }
          if (row?.id) qc.invalidateQueries({ queryKey: ['receipt', row.id] })
        }
      })
    }
    channel.subscribe((s) => {
      if (s === 'SUBSCRIBED') {
        setStatus('live')
        qc.invalidateQueries() // ao (re)ligar, garantir que nada ficou por atualizar
      } else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('offline')
    })
    return () => { supabase.removeChannel(channel) }
  }, [hid, qc])
  return status
}

// ---------------------------------------------------------------- movimentos (com suporte offline)

export type MovementInput = {
  product: Product
  direction: 'in' | 'out'
  quantity: number
  reason: string
  occurredAt?: string
  allowNegative?: boolean
  expiresOn?: string | null
  note?: string | null
}

export function useRecordMovement() {
  const qc = useQueryClient()
  const { hid, user } = useHousehold()
  return useMutation({
    mutationFn: async (m: MovementInput): Promise<{ queued: boolean }> => {
      const op: MovementOp = {
        kind: 'movement', id: crypto.randomUUID(), household_id: hid, created_at: new Date().toISOString(),
        args: {
          p_id: '', p_product_id: m.product.id, p_direction: m.direction, p_quantity: m.quantity, p_reason: m.reason,
          p_occurred_at: m.occurredAt ?? new Date().toISOString(), p_allow_negative: !!m.allowNegative,
          p_expires_on: m.expiresOn ?? null, p_note: m.note ?? null,
        },
      }
      op.args.p_id = op.id
      // Atualização otimista: a quantidade muda logo no ecrã.
      const delta = m.direction === 'in' ? m.quantity : -m.quantity
      qc.setQueryData<Product[]>(keys.products(hid), (old) => old?.map((p) => (p.id === m.product.id ? {
        ...p, quantity: Math.round((Number(p.quantity) + delta) * 1000) / 1000,
        ...(m.direction === 'in' ? { last_in_at: op.args.p_occurred_at } : { last_out_at: op.args.p_occurred_at }),
      } : p)))
      if (!navigator.onLine) { await enqueue(op); return { queued: true } }
      const { error } = await supabase.rpc('record_movement', op.args)
      if (error) {
        if (isNetworkError(error)) { await enqueue(op); return { queued: true } }
        throw error
      }
      return { queued: false }
    },
    onError: () => { qc.invalidateQueries({ queryKey: keys.products(hid) }) },
    onSettled: (res) => {
      if (res?.queued) return
      qc.invalidateQueries({ queryKey: keys.products(hid) })
      qc.invalidateQueries({ queryKey: keys.movements(hid) })
      qc.invalidateQueries({ queryKey: keys.lots(hid) })
      qc.invalidateQueries({ queryKey: keys.shopping(hid) })
    },
    meta: { user: user.id },
  })
}

export function useToggleShoppingItem() {
  const qc = useQueryClient()
  const { hid, user } = useHousehold()
  return useMutation({
    mutationFn: async ({ item, checked }: { item: ShoppingItem; checked: boolean }) => {
      qc.setQueryData<ShoppingItem[]>(keys.shopping(hid), (old) => old?.map((i) => (i.id === item.id ? { ...i, checked, checked_by: checked ? user.id : null } : i)))
      const op: OutboxOp = { kind: 'shopping_check', id: crypto.randomUUID(), household_id: hid, created_at: new Date().toISOString(),
                             args: { item_id: item.id, checked, user_id: user.id } }
      if (!navigator.onLine) { await enqueue(op); return }
      const { error } = await supabase.from('shopping_list_items').update({
        checked, checked_by: checked ? user.id : null, checked_at: checked ? new Date().toISOString() : null,
      }).eq('id', item.id)
      if (error) {
        if (isNetworkError(error)) { await enqueue(op); return }
        qc.invalidateQueries({ queryKey: keys.shopping(hid) })
        throw error
      }
    },
  })
}

/** Número de operações pendentes e envio automático quando a ligação volta. */
export function useOutbox(onFailures: (messages: string[]) => void) {
  const qc = useQueryClient()
  const [count, setCount] = useState(0)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  useEffect(() => {
    pending().then((p) => setCount(p.length))
    const off = onOutboxChange((p) => setCount(p.length))
    const run = async () => {
      const r = await flush()
      if (r.sent || r.failed.length) qc.invalidateQueries()
      if (r.failed.length) onFailures(r.failed.map((f) => f.message))
    }
    const up = () => { setOnline(true); run() }
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    const t = setInterval(() => { if (navigator.onLine) run() }, 30_000)
    if (navigator.onLine) run()
    return () => { off(); window.removeEventListener('online', up); window.removeEventListener('offline', down); clearInterval(t) }
  }, [qc, onFailures])
  return { pendingCount: count, online }
}
