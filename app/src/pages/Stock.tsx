import { Boxes, CalendarClock, Plus, Search, SlidersHorizontal, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useCategories, useLocations, useLots, useProducts } from '@/hooks/data'
import { daysUntil, groupBy, normalizeSearch } from '@/lib/search'
import { stockState } from '@/lib/shopping'
import type { Product } from '@/lib/types'
import { MovementSheet } from '@/components/MovementSheet'
import { ProductRow } from '@/components/ProductRow'
import { Chips, EmptyState, ErrorBox, Loading, Page, PageHeader, Sheet, cx } from '@/components/ui'

type Filter = 'all' | 'available' | 'low' | 'out' | 'expiring' | 'recent'

export default function Stock() {
  const [params] = useSearchParams()
  const { data: products, isLoading, error, refetch } = useProducts()
  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()
  const { data: lots = [] } = useLots()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>((params.get('filtro') as Filter) || 'all')
  const [categoryId, setCategoryId] = useState('')
  const [locationId, setLocationId] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [move, setMove] = useState<{ p: Product; d: 'in' | 'out' } | null>(null)

  const nextExpiry = useMemo(() => {
    const m = new Map<string, number>()
    for (const l of lots) { const d = daysUntil(l.expires_on); if (!m.has(l.product_id) || d < m.get(l.product_id)!) m.set(l.product_id, d) }
    return m
  }, [lots])
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])
  const locById = useMemo(() => new Map(locations.map((l) => [l.id, l])), [locations])

  const active = useMemo(() => (products ?? []).filter((p) => !p.archived), [products])
  const counts = useMemo(() => ({
    all: active.length,
    available: active.filter((p) => Number(p.quantity) > 0).length,
    low: active.filter((p) => stockState(p) === 'low').length,
    out: active.filter((p) => stockState(p) === 'out').length,
    expiring: active.filter((p) => (nextExpiry.get(p.id) ?? 999) <= 15).length,
  }), [active, nextExpiry])

  const list = useMemo(() => {
    const s = normalizeSearch(search)
    const weekAgo = Date.now() - 7 * 86400000
    let r = active.filter((p) => {
      if (categoryId && p.category_id !== categoryId) return false
      if (locationId && p.location_id !== locationId) return false
      switch (filter) {
        case 'available': if (Number(p.quantity) <= 0) return false; break
        case 'low': if (stockState(p) !== 'low') return false; break
        case 'out': if (stockState(p) !== 'out') return false; break
        case 'expiring': if ((nextExpiry.get(p.id) ?? 999) > 15) return false; break
        case 'recent': if (!p.last_in_at || new Date(p.last_in_at).getTime() < weekAgo) if (new Date(p.created_at).getTime() < weekAgo) return false; break
      }
      if (!s) return true
      const hay = normalizeSearch([p.name, p.brand, catById.get(p.category_id ?? '')?.name, catById.get(p.category_id ?? '')?.grp,
                                   locById.get(p.location_id ?? '')?.name, ...(p.aliases ?? [])].filter(Boolean).join(' '))
      return s.split(' ').every((w) => hay.includes(w))
    })
    if (filter === 'expiring') r = [...r].sort((a, b) => (nextExpiry.get(a.id) ?? 999) - (nextExpiry.get(b.id) ?? 999))
    if (filter === 'recent') r = [...r].sort((a, b) => (b.last_in_at ?? b.created_at).localeCompare(a.last_in_at ?? a.created_at))
    return r
  }, [active, search, filter, categoryId, locationId, nextExpiry, catById, locById])

  const activeFilters = (categoryId ? 1 : 0) + (locationId ? 1 : 0)

  return (
    <>
      <PageHeader title="Stock" subtitle={`${counts.all} produtos`}
        actions={<>
          <Link to="/stock/validades" aria-label="Validades" className="h-10 w-10 grid place-items-center rounded-full hover:bg-champagne"><CalendarClock size={21} /></Link>
          <Link to="/stock/novo" aria-label="Novo produto" className="h-10 w-10 grid place-items-center rounded-full bg-navy-600 text-white"><Plus size={22} /></Link>
        </>} />
      <Page>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input className="input pl-10 pr-9" placeholder="Procurar por nome, marca, categoria…" value={search}
                   autoFocus={params.get('pesquisa') === '1'} onChange={(e) => setSearch(e.target.value)} type="search" enterKeyHint="search" />
            {search && <button aria-label="Limpar" onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center text-ink-muted"><X size={16} /></button>}
          </div>
          <button aria-label="Filtros" onClick={() => setShowFilters(true)} className={cx('relative h-12 w-12 rounded-xl border grid place-items-center', activeFilters ? 'bg-ink text-white border-ink' : 'bg-white border-line')}>
            <SlidersHorizontal size={19} />
            {activeFilters > 0 && <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-navy-600 text-white text-[11px] grid place-items-center">{activeFilters}</span>}
          </button>
        </div>
        <Chips value={filter} onChange={setFilter} options={[
          { value: 'all', label: 'Todos', count: counts.all },
          { value: 'available', label: 'Disponíveis', count: counts.available },
          { value: 'low', label: 'Stock baixo', count: counts.low },
          { value: 'out', label: 'Esgotados', count: counts.out },
          { value: 'expiring', label: 'A expirar', count: counts.expiring },
          { value: 'recent', label: 'Recentes' },
        ]} />

        {isLoading ? <Loading /> : error && !products ? <ErrorBox error={error} retry={refetch} /> :
          list.length === 0 ? (
            active.length === 0
              ? <EmptyState icon={<Boxes />} title="Ainda não há produtos" text="Adicione os produtos que tem em casa, ou importe uma fatura para os criar automaticamente."
                  action={<div className="flex gap-2"><Link to="/stock/novo" className="btn-primary">Adicionar produto</Link><Link to="/faturas/nova" className="btn-secondary">Importar fatura</Link></div>} />
              : <EmptyState icon={<Search />} title="Nenhum produto encontrado" text="Experimente outra pesquisa ou filtro."
                  action={search ? <Link to={`/stock/novo?nome=${encodeURIComponent(search)}`} className="btn-secondary">Criar “{search}”</Link> : undefined} />
          ) : (
            <div className="card divide-y divide-line/70 overflow-hidden">
              {list.map((p) => (
                <ProductRow key={p.id} product={p} category={catById.get(p.category_id ?? '')} location={locById.get(p.location_id ?? '')}
                            expiresIn={nextExpiry.get(p.id) ?? null} onMove={(pp, d) => setMove({ p: pp, d })} />
              ))}
            </div>
          )}
      </Page>

      <MovementSheet product={move?.p ?? null} direction={move?.d ?? 'out'} onClose={() => setMove(null)} />

      <Sheet open={showFilters} onClose={() => setShowFilters(false)} title="Filtros"
             footer={<div className="grid grid-cols-2 gap-3 py-2">
               <button className="btn-secondary" onClick={() => { setCategoryId(''); setLocationId('') }}>Limpar</button>
               <button className="btn-primary" onClick={() => setShowFilters(false)}>Ver {list.length} produtos</button>
             </div>}>
        <label className="block"><span className="label">Categoria</span>
          <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(groupBy(categories, (c) => c.grp)).map(([grp, cs]) => (
              <optgroup key={grp} label={grp}>{cs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>
            ))}
          </select>
        </label>
        <label className="block"><span className="label">Localização</span>
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            <option value="">Todas</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
      </Sheet>
    </>
  )
}
