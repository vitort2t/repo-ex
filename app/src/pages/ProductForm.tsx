import { Camera, Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/hooks/auth'
import { keys, useCategories, useLocations, useProductPhotoUrl, useProducts } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { compressImage } from '@/lib/files'
import { parseDecimal, UNITS } from '@/lib/format'
import { groupBy } from '@/lib/search'
import { Field, Loading, NumberInput, Page, PageHeader, Spinner, useToast } from '@/components/ui'

export default function ProductForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const editing = !!id
  const { hid } = useHousehold()
  const qc = useQueryClient()
  const nav = useNavigate()
  const toast = useToast()
  const { data: products, isLoading } = useProducts()
  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()
  const existing = products?.find((p) => p.id === id)

  const [name, setName] = useState(params.get('nome') ?? '')
  const [brand, setBrand] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [unit, setUnit] = useState('un')
  const [quantity, setQuantity] = useState('')
  const [minQ, setMinQ] = useState('1')
  const [idealQ, setIdealQ] = useState('3')
  const [expires, setExpires] = useState('')
  const [packSize, setPackSize] = useState('')
  const [packUnit, setPackUnit] = useState('')
  const [autoRestock, setAutoRestock] = useState(true)
  const [notes, setNotes] = useState('')
  const [photoPath, setPhotoPath] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { data: photoUrl } = useProductPhotoUrl(photoPath)

  useEffect(() => {
    if (!existing) return
    setName(existing.name); setBrand(existing.brand ?? ''); setCategoryId(existing.category_id ?? ''); setLocationId(existing.location_id ?? '')
    setUnit(existing.unit); setMinQ(String(existing.min_quantity).replace('.', ',')); setIdealQ(String(existing.ideal_quantity).replace('.', ','))
    setPackSize(existing.package_size ? String(existing.package_size).replace('.', ',') : ''); setPackUnit(existing.package_unit ?? '')
    setAutoRestock(existing.auto_restock); setNotes(existing.notes ?? ''); setPhotoPath(existing.photo_path)
  }, [existing])

  if (editing && isLoading) return <Loading />

  const uploadPhoto = async (file: File) => {
    setUploading(true)
    try {
      const blob = await compressImage(file, 900, 0.82)
      const path = `${hid}/${crypto.randomUUID()}.jpg`
      const { error } = await supabase.storage.from('product-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (error) throw error
      setPhotoPath(path)
    } catch (e) { toast(friendlyError(e), 'alert') } finally { setUploading(false) }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    const min = parseDecimal(minQ) ?? 0, ideal = parseDecimal(idealQ) ?? 0
    const q = parseDecimal(quantity) ?? 0
    if (!name.trim()) return setErr('Indique o nome do produto.')
    if (min < 0 || ideal < 0 || q < 0) return setErr('As quantidades não podem ser negativas.')
    if (ideal && ideal < min) return setErr('A quantidade ideal deve ser igual ou superior à mínima.')
    const ps = parseDecimal(packSize)
    if (ps !== null && ps <= 0) return setErr('O tamanho da embalagem deve ser maior que zero.')
    if (ps !== null && !packUnit) return setErr('Indique a unidade da embalagem (kg, litros ou unidades).')
    setBusy(true)
    try {
      if (editing) {
        const { error } = await supabase.from('products').update({
          name: name.trim(), brand: brand.trim() || null, category_id: categoryId || null, location_id: locationId || null,
          unit, min_quantity: min, ideal_quantity: Math.max(ideal, min), package_size: ps, package_unit: ps ? packUnit : null,
          auto_restock: autoRestock, notes: notes.trim() || null, photo_path: photoPath,
        }).eq('id', id!)
        if (error) throw error
        toast('Alterações guardadas.')
      } else {
        const { error } = await supabase.rpc('create_product', {
          p_household: hid, p_name: name.trim(), p_brand: brand.trim() || null, p_category_id: categoryId || null,
          p_location_id: locationId || null, p_unit: unit, p_quantity: q, p_min_quantity: min, p_ideal_quantity: ideal,
          p_expires_on: expires || null, p_notes: notes.trim() || null, p_package_size: ps, p_package_unit: ps ? packUnit : null,
          p_auto_restock: autoRestock, p_photo_path: photoPath, p_id: crypto.randomUUID(),
        })
        if (error) throw error
        toast('Produto criado.')
      }
      qc.invalidateQueries({ queryKey: keys.products(hid) })
      qc.invalidateQueries({ queryKey: keys.shopping(hid) })
      qc.invalidateQueries({ queryKey: keys.lots(hid) })
      nav(editing ? `/stock/${id}` : '/stock', { replace: true })
    } catch (e2) { setErr(friendlyError(e2)) } finally { setBusy(false) }
  }

  return (
    <>
      <PageHeader title={editing ? 'Editar produto' : 'Novo produto'} back />
      <Page>
        <form onSubmit={submit} className="space-y-4">
          <div className="card p-4 space-y-4">
            <div className="flex items-center gap-4">
              <label className="relative h-20 w-20 rounded-2xl bg-sand grid place-items-center overflow-hidden cursor-pointer shrink-0 text-ink-muted">
                {uploading ? <Spinner /> : photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : <Camera size={26} />}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => e.target.files?.[0] && uploadPhoto(e.target.files[0])} />
              </label>
              <div className="text-sm text-ink-muted flex-1">Fotografia opcional
                {photoPath && <button type="button" onClick={() => setPhotoPath(null)} className="flex items-center gap-1 text-alert-ink mt-1"><Trash2 size={14} />Remover</button>}
              </div>
            </div>
            <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Leite meio-gordo" required /></Field>
            <Field label="Marca (opcional)"><input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Categoria">
                <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">Sem categoria</option>
                  {Object.entries(groupBy(categories, (c) => c.grp)).map(([g, cs]) => <optgroup key={g} label={g}>{cs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
                </select>
              </Field>
              <Field label="Localização">
                <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
                  <option value="">—</option>
                  {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="card p-4 space-y-4">
            <Field label="Unidade de medida">
              <select className="input" value={unit} onChange={(e) => setUnit(e.target.value)}>{UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}</select>
            </Field>
            {!editing && <div className="grid grid-cols-2 gap-3">
              <Field label="Quantidade atual"><NumberInput value={quantity} onChange={setQuantity} placeholder="0" /></Field>
              <Field label="Validade (opcional)"><input type="date" className="input" value={expires} onChange={(e) => setExpires(e.target.value)} /></Field>
            </div>}
            {editing && <p className="text-xs text-ink-muted">A quantidade altera-se com os botões Adicionar / Retirar, para ficar registada no histórico.</p>}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantidade mínima" hint="Abaixo disto entra na lista."><NumberInput value={minQ} onChange={setMinQ} /></Field>
              <Field label="Quantidade ideal" hint="Quanto gosta de ter."><NumberInput value={idealQ} onChange={setIdealQ} /></Field>
            </div>
            <label className="flex items-center gap-3 py-1">
              <input type="checkbox" className="h-5 w-5 accent-[#62805A]" checked={autoRestock} onChange={(e) => setAutoRestock(e.target.checked)} />
              <span className="text-[15px]">Sugerir reposição automaticamente na lista de compras</span>
            </label>
          </div>

          <div className="card p-4 space-y-3">
            <p className="text-sm font-semibold">Embalagem <span className="font-normal text-ink-muted">(para comparar preços)</span></p>
            <div className="grid grid-cols-2 gap-3">
              <NumberInput value={packSize} onChange={setPackSize} placeholder="Ex.: 1" ariaLabel="Tamanho da embalagem" />
              <select className="input" value={packUnit} onChange={(e) => setPackUnit(e.target.value)} aria-label="Unidade da embalagem">
                <option value="">—</option><option value="kg">kg</option><option value="l">litros</option><option value="un">unidades</option>
              </select>
            </div>
            <p className="text-xs text-ink-muted">Ex.: arroz de 1 kg → “1 kg”; ovos em dúzia → “12 unidades”; detergente de 2,5 L → “2,5 litros”.</p>
          </div>

          <div className="card p-4"><Field label="Observações"><textarea className="input h-24 py-3" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field></div>

          {err && <p className="text-sm text-alert-ink bg-alert-bg rounded-xl px-3.5 py-2.5">{err}</p>}
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : editing ? 'Guardar alterações' : 'Criar produto'}</button>
        </form>
      </Page>
    </>
  )
}
