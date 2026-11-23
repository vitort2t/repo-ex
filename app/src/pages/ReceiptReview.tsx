import { AlertTriangle, Check, ChevronDown, FileText, Link2, Plus, RefreshCw, Search, Sparkles, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { reconcile, AUTO_MATCH_THRESHOLD, matchProduct, type ParsedReceipt } from '@shared/receipt-logic'
import { useHousehold } from '@/hooks/auth'
import { keys, useCategories, useLocations, useProducts, useReceipt, useReceiptFileUrl } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { errorCode, friendlyError } from '@/lib/errors'
import { fmtDate, isoDate, money, parseDecimal, qty } from '@/lib/format'
import { normalizeSearch, groupBy } from '@/lib/search'
import { storeChainOf, storeLabel, STORES } from '@/lib/stores'
import type { Category, Product, ReceiptItem } from '@/lib/types'
import { Badge, EmptyState, Field, Loading, NumberInput, Page, PageHeader, Sheet, Spinner, cx, useConfirm, useToast } from '@/components/ui'
import { parseReceipt, STATUS_LABEL } from './ReceiptAdd'

type Mode = 'existing' | 'new' | 'none'
type Line = {
  key: string; include: boolean; raw_text: string; name: string
  quantity: string; line_total: string; discount: string; unit_price: number | null
  category_id: string; mode: Mode; product_id: string | null; confidence: number | null; decided: boolean
  newName: string; newMin: string; newIdeal: string; stockQty: string; expires: string; open: boolean
}

const toStr = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))
const NOT_STOCK = /\b(saco|sacos|taxa|vale|portes|caucao|cauçao|tara)\b/i

function hintToCategory(hint: string | null, categories: Category[]): string {
  if (!hint) return ''
  const h = normalizeSearch(hint)
  return (categories.find((c) => normalizeSearch(c.name) === h) ?? categories.find((c) => h.includes(normalizeSearch(c.name)) || normalizeSearch(c.name).includes(h)))?.id ?? ''
}

function lineFromItem(it: ReceiptItem, categories: Category[], products: Product[]): Line {
  const conf = it.match_confidence === null ? null : Number(it.match_confidence)
  const prod = products.find((p) => p.id === it.product_id && !p.archived)
  const name = it.name ?? it.raw_text ?? ''
  const isNotStock = it.is_return || (it.line_total !== null && Number(it.line_total) <= 0) || NOT_STOCK.test(name)
  const mode: Mode = prod ? 'existing' : isNotStock ? 'none' : 'new'
  return {
    key: it.id, include: true, raw_text: it.raw_text ?? '', name,
    quantity: toStr(it.quantity), line_total: toStr(it.line_total), discount: toStr(it.discount), unit_price: it.unit_price === null ? null : Number(it.unit_price),
    category_id: prod?.category_id ?? hintToCategory(it.category_hint, categories),
    mode, product_id: prod?.id ?? null, confidence: prod ? conf : null, decided: !!prod && (conf ?? 0) >= AUTO_MATCH_THRESHOLD,
    newName: name, newMin: '1', newIdeal: '2', stockQty: '', expires: '', open: false,
  }
}

function emptyLine(): Line {
  return { key: crypto.randomUUID(), include: true, raw_text: '', name: '', quantity: '1', line_total: '', discount: '', unit_price: null,
           category_id: '', mode: 'new', product_id: null, confidence: null, decided: true, newName: '', newMin: '1', newIdeal: '2', stockQty: '', expires: '', open: true }
}

