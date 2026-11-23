import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/hooks/auth'
import { keys, useCategories, useLocations, useProducts } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { groupBy } from '@/lib/search'
import { Page, PageHeader, useConfirm, useToast } from '@/components/ui'

const GROUPS = ['Alimentação', 'Higiene pessoal', 'Limpeza', 'Casa', 'Outros']

export default function Taxonomy({ kind }: { kind: 'categories' | 'locations' }) {
  const { hid } = useHousehold()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()
  const { data: products = [] } = useProducts()
  const [name, setName] = useState('')
  const [grp, setGrp] = useState(GROUPS[0])
  const isCat = kind === 'categories'
  const key = isCat ? keys.categories(hid) : keys.locations(hid)

  const add = async () => {
    if (!name.trim()) return
    const row: Record<string, unknown> = isCat ? { household_id: hid, name: name.trim(), grp, sort: 900 } : { household_id: hid, name: name.trim(), sort: 900 }
    const { error } = await supabase.from(kind).insert(row)
    if (error) return toast(String(error.message).includes('duplicate') ? 'Já existe com esse nome.' : friendlyError(error), 'alert')
    setName(''); qc.invalidateQueries({ queryKey: key }); toast('Adicionado.')
  }
  const remove = async (id: string, label: string) => {
    const used = products.filter((p) => (isCat ? p.category_id : p.location_id) === id).length
    if (!(await confirm({ title: `Apagar “${label}”?`, text: used ? `${used} produto(s) ficarão sem ${isCat ? 'categoria' : 'localização'}.` : undefined, confirm: 'Apagar', danger: true }))) return
    const { error } = await supabase.from(kind).delete().eq('id', id)
    if (error) return toast(friendlyError(error), 'alert')
    qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: keys.products(hid) })
  }
  const rename = async (id: string, current: string) => {
    const v = window.prompt('Novo nome', current)?.trim()
    if (!v || v === current) return
    const { error } = await supabase.from(kind).update({ name: v }).eq('id', id)
    if (error) return toast(friendlyError(error), 'alert')
    qc.invalidateQueries({ queryKey: key })
  }

  const Row = ({ id, label }: { id: string; label: string }) => (
    <div className="flex items-center gap-2 px-4 py-2.5">
      <button className="flex-1 text-left" onClick={() => rename(id, label)}>{label}</button>
      <span className="text-xs text-ink-muted">{products.filter((p) => !p.archived && (isCat ? p.category_id : p.location_id) === id).length}</span>
      <button aria-label="Apagar" className="h-9 w-9 grid place-items-center rounded-full hover:bg-sand text-ink-muted" onClick={() => remove(id, label)}><Trash2 size={16} /></button>
    </div>
  )

  return (
    <>
      <PageHeader title={isCat ? 'Categorias' : 'Localizações'} back />
      <Page>
        <div className="card p-4 space-y-3">
          {isCat && <select className="input" value={grp} onChange={(e) => setGrp(e.target.value)} aria-label="Grupo">{GROUPS.map((g) => <option key={g}>{g}</option>)}</select>}
          <div className="flex gap-2">
            <input className="input" placeholder={isCat ? 'Nova categoria' : 'Nova localização'} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
            <button className="btn-primary w-12 px-0" aria-label="Adicionar" onClick={add}><Plus size={20} /></button>
          </div>
        </div>
        {isCat ? Object.entries(groupBy(categories, (c) => c.grp)).map(([g, cs]) => (
          <section key={g} className="space-y-2"><h2 className="section-title px-1">{g}</h2>
            <div className="card divide-y divide-line/70">{cs.map((c) => <Row key={c.id} id={c.id} label={c.name} />)}</div></section>
        )) : <div className="card divide-y divide-line/70">{locations.map((l) => <Row key={l.id} id={l.id} label={l.name} />)}</div>}
        <p className="text-xs text-ink-muted px-1">Toque num nome para o alterar.</p>
      </Page>
    </>
  )
}
