import { Plus, Receipt, ShoppingBasket, Store, Trash2 } from 'lucide-react'
import { useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/hooks/auth'
import { keys, useCategories, useLocations, useProducts, useShopping, useToggleShoppingItem } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { parseDecimal, qty, unitShort } from '@/lib/format'
import { normalizeSearch } from '@/lib/search'
import { itemQuantity, priorityOf, suggestedQuantity } from '@/lib/shopping'
import type { Product, ShoppingItem } from '@/lib/types'
import { ShoppingItemRow, itemName } from '@/components/ShoppingItemRow'
import { Chips, EmptyState, Field, Loading, NumberInput, Page, PageHeader, Sheet, Spinner, useToast } from '@/components/ui'

type F = 'all' | 'priority' | 'manual'

export default function Shopping() {
  const { hid, user } = useHousehold()
  const qc = useQueryClient()
  const toast = useToast()
  const { data: items, isLoading } = useShopping()
  const { data: products = [] } = useProducts()
  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()
  const toggle = useToggleShoppingItem()
  const [filter, setFilter] = useState<F>('all')
  const [categoryId, setCategoryId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [text, setText] = useState('')
  const [adding, setAdding] = useState(false)
  const [edit, setEdit] = useState<ShoppingItem | null>(null)
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const open = (items ?? []).filter((i) => i.status === 'open' && !(i.product_id && byId.get(i.product_id)?.archived))
  const filtered = open.filter((i) => {
    const p = i.product_id ? byId.get(i.product_id) : undefined
    if (filter === 'priority' && priorityOf(i, p) !== 'high') return false
    if (filter === 'manual' && i.source !== 'manual') return false
    if (categoryId && p?.category_id !== categoryId) return false
    if (locationId && p?.location_id !== locationId) return false
    return true
  })
  const sorted = [...filtered].sort((a, b) => Number(a.checked) - Number(b.checked)
    || rank(priorityOf(a, byId.get(a.product_id ?? ''))) - rank(priorityOf(b, byId.get(b.product_id ?? '')))
    || itemName(a, byId.get(a.product_id ?? '')).localeCompare(itemName(b, byId.get(b.product_id ?? ''))))
  const checkedCount = open.filter((i) => i.checked).length

  const suggestions = useMemo(() => {
    const s = normalizeSearch(text)
    if (s.length < 2) return []
    const inList = new Set(open.map((i) => i.product_id))
    return products.filter((p) => !p.archived && !inList.has(p.id) && normalizeSearch(`${p.name} ${p.brand ?? ''}`).includes(s)).slice(0, 5)
  }, [text, products, open])

  const listId = async () => {
    const { data, error } = await supabase.from('shopping_lists').select('id').eq('household_id', hid).eq('is_default', true).single()
    if (error) throw error
    return data.id as string
  }

  const add = async (product?: Product, e?: FormEvent) => {
    e?.preventDefault()
    if (!product && !text.trim()) return
    setAdding(true)
    try {
      const dismissed = product && (items ?? []).find((i) => i.product_id === product.id && i.status === 'dismissed')
      if (dismissed) {
        const { error } = await supabase.from('shopping_list_items').update({ status: 'open', checked: false }).eq('id', dismissed.id)
        if (error) throw error
        setText(''); qc.invalidateQueries({ queryKey: keys.shopping(hid) }); toast('Adicionado à lista.')
        return
      }
      const { error } = await supabase.from('shopping_list_items').insert({
        list_id: await listId(), household_id: hid, product_id: product?.id ?? null,
        custom_name: product ? null : text.trim(), quantity: product ? suggestedQuantity(product) : 1, source: 'manual', created_by: user.id,
      })
      if (error) throw error
      setText('')
      qc.invalidateQueries({ queryKey: keys.shopping(hid) })
      toast('Adicionado à lista.')
    } catch (err) {
      toast(String((err as Error).message).includes('duplicate') ? 'Esse produto já está na lista.' : friendlyError(err), 'alert')
    } finally { setAdding(false) }
  }

  const remove = async (item: ShoppingItem) => {
    // Os itens automáticos ficam "dispensados" até o produto ser reposto; os manuais saem da lista.
    const { error } = await supabase.from('shopping_list_items')
      .update({ status: item.source === 'auto' ? 'dismissed' : 'done', checked: false }).eq('id', item.id)
    if (error) return toast(friendlyError(error), 'alert')
    qc.invalidateQueries({ queryKey: keys.shopping(hid) })
    setEdit(null)
    toast('Removido da lista.')
  }

  const uncheckAll = async () => {
    const ids = open.filter((i) => i.checked).map((i) => i.id)
    const { error } = await supabase.from('shopping_list_items').update({ checked: false, checked_by: null, checked_at: null }).in('id', ids)
    if (error) return toast(friendlyError(error), 'alert')
    qc.invalidateQueries({ queryKey: keys.shopping(hid) })
  }

  return (
    <>
      <PageHeader title="Lista de compras" subtitle={`${open.length - checkedCount} por comprar${checkedCount ? ` · ${checkedCount} encontrados` : ''}`} />
      <Page>
        <div className="grid grid-cols-2 gap-3">
          <Link to="/compras/supermercado" className="btn-primary h-14 rounded-2xl whitespace-nowrap text-[15px] px-3"><Store size={20} />No supermercado</Link>
          <Link to="/faturas/nova" className="btn-secondary h-14 rounded-2xl whitespace-nowrap text-[15px] px-3"><Receipt size={20} />Registar compra</Link>
        </div>

        <form onSubmit={(e) => add(undefined, e)} className="relative">
          <input className="input pr-14" placeholder="Adicionar à lista…" value={text} onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
          <button className="absolute right-1.5 top-1.5 h-9 w-9 rounded-lg bg-sage-600 text-white grid place-items-center" aria-label="Adicionar" disabled={adding}>
            {adding ? <Spinner size={16} className="text-white" /> : <Plus size={20} />}
          </button>
          {suggestions.length > 0 && (
            <div className="absolute z-10 mt-1 w-full card overflow-hidden divide-y divide-line/70 animate-pop">
              {suggestions.map((p) => (
                <button type="button" key={p.id} onClick={() => add(p)} className="w-full flex items-center px-4 py-3 text-left hover:bg-base">
                  <span className="flex-1 font-medium">{p.name}</span>
                  <span className="text-xs text-ink-muted">tem {qty(p.quantity)} {unitShort(p.unit)}</span>
                </button>
              ))}
              <button type="submit" className="w-full px-4 py-3 text-left text-sm text-ink-muted">Adicionar “{text}” como artigo avulso</button>
            </div>
          )}
        </form>

        <Chips value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'Todos', count: open.length },
          { value: 'priority', label: 'Prioritários', count: open.filter((i) => priorityOf(i, byId.get(i.product_id ?? '')) === 'high').length },
          { value: 'manual', label: 'Manuais', count: open.filter((i) => i.source === 'manual').length },
        ]} />
        <div className="grid grid-cols-2 gap-2">
          <select className="input h-10 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoria">
            <option value="">Todas as categorias</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className="input h-10 text-sm" value={locationId} onChange={(e) => setLocationId(e.target.value)} aria-label="Localização">
            <option value="">Todas as localizações</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>

        {isLoading ? <Loading /> : sorted.length === 0 ? (
          <EmptyState icon={<ShoppingBasket />} title={open.length ? 'Nenhum artigo com estes filtros' : 'A lista está vazia'}
            text="Os produtos entram automaticamente quando chegam à quantidade mínima. Também pode adicionar artigos acima." />
        ) : (
          <div className="card divide-y divide-line/70 overflow-hidden">
            {sorted.map((i) => (
              <ShoppingItemRow key={i.id} item={i} product={byId.get(i.product_id ?? '')}
                onToggle={() => toggle.mutate({ item: i, checked: !i.checked })} onOpen={() => setEdit(i)} />
            ))}
          </div>
        )}
        {checkedCount > 0 && <button className="btn-ghost w-full text-sm" onClick={uncheckAll}>Desmarcar todos</button>}
        <p className="text-xs text-ink-muted px-1">Marcar um artigo não altera o stock. O stock e a lista atualizam-se quando a compra é registada (fatura ou registo manual), evitando duplicações.</p>
      </Page>
      {edit && <EditItemSheet item={edit} product={byId.get(edit.product_id ?? '')} onClose={() => setEdit(null)} onRemove={() => remove(edit)} />}
    </>
  )
}