export default function ReceiptReview() {
  const { id } = useParams()
  const manual = !id
  const { hid } = useHousehold()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { data, isLoading, refetch } = useReceipt(id)
  const { data: products = [] } = useProducts()
  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()
  const { data: fileUrl } = useReceiptFileUrl(data?.receipt.file_path)

  const [store, setStore] = useState('')
  const [date, setDate] = useState(isoDate())
  const [total, setTotal] = useState('')
  const [docNo, setDocNo] = useState('')
  const [discount, setDiscount] = useState('')
  const [payment, setPayment] = useState('')
  const [lines, setLines] = useState<Line[]>(manual ? [emptyLine()] : [])
  const [initialized, setInitialized] = useState(manual)
  const [picker, setPicker] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [reparsing, setReparsing] = useState(false)
  const [dups, setDups] = useState<{ id: string; store_name: string; purchased_at: string; total_paid: number; match: string }[]>([])
  const [showFile, setShowFile] = useState(false)
  const clientId = useRef<string>('')

  // ID de idempotência estável (sobrevive a recarregar a página): evita compras duplicadas por duplo toque ou falha de rede.
  useEffect(() => {
    const k = `confirm-client-${id ?? 'manual'}`
    clientId.current = sessionStorage.getItem(k) ?? crypto.randomUUID()
    sessionStorage.setItem(k, clientId.current)
  }, [id])

  const parsed = (data?.receipt.parsed ?? null) as ParsedReceipt | null

  useEffect(() => {
    if (manual || initialized || !data || !categories.length) return
    const r = data.receipt
    setStore(r.store_name ?? ''); setDate(r.purchase_date ?? isoDate()); setTotal(toStr(r.total_paid)); setDocNo(r.document_number ?? '')
    setDiscount(toStr(parsed?.total_discount)); setPayment(parsed?.payment_method ?? '')
    setLines(data.items.map((it) => lineFromItem(it, categories, products)))
    setInitialized(data.items.length > 0 || r.status === 'parsed' || r.status === 'failed' || r.status === 'uploaded')
    if (data.items.length === 0 && (r.status === 'failed' || r.status === 'uploaded')) setLines([emptyLine()])
  }, [data, categories, products, manual, initialized, parsed])

  // Verificação de duplicados enquanto se edita o cabeçalho
  useEffect(() => {
    const t = parseDecimal(total)
    if (!store.trim() || !date || t === null) { setDups([]); return }
    const h = setTimeout(async () => {
      const { data: d } = await supabase.rpc('find_duplicate_purchases', { p_household: hid, p_store_name: store.trim(), p_purchased_at: date, p_total: t, p_document_number: docNo.trim() || null })
      setDups((d ?? []) as typeof dups)
    }, 500)
    return () => clearTimeout(h)
  }, [store, date, total, docNo, hid])

  const rec = useMemo(() => reconcile(
    lines.map((l) => ({ line_total: parseDecimal(l.line_total), included: l.include })), parseDecimal(total), parseDecimal(discount) ?? 0,
  ), [lines, total, discount])

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const update = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))

  if (!manual && isLoading) return <Loading />
  if (!manual && !data) return <><PageHeader title="Fatura" back /><Page><EmptyState title="Fatura não encontrada" /></Page></>

  const receipt = data?.receipt
  if (receipt && receipt.status === 'confirmed') return <ConfirmedNotice receiptId={receipt.id} />
  if (receipt && receipt.status === 'discarded') return <><PageHeader title="Fatura" back /><Page><EmptyState title="Fatura descartada" text="Esta fatura foi descartada e não conta nas despesas." /></Page></>

  const reparse = async () => {
    if (!receipt) return
    setReparsing(true)
    const res = await parseReceipt(receipt.id)
    setReparsing(false)
    if (!res.ok) return toast(res.message, 'alert')
    setInitialized(false)
    await refetch()
    toast('Fatura lida novamente.')
  }

  const discard = async () => {
    if (!receipt) return nav(-1)
    if (!(await confirm({ title: 'Descartar fatura?', text: 'Não será registada nenhuma despesa nem alteração de stock.', confirm: 'Descartar', danger: true }))) return
    const { error } = await supabase.rpc('discard_receipt', { p_receipt_id: receipt.id })
    if (error) return toast(friendlyError(error), 'alert')
    qc.invalidateQueries({ queryKey: keys.receipts(hid) })
    toast('Fatura descartada.')
    nav('/faturas/nova', { replace: true })
  }

  const submit = async (allowDuplicate = false) => {
    const t = parseDecimal(total)
    if (!store.trim()) return toast('Indique o supermercado.', 'alert')
    if (!date) return toast('Indique a data da compra.', 'alert')
    if (t === null || t < 0) return toast('Indique o total pago.', 'alert')
    const included = lines.filter((l) => l.include)
    for (const l of included) {
      const label = l.name || l.raw_text || 'artigo'
      const q = parseDecimal(l.quantity), lt = parseDecimal(l.line_total)
      if (!l.name.trim() && !l.raw_text.trim()) return toast('Há artigos sem nome.', 'alert')
      if (q === null || q <= 0) { update(l.key, { open: true }); return toast(`Indique a quantidade de “${label}”.`, 'alert') }
      if (lt === null) { update(l.key, { open: true }); return toast(`Indique o valor de “${label}”.`, 'alert') }
      if (l.mode === 'existing' && !l.decided) { update(l.key, { open: true }); return toast(`Confirme a associação de “${label}”.`, 'alert') }
      if (l.mode === 'existing' && !l.product_id) return toast(`Escolha o produto para “${label}”.`, 'alert')
      if (l.mode === 'new' && !l.newName.trim()) return toast(`Indique o nome do novo produto para “${label}”.`, 'alert')
    }
    if (!allowDuplicate && rec.difference !== null && Math.abs(rec.difference) > 0.01) {
      const ok = await confirm({
        title: 'Os valores não coincidem',
        text: `A soma dos artigos${rec.globalDiscount ? ' menos os descontos' : ''} é ${money(rec.expected)}, mas o total pago é ${money(t)} (diferença de ${money(rec.difference)}). A despesa será registada com o total pago (${money(t)}). Quer confirmar assim?`,
        confirm: 'Confirmar assim', cancel: 'Rever',
      })
      if (!ok) return
    }
    const payload = {
      store_name: store.trim(), purchased_at: date, total_paid: t, document_number: docNo.trim() || null,
      discount_total: parseDecimal(discount) ?? 0, payment_method: payment.trim() || null,
      items: included.map((l) => ({
        name: l.mode === 'existing' ? (productById.get(l.product_id!)?.name ?? l.name) : l.mode === 'new' ? l.newName.trim() : l.name.trim() || l.raw_text,
        raw_text: l.raw_text || null, quantity: parseDecimal(l.quantity), line_total: parseDecimal(l.line_total),
        unit_price: l.unit_price ?? null, discount: parseDecimal(l.discount) ?? 0, category_id: l.category_id || null,
        product_id: l.mode === 'existing' ? l.product_id : null,
        create_product: l.mode === 'new' ? { name: l.newName.trim(), category_id: l.category_id || null,
          location_id: null, unit: 'un', min_quantity: parseDecimal(l.newMin) ?? 0, ideal_quantity: parseDecimal(l.newIdeal) ?? 0 } : null,
        add_to_stock: l.mode !== 'none', stock_quantity: parseDecimal(l.stockQty) ?? parseDecimal(l.quantity), expires_on: l.expires || null,
      })),
    }
    setBusy(true)
    try {
      const { data: purchase, error } = await supabase.rpc('confirm_purchase', {
        p_household: hid, p_client_id: clientId.current, p_payload: payload, p_receipt_id: receipt?.id ?? null, p_allow_duplicate: allowDuplicate,
      })
      if (error) throw error
      sessionStorage.removeItem(`confirm-client-${id ?? 'manual'}`)
      for (const k of [keys.products(hid), keys.purchases(hid), keys.shopping(hid), keys.receipts(hid), keys.lots(hid), keys.movements(hid), keys.notifications(hid)]) qc.invalidateQueries({ queryKey: k })
      toast('Compra registada. Stock e despesas atualizados.')
      nav(`/despesas/compra/${(purchase as { id: string }).id}`, { replace: true })
    } catch (e) {
      const code = errorCode(e)
      if (code.includes('POSSIBLE_DUPLICATE')) {
        setBusy(false)
        const ok = await confirm({ title: 'Possível compra repetida', text: 'Já existe uma compra registada nesta loja, na mesma data e com o mesmo total. Se for mesmo outra compra, pode registá-la.', confirm: 'É outra compra', cancel: 'Cancelar' })
        if (ok) return submit(true)
        return
      }
      toast(friendlyError(e), 'alert')
    } finally { setBusy(false) }
  }

  const status = receipt ? STATUS_LABEL[receipt.status] : null
  const included = lines.filter((l) => l.include)
  const uncertain = included.filter((l) => l.mode === 'existing' && !l.decided).length

  return (
    <>
      <PageHeader title={manual ? 'Registar compra' : 'Rever fatura'} subtitle={manual ? 'Sem fatura' : status?.label} back
        actions={<button onClick={discard} aria-label="Descartar" className="h-10 w-10 grid place-items-center rounded-full hover:bg-champagne text-ink-soft"><Trash2 size={19} /></button>} />
      <Page>
        {receipt?.status === 'processing' && <div className="card p-4 flex items-center gap-3"><Spinner />A fatura está a ser lida…<button className="ml-auto text-sm font-semibold text-navy-700" onClick={() => refetch()}>Atualizar</button></div>}
        {receipt?.status === 'failed' && (
          <div className="card p-4 border-alert/30 bg-alert-bg/40 space-y-2">
            <p className="text-sm text-alert-ink font-medium">{receipt.error ?? 'Não foi possível ler a fatura automaticamente.'}</p>
            <p className="text-xs text-ink-soft">Pode introduzir os dados manualmente abaixo ou tentar ler de novo.</p>
          </div>
        )}
        {receipt && receipt.file_path && (
          <div className="card overflow-hidden">
            <button className="w-full flex items-center gap-3 px-4 py-3" onClick={() => setShowFile((v) => !v)}>
              <FileText size={18} className="text-ink-muted" /><span className="flex-1 text-left text-sm font-medium">Fatura original</span>
              <ChevronDown size={18} className={cx('transition', showFile && 'rotate-180')} />
            </button>
            {showFile && fileUrl && (receipt.mime_type === 'application/pdf'
              ? <a href={fileUrl} target="_blank" rel="noreferrer" className="block px-4 pb-4 text-sm font-semibold text-navy-700">Abrir PDF</a>
              : <img src={fileUrl} alt="Fatura" className="w-full max-h-[70vh] object-contain bg-base" />)}
            {(receipt.status === 'parsed' || receipt.status === 'failed' || receipt.status === 'uploaded') && (
              <button onClick={reparse} disabled={reparsing} className="w-full flex items-center gap-2 px-4 py-3 border-t border-line/70 text-sm text-ink-soft">
                {reparsing ? <Spinner size={16} /> : <RefreshCw size={16} />}{receipt.status === 'uploaded' ? 'Ler automaticamente' : 'Ler novamente'}
              </button>
            )}
          </div>
        )}

        {parsed?.warnings?.length ? (
          <div className="card p-4 bg-warn-bg/60 border-warn/30 space-y-1.5">
            <p className="text-sm font-semibold text-warn-ink flex items-center gap-2"><AlertTriangle size={16} />Verifique estes pontos</p>
            <ul className="text-sm text-ink-soft list-disc pl-5 space-y-0.5">{parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          </div>
        ) : null}

        {dups.length > 0 && (
          <div className="card p-4 bg-alert-bg/50 border-alert/30 space-y-2">
            <p className="text-sm font-semibold text-alert-ink flex items-center gap-2"><AlertTriangle size={16} />{dups.some((d) => d.match === 'document') ? 'Esta fatura já foi registada' : 'Possível compra repetida'}</p>
            {dups.map((d) => <Link key={d.id} to={`/despesas/compra/${d.id}`} className="block text-sm underline">{d.store_name} · {fmtDate(d.purchased_at)} · {money(d.total_paid)}</Link>)}
          </div>
        )}

        <section className="card p-4 space-y-3">
          <Field label="Supermercado">
            <input className="input" list="stores" value={store} onChange={(e) => setStore(e.target.value)} placeholder="Ex.: Mercadona" />
            <datalist id="stores">{STORES.filter((s) => s.key !== 'outros').map((s) => <option key={s.key} value={s.label} />)}</datalist>
          </Field>
          {store && <p className="text-xs text-ink-muted -mt-1">Contabilizado em: <b>{storeLabel(storeChainOf(store))}</b></p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Data"><input type="date" className="input" value={date} max={isoDate()} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Total pago (€)"><NumberInput value={total} onChange={setTotal} placeholder="0,00" /></Field>
          </div>
          <details className="group">
            <summary className="text-sm text-ink-soft cursor-pointer list-none flex items-center gap-1">Mais detalhes <ChevronDown size={15} className="group-open:rotate-180 transition" /></summary>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Descontos globais (€)" hint="Cupões, talões, vales."><NumberInput value={discount} onChange={setDiscount} placeholder="0,00" /></Field>
              <Field label="Pagamento"><input className="input" value={payment} onChange={(e) => setPayment(e.target.value)} placeholder="Cartão, dinheiro…" /></Field>
              <div className="col-span-2"><Field label="Nº do documento / ATCUD" hint="Usado para impedir registos repetidos."><input className="input" value={docNo} onChange={(e) => setDocNo(e.target.value)} /></Field></div>
            </div>
          </details>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="section-title">Artigos ({included.length})</h2>
            {uncertain > 0 && <Badge tone="warn">{uncertain} por confirmar</Badge>}
          </div>
          <div className="space-y-2">
            {lines.map((l) => <LineCard key={l.key} line={l} product={productById.get(l.product_id ?? '')} categories={categories}
              onChange={(p) => update(l.key, p)} onPick={() => setPicker(l.key)} onRemove={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} />)}
          </div>
          <button className="btn-secondary w-full" onClick={() => setLines((ls) => [...ls, emptyLine()])}><Plus size={18} />Adicionar artigo</button>
        </section>

        <section className={cx('card p-4 space-y-1.5', rec.difference !== null && !rec.ok && 'border-warn/50')}>
          <Row label="Soma dos artigos" value={money(rec.itemsTotal)} />
          {rec.globalDiscount > 0 && <Row label="Descontos globais" value={`− ${money(rec.globalDiscount)}`} />}
          <Row label="Total pago" value={money(rec.totalPaid)} bold />
          {rec.difference !== null && (rec.ok
            ? <p className="text-sm text-ok-ink font-medium flex items-center gap-1.5 pt-1"><Check size={16} />Valores conciliados</p>
            : <p className="text-sm text-warn-ink font-medium flex items-center gap-1.5 pt-1"><AlertTriangle size={16} />Diferença de {money(rec.difference)} — verifique os artigos</p>)}
        </section>

        <button className="btn-primary w-full h-14 text-base" onClick={() => submit(false)} disabled={busy || receipt?.status === 'processing'}>
          {busy ? <Spinner className="text-white" /> : 'Confirmar compra'}
        </button>
        <p className="text-xs text-ink-muted text-center px-4">Ao confirmar: regista a despesa, atualiza o stock e os preços, e retira da lista de compras os produtos comprados.</p>
      </Page>

      <ProductPicker open={!!picker} products={products} categories={categories} locations={locations}
        initial={lines.find((l) => l.key === picker)?.name ?? ''}
        onClose={() => setPicker(null)}
        onPick={(p) => { if (picker) update(picker, { mode: 'existing', product_id: p.id, decided: true, confidence: 1, category_id: p.category_id ?? '' }); setPicker(null) }} />
    </>
  )
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={cx('flex justify-between text-sm', bold && 'font-bold text-base')}><span className={bold ? '' : 'text-ink-soft'}>{label}</span><span className="tabular-nums">{value}</span></div>
}

function LineCard({ line: l, product, categories, onChange, onPick, onRemove }: {
  line: Line; product?: Product; categories: Category[]; onChange: (p: Partial<Line>) => void; onPick: () => void; onRemove: () => void
}) {
  const q = parseDecimal(l.quantity), lt = parseDecimal(l.line_total)
  const unit = q && lt !== null && q > 0 ? lt / q : null
  return (
    <div className={cx('card overflow-hidden', !l.include && 'opacity-55')}>
      <div className="flex items-start gap-3 p-3.5">
        <input type="checkbox" checked={l.include} onChange={(e) => onChange({ include: e.target.checked })} className="mt-1 h-5 w-5 accent-[#14263D]" aria-label="Incluir artigo" />
        <button className="flex-1 min-w-0 text-left" onClick={() => onChange({ open: !l.open })}>
          <p className="font-semibold leading-snug">{l.name || l.raw_text || 'Novo artigo'}</p>
          {l.raw_text && l.raw_text !== l.name && <p className="text-xs text-ink-muted truncate">{l.raw_text}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {l.mode === 'existing' && product && (l.decided
              ? <Badge tone="ok"><Link2 size={12} />{product.name}</Badge>
              : <Badge tone="warn">É “{product.name}”?</Badge>)}
            {l.mode === 'new' && <Badge><Sparkles size={12} />Produto novo</Badge>}
            {l.mode === 'none' && <Badge>Não entra no stock</Badge>}
          </div>
        </button>
        <div className="text-right shrink-0">
          <p className="font-bold tabular-nums">{lt === null ? <span className="text-alert-ink">sem valor</span> : money(lt)}</p>
          <p className="text-xs text-ink-muted">{q === null ? <span className="text-alert-ink">sem qtd.</span> : `${qty(q)} × ${unit !== null ? money(unit) : '—'}`}</p>
        </div>
      </div>

      {l.mode === 'existing' && product && !l.decided && (
        <div className="flex gap-2 px-3.5 pb-3.5">
          <button className="btn-primary h-10 flex-1 text-sm" onClick={() => onChange({ decided: true })}><Check size={16} />Sim, é este</button>
          <button className="btn-secondary h-10 flex-1 text-sm" onClick={onPick}>Escolher outro</button>
          <button className="btn-ghost h-10 text-sm px-3" onClick={() => onChange({ mode: 'new', product_id: null, decided: true })}>Novo</button>
        </div>
      )}

      {l.open && (
        <div className="border-t border-line/70 p-3.5 space-y-3 bg-base/40">
          <Field label="Nome"><input className="input" value={l.name} onChange={(e) => onChange({ name: e.target.value, newName: l.mode === 'new' && l.newName === l.name ? e.target.value : l.newName })} /></Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Quantidade"><NumberInput value={l.quantity} onChange={(v) => onChange({ quantity: v })} /></Field>
            <Field label="Valor (€)"><NumberInput value={l.line_total} onChange={(v) => onChange({ line_total: v })} /></Field>
            <Field label="Desconto (€)"><NumberInput value={l.discount} onChange={(v) => onChange({ discount: v })} /></Field>
          </div>
          <p className="text-xs text-ink-muted -mt-1">“Valor” é o total pago pela linha, já com o desconto.</p>
          <div>
            <span className="label">Stock</span>
            <div className="grid grid-cols-3 gap-1.5 bg-champagne rounded-xl p-1">
              {(['existing', 'new', 'none'] as Mode[]).map((m) => (
                <button key={m} type="button" onClick={() => (m === 'existing' ? onPick() : onChange({ mode: m, decided: true, product_id: m === 'none' ? l.product_id : null }))}
                  className={cx('h-9 rounded-lg text-[13px] font-semibold', l.mode === m ? 'bg-white shadow-card' : 'text-ink-muted')}>
                  {m === 'existing' ? 'Associar' : m === 'new' ? 'Criar novo' : 'Ignorar'}
                </button>
              ))}
            </div>
          </div>
          {l.mode === 'existing' && product && <button className="flex items-center gap-2 text-sm text-navy-700 font-semibold" onClick={onPick}><Search size={15} />{product.name} · trocar</button>}
          {l.mode === 'new' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2"><Field label="Nome do novo produto"><input className="input" value={l.newName} onChange={(e) => onChange({ newName: e.target.value })} /></Field></div>
              <Field label="Qtd. mínima"><NumberInput value={l.newMin} onChange={(v) => onChange({ newMin: v })} /></Field>
              <Field label="Qtd. ideal"><NumberInput value={l.newIdeal} onChange={(v) => onChange({ newIdeal: v })} /></Field>
            </div>
          )}
          <Field label="Categoria">
            <select className="input" value={l.category_id} onChange={(e) => onChange({ category_id: e.target.value })}>
              <option value="">Sem categoria</option>
              {Object.entries(groupBy(categories, (c) => c.grp)).map(([g, cs]) => <optgroup key={g} label={g}>{cs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup>)}
            </select>
          </Field>
          {l.mode !== 'none' && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Unidades para o stock" hint="Por omissão, a quantidade."><NumberInput value={l.stockQty} onChange={(v) => onChange({ stockQty: v })} placeholder={l.quantity || '1'} /></Field>
              <Field label="Validade (opcional)"><input type="date" className="input" value={l.expires} onChange={(e) => onChange({ expires: e.target.value })} /></Field>
            </div>
          )}
          <button className="text-sm text-alert-ink flex items-center gap-1.5" onClick={onRemove}><Trash2 size={15} />Remover artigo</button>
        </div>
      )}
    </div>
  )
}

function ProductPicker({ open, products, initial, onClose, onPick }: {
  open: boolean; products: Product[]; categories: Category[]; locations: unknown[]; initial: string; onClose: () => void; onPick: (p: Product) => void
}) {
  const [s, setS] = useState('')
  useEffect(() => { if (open) setS('') }, [open])
  const list = useMemo(() => {
    const active = products.filter((p) => !p.archived)
    const n = normalizeSearch(s)
    if (n) return active.filter((p) => normalizeSearch(`${p.name} ${p.brand ?? ''} ${(p.aliases ?? []).join(' ')}`).includes(n)).slice(0, 40)
    // Sem pesquisa: sugestões pela semelhança com o nome da linha
    const best = matchProduct(initial, initial, active)
    const rest = active.slice(0, 40)
    return best ? [active.find((p) => p.id === best.product_id)!, ...rest.filter((p) => p.id !== best.product_id)] : rest
  }, [products, s, initial])
  return (
    <Sheet open={open} onClose={onClose} title="Associar a produto">
      <p className="text-sm text-ink-muted -mt-2">Linha da fatura: <b className="text-ink">{initial}</b></p>
      <input className="input" placeholder="Procurar produto…" value={s} onChange={(e) => setS(e.target.value)} autoFocus />
      <div className="divide-y divide-line/70 -mx-1">
        {list.map((p) => (
          <button key={p.id} onClick={() => onPick(p)} className="w-full flex items-center gap-3 px-1 py-3 text-left">
            <span className="flex-1 font-medium">{p.name}{p.brand ? <span className="text-ink-muted font-normal"> · {p.brand}</span> : null}</span>
            <span className="text-xs text-ink-muted">tem {qty(p.quantity)}</span>
          </button>
        ))}
        {list.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">Nenhum produto encontrado. Feche e escolha “Criar novo”.</p>}
      </div>
    </Sheet>
  )
}

function ConfirmedNotice({ receiptId }: { receiptId: string }) {
  const [purchaseId, setPurchaseId] = useState<string | null>(null)
  useEffect(() => {
    supabase.from('purchases').select('id').eq('receipt_id', receiptId).eq('status', 'confirmed').maybeSingle().then(({ data }) => setPurchaseId(data?.id ?? null))
  }, [receiptId])
  return (
    <>
      <PageHeader title="Fatura" back />
      <Page>
        <EmptyState icon={<Check />} title="Esta fatura já foi confirmada" text="A compra já está registada e não será contabilizada duas vezes."
          action={purchaseId ? <Link to={`/despesas/compra/${purchaseId}`} className="btn-primary">Ver compra</Link> : undefined} />
      </Page>
    </>
  )
}
