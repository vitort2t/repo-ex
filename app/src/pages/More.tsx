import { Bell, ChevronRight, Download, FolderTree, History as HistoryIcon, Home, LogOut, MapPin, PiggyBank, BarChart3, Receipt, User, CalendarClock } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useHousehold } from '@/hooks/auth'
import { Page, PageHeader, useConfirm } from '@/components/ui'

function Item({ to, icon, label, sub }: { to: string; icon: ReactNode; label: string; sub?: string }) {
  return (
    <Link to={to} className="flex items-center gap-3 px-4 py-3.5">
      <span className="h-9 w-9 rounded-xl bg-champagne grid place-items-center text-ink-soft">{icon}</span>
      <span className="flex-1"><span className="block font-medium">{label}</span>{sub && <span className="block text-xs text-ink-muted">{sub}</span>}</span>
      <ChevronRight size={18} className="text-ink-muted" />
    </Link>
  )
}

export default function More() {
  const { household, profile, signOut } = useHousehold()
  const confirm = useConfirm()
  return (
    <>
      <PageHeader title="Mais" />
      <Page>
        <div className="card divide-y divide-line/70">
          <Item to="/mais/casa" icon={<Home size={18} />} label={household.name} sub="Membros e convites" />
          <Item to="/mais/conta" icon={<User size={18} />} label={profile?.display_name || 'A minha conta'} sub={profile?.email ?? undefined} />
          <Item to="/notificacoes" icon={<Bell size={18} />} label="Notificações" />
        </div>
        <div className="card divide-y divide-line/70">
          <Item to="/faturas/nova" icon={<Receipt size={18} />} label="Faturas" sub="Adicionar e concluir faturas" />
          <Item to="/despesas/orcamento" icon={<PiggyBank size={18} />} label="Orçamento mensal" />
          <Item to="/despesas/relatorios" icon={<BarChart3 size={18} />} label="Relatórios" />
          <Item to="/stock/validades" icon={<CalendarClock size={18} />} label="Validades" sub="Consumir primeiro" />
        </div>
        <div className="card divide-y divide-line/70">
          <Item to="/mais/categorias" icon={<FolderTree size={18} />} label="Categorias" />
          <Item to="/mais/localizacoes" icon={<MapPin size={18} />} label="Localizações" />
          <Item to="/mais/historico" icon={<HistoryIcon size={18} />} label="Histórico de movimentos" />
          <Item to="/mais/exportar" icon={<Download size={18} />} label="Exportar dados" sub="CSV ou Excel" />
        </div>
        <button className="btn-ghost w-full text-alert-ink" onClick={async () => { if (await confirm({ title: 'Terminar sessão?', confirm: 'Terminar sessão' })) signOut() }}>
          <LogOut size={18} />Terminar sessão
        </button>
        <p className="text-center text-xs text-ink-muted">LAR. · A vida da casa, em equilíbrio. · v{__APP_VERSION__}</p>
      </Page>
    </>
  )
}