const rank = (p: string) => (p === 'high' ? 0 : p === 'normal' ? 1 : 2)

function EditItemSheet({ item, product, onClose, onRemove }: { item: ShoppingItem; product?: Product; onClose: () => void; onRemove: () => void }) {
  const { hid } = useHousehold()
  const qc = useQueryClient()
  const toast = useToast()
  const [q, setQ] = useState(String(itemQuantity(item, product)).replace('.', ','))
  const [note, setNote] = useState(item.note ?? '')
  const save = async () => {
    const n = parseDecimal(q)
    if (n === null || n <= 0) return toast('Indique uma quantidade válida.', 'alert')
    const { error } = await supabase.from('shopping_list_items').update({ quantity: n, note: note.trim() || null }).eq('id', item.id)
    if (error) return toast(friendlyError(error), 'alert')
    qc.invalidateQueries({ queryKey: keys.shopping(hid) })
    onClose()
  }
  return (
    <Sheet open onClose={onClose} title={itemName(item, product)}
      footer={<div className="grid grid-cols-[auto_1fr] gap-3 py-2">
        <button className="btn-danger px-4" onClick={onRemove} aria-label="Remover da lista"><Trash2 size={18} /></button>
        <button className="btn-primary" onClick={save}>Guardar</button>
      </div>}>
      {product && (
        <div className="grid grid-cols-3 gap-2 text-center">
          {[['Atual', product.quantity], ['Mínimo', product.min_quantity], ['Ideal', product.ideal_quantity]].map(([l, v]) => (
            <div key={l as string} className="rounded-xl bg-base py-2"><p className="font-bold">{qty(v as number)}</p><p className="text-[11px] text-ink-muted">{l}</p></div>
          ))}
        </div>
      )}
      {product && <p className="text-sm text-ink-soft">Sugestão: comprar <b>{qty(suggestedQuantity(product))} {unitShort(product.unit)}</b> para chegar à quantidade ideal.</p>}
      <Field label="Quantidade a comprar"><NumberInput value={q} onChange={setQ} /></Field>
      <Field label="Nota (opcional)"><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: marca branca" /></Field>
      {product && <Link to={`/stock/${product.id}`} className="block text-sm font-semibold text-sage-700">Ver ficha do produto</Link>}
    </Sheet>
  )
}
