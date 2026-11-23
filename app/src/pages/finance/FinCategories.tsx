import { Plus, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { useHousehold } from '@/hooks/auth'
import { useFinLookups, useInvalidateFinance } from '@/hooks/finance'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import type { FinCategory } from '@/lib/finance'
import { Badge, Page, PageHeader, Segmented, useToast } from '@/components/ui'

export default function FinCategories() {
  const { hid } = useHousehold()
  const L = useFinLookups()
  const inv = useInvalidateFinance()
  const toast = useToast()
  const [kind, setKind] = useState<FinCategory['kind']>('expense')
  const [newName, setNewName] = useState('')
  const [parent, setParent] = useState('')
  const [person, setPerson] = useState('')

  const roots = L.cats.filter((c) => c.kind === kind && !c.parent_id)
  const add = async () => {
    if (!newName.trim()) return
    const { error } = await supabase.from('fin_categories').insert({ household_id: hid, kind, parent_id: parent || null, name: newName.trim(), sort: 9000 })
    if (error) return toast(String(error.message).includes('duplicate') ? 'Já existe uma categoria com esse nome.' : friendlyError(error), 'alert')
    setNewName(''); inv(); toast('Categoria criada.')
  }
  const rename = async (c: FinCategory) => {
    const v = window.prompt('Novo nome', c.name)?.trim()
    if (!v || v === c.name) return
    const { error } = await supabase.from('fin_categories').update({ name: v }).eq('id', c.id)
    if (error) return toast(friendlyError(error), 'alert')
    inv()
  }
  const toggle = async (c: FinCategory) => {
    const { error } = await supabase.from('fin_categories').update({ archived: !c.archived }).eq('id', c.id)
    if (error) return toast(friendlyError(error), 'alert')
    inv()
  }
  const addPerson = async () => {
    if (!person.trim()) return
    const { error } = await supabase.from('fin_people').insert({ household_id: hid, name: person.trim(), kind: 'beneficiary' })
    if (error) return toast(friendlyError(error), 'alert')
    setPerson(''); inv(); toast('Beneficiário adicionado.')
  }

  return (
    <>
      <PageHeader title="Categorias e pessoas" back="/financas" />
      <Page>
        <section className="space-y-2">
          <h2 className="section-title px-1">Pessoas</h2>
          <div className="card divide-y divide-line/70">
            {L.people.map((p) => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                <span className="h-9 w-9 rounded-full bg-navy-50 text-navy-600 grid place-items-center font-bold">{p.name.charAt(0)}</span>
                <span className="flex-1 font-medium">{p.name}</span>
                <Badge tone={p.kind === 'member' ? 'ok' : 'neutral'}>{p.kind === 'member' ? 'Com acesso' : 'Beneficiário'}</Badge>
              </div>
            ))}
            <div className="flex gap-2 p-3">
              <input className="input h-10" placeholder="Novo beneficiário (sem acesso à app)" value={person} onChange={(e) => setPerson(e.target.value)} />
              <button className="btn-secondary h-10 px-3" onClick={addPerson} aria-label="Adicionar beneficiário"><UserPlus size={18} /></button>
            </div>
          </div>
          <p className="text-xs text-ink-muted px-1">Membros com acesso entram por convite (Mais › A casa). Beneficiários, como o Heitor, não têm conta de acesso. As despesas da Olívia registam-se nas categorias “Olívia”.</p>
        </section>

        <section className="space-y-2">
          <h2 className="section-title px-1">Categorias</h2>
          <Segmented value={kind} onChange={(k) => { setKind(k); setParent('') }} options={[{ value: 'expense', label: 'Despesas' }, { value: 'income', label: 'Rendimentos' }, { value: 'savings', label: 'Poupança' }]} />
          <div className="card p-3 space-y-2">
            <select className="input h-10 text-sm" value={parent} onChange={(e) => setParent(e.target.value)} aria-label="Categoria principal"><option value="">Nova categoria principal</option>{roots.map((r) => <option key={r.id} value={r.id}>Subcategoria de {r.name}</option>)}</select>
            <div className="flex gap-2"><input className="input h-10" placeholder="Nome" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
              <button className="btn-primary h-10 px-3" onClick={add} aria-label="Criar categoria"><Plus size={18} /></button></div>
          </div>
          {roots.map((r) => (
            <div key={r.id} className="card overflow-hidden">
              <div className="flex items-center px-4 py-2.5 bg-base/60"><button className="flex-1 text-left font-semibold" onClick={() => rename(r)}>{r.name}</button>
                <button className="text-xs text-ink-muted" onClick={() => toggle(r)}>{r.archived ? 'Reativar' : 'Ocultar'}</button></div>
              {L.cats.filter((c) => c.parent_id === r.id).map((c) => (
                <div key={c.id} className="flex items-center px-4 py-2 border-t border-line/70 text-sm">
                  <button className={`flex-1 text-left ${c.archived ? 'line-through text-ink-muted' : ''}`} onClick={() => rename(c)}>{c.name}</button>
                  <button className="text-xs text-ink-muted" onClick={() => toggle(c)}>{c.archived ? 'Reativar' : 'Ocultar'}</button>
                </div>
              ))}
            </div>
          ))}
          <p className="text-xs text-ink-muted px-1">Toque num nome para o alterar. Categorias ocultas deixam de aparecer nos formulários, mas o histórico mantém-se.</p>
        </section>
      </Page>
    </>
  )
}
