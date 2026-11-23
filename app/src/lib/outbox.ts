// Fila de operações feitas sem internet (guardada no IndexedDB).
// Cada operação tem um ID gerado no dispositivo; o servidor ignora repetições,
// por isso reenviar nunca duplica movimentos.
import { createStore, del, entries, set } from 'idb-keyval'
import { supabase } from './supabase'
import { errorCode, isNetworkError } from './errors'

const store = createStore('casa-em-stock-outbox', 'ops')

export type MovementOp = {
  kind: 'movement'
  id: string
  household_id: string
  created_at: string
  args: {
    p_id: string; p_product_id: string; p_direction: 'in' | 'out'; p_quantity: number
    p_reason: string; p_occurred_at: string; p_allow_negative: boolean; p_expires_on: string | null; p_note: string | null
  }
}
export type ShoppingCheckOp = {
  kind: 'shopping_check'; id: string; household_id: string; created_at: string
  args: { item_id: string; checked: boolean; user_id: string }
}
export type OutboxOp = MovementOp | ShoppingCheckOp

type Listener = (pending: OutboxOp[]) => void
const listeners = new Set<Listener>()
export function onOutboxChange(l: Listener) { listeners.add(l); return () => { listeners.delete(l) } }
async function notify() { const p = await pending(); listeners.forEach((l) => l(p)) }

export async function enqueue(op: OutboxOp) { await set(op.id, op, store); await notify() }
export async function pending(): Promise<OutboxOp[]> {
  try {
    const all = await entries<string, OutboxOp>(store)
    return all.map(([, v]) => v).sort((a, b) => a.created_at.localeCompare(b.created_at))
  } catch { return [] }
}

export type FlushResult = { sent: number; failed: { op: OutboxOp; message: string }[] }
let flushing: Promise<FlushResult> | null = null

/** Envia as operações pendentes, pela ordem em que foram feitas. */
export function flush(): Promise<FlushResult> {
  if (flushing) return flushing
  flushing = (async () => {
    const result: FlushResult = { sent: 0, failed: [] }
    for (const op of await pending()) {
      try {
        if (op.kind === 'movement') {
          const { error } = await supabase.rpc('record_movement', op.args)
          if (error) throw error
        } else {
          const { error } = await supabase.from('shopping_list_items').update({
            checked: op.args.checked, checked_by: op.args.checked ? op.args.user_id : null,
            checked_at: op.args.checked ? op.created_at : null,
          }).eq('id', op.args.item_id)
          if (error) throw error
        }
        await del(op.id, store)
        result.sent++
      } catch (e) {
        if (isNetworkError(e)) break // continua offline: tenta mais tarde
        // Erro definitivo (ex. stock insuficiente): retira da fila e informa o utilizador.
        await del(op.id, store)
        result.failed.push({ op, message: errorCode(e) })
      }
    }
    await notify()
    return result
  })().finally(() => { flushing = null })
  return flushing
}
