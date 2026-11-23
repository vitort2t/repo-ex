import { Download } from 'lucide-react'
import { useState } from 'react'
import { useHousehold } from '@/hooks/auth'
import { useCategories, useLocations, useMembers, useProducts, usePurchases } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { exportCsv, exportXlsx } from '@/lib/export'
import { friendlyError } from '@/lib/errors'
import type { Movement, PurchaseItem } from '@/lib/types'
import { Page, PageHeader, Spinner, useToast } from '@/components/ui'

export default function ExportPage() {
  const { hid } = useHousehold()
  const toast = useToast()
  const { data: products = [] } = useProducts()
  const { data: categories = [] } = useCategories()
  const { data: locations = [] } = useLocations()
  const { data: purchases = [] } = usePurchases()
  const { data: members = [] } = useMembers()
  const [busy, setBusy] = useState<string | null>(null)
  const name = (uid: string | null) => members.find((m) => m.user_id === uid)?.profile?.display_name ?? ''
  const cat = (id: string | null) => categories.find((c) => c.id === id)?.name ?? ''
  const today = new Date().toISOString().slice(0, 10)

  const inventory = () => products.filter((p) => !p.archived).map((p) => ({
    Produto: p.name, Marca: p.brand ?? '', Categoria: cat(p.category_id), Localização: locations.find((l) => l.id === p.location_id)?.name ?? '',
    Quantidade: Number(p.quantity), Unidade: p.unit, Mínimo: Number(p.min_quantity), Ideal: Number(p.ideal_quantity),
    'Último preço (€)': p.last_price === null ? '' : Number(p.last_price), 'Preço médio (€)': p.avg_price === null ? '' : Number(p.avg_price),
    'Última entrada': p.last_in_at?.slice(0, 10) ?? '', 'Última saída': p.last_out_at?.slice(0, 10) ?? '', Observações: p.notes ?? '',
  }))
  const fetchAll = async <T,>(table: string, order: string): Promise<T[]> => {
    const out: T[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase.from(table).select('*').eq('household_id', hid).order(order, { ascending: false }).range(from, from + 999)
      if (error) throw error
      out.push(...(data as T[])); if (data.length < 1000) break
    }
    return out
  }
  const movementsRows = async () => (await fetchAll<Movement>('stock_movements', 'occurred_at')).map((m) => ({
    Data: m.occurred_at.replace('T', ' ').slice(0, 16), Produto: products.find((p) => p.id === m.product_id)?.name ?? '', Tipo: m.direction === 'in' ? 'Entrada' : 'Saída',
    Quantidade: Number(m.quantity), Motivo: m.reason, 'Saldo após': Number(m.balance_after), Utilizador: name(m.user_id), Nota: m.note ?? '',
  }))
  const purchaseRows = () => purchases.map((p) => ({ Data: p.purchased_at, Supermercado: p.store_name, Cadeia: p.store_chain, 'Total (€)': p.total_paid,
    Estado: p.status === 'confirmed' ? 'Confirmada' : 'Anulada', Pagamento: p.payment_method ?? '', Documento: p.document_number ?? '', 'Registada por': name(p.created_by) }))
  const itemRows = async () => (await fetchAll<PurchaseItem & { created_at: string }>('purchase_items', 'created_at')).map((i) => {
    const p = purchases.find((x) => x.id === i.purchase_id)
    return { Data: p?.purchased_at ?? '', Supermercado: p?.store_name ?? '', Estado: p?.status ?? '', Artigo: i.name, Quantidade: Number(i.quantity), 'Valor (€)': Number(i.line_total), 'Desconto (€)': Number(i.discount), Categoria: cat(i.category_id) }
  })

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try { await fn() } catch (e) { toast(friendlyError(e), 'alert') } finally { setBusy(null) }
  }
  const B = ({ k, label, onClick }: { k: string; label: string; onClick: () => Promise<void> }) => (
    <button className="btn-secondary w-full justify-start" disabled={!!busy} onClick={() => run(k, onClick)}>{busy === k ? <Spinner /> : <Download size={18} />}{label}</button>
  )

  return (
    <>
      <PageHeader title="Exportar dados" back />
      <Page>
        <div className="card p-4 space-y-2">
          <p className="font-semibold">Tudo num ficheiro Excel</p>
          <p className="text-sm text-ink-muted">Inventário, movimentos, compras e artigos — também serve como cópia de segurança pessoal.</p>
          <B k="all" label="Exportar tudo (Excel)" onClick={async () => exportXlsx(`casa-em-stock-${today}.xlsx`, [
            { name: 'Inventário', rows: inventory() }, { name: 'Movimentos', rows: await movementsRows() },
            { name: 'Compras', rows: purchaseRows() }, { name: 'Artigos comprados', rows: await itemRows() }])} />
        </div>
        <div className="card p-4 space-y-2">
          <p className="font-semibold">Ficheiros CSV</p>
          <B k="inv" label="Inventário (CSV)" onClick={async () => exportCsv(`inventario-${today}.csv`, inventory())} />
          <B k="mov" label="Histórico de movimentos (CSV)" onClick={async () => exportCsv(`movimentos-${today}.csv`, await movementsRows())} />
          <B k="pur" label="Compras (CSV)" onClick={async () => exportCsv(`compras-${today}.csv`, purchaseRows())} />
          <B k="items" label="Artigos comprados (CSV)" onClick={async () => exportCsv(`artigos-${today}.csv`, await itemRows())} />
        </div>
      </Page>
    </>
  )
}
