import { Boxes, Home, MoreHorizontal, ShoppingCart, Wallet, CloudOff, RefreshCw, Plus } from 'lucide-react'
import { useCallback, useEffect } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useHousehold } from '@/hooks/auth'
import { useOutbox, useRealtimeSync, useShopping } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { cx, useToast } from './ui'
import { UpdatePrompt } from './UpdatePrompt'
import { Logo } from './Logo'
import { FinanceUIProvider, useFinanceUI } from './finance/FinanceUI'

const NAV = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/stock', label: 'Stock', icon: Boxes },
  { to: '/compras', label: 'Compras', icon: ShoppingCart },
  { to: '/financas', label: 'Finanças', icon: Wallet },
  { to: '/mais', label: 'Mais', icon: MoreHorizontal },
]

export function Shell() {
  const { hid, household } = useHousehold()
  const toast = useToast()
  const sync = useRealtimeSync(hid)
  const onFailures = useCallback((msgs: string[]) => {
    toast(`${msgs.length === 1 ? 'Uma alteração feita sem internet não foi aplicada' : `${msgs.length} alterações feitas sem internet não foram aplicadas`}: ${friendlyError(msgs[0])}`, 'alert')
  }, [toast])
  const { pendingCount, online } = useOutbox(onFailures)
  const { data: shopping } = useShopping()
  const toBuy = shopping?.filter((i) => i.status === 'open' && !i.checked).length ?? 0

  // Gerar alertas de validade uma vez por sessão.
  useEffect(() => {
    if (!navigator.onLine) return
    supabase.rpc('refresh_expiry_notifications', { p_household: hid }).then(() => {})
    // gera as ocorrências das despesas fixas e os alertas de vencimento
    supabase.rpc('fin_refresh_due_notifications', { p_household: hid, p_days: 3 }).then(() => {})
  }, [hid])

  return (
    <FinanceUIProvider>
    <div className="min-h-screen md:flex">
      {/* navegação lateral (computador) */}
      <aside className="hidden md:flex md:flex-col w-60 shrink-0 h-screen sticky top-0 border-r border-line bg-white/60 px-3 py-6">
        <div className="px-3 mb-7">
          <Logo size={34} />
          <p className="text-xs text-ink-muted truncate mt-2">{household.name}</p>
        </div>
        <nav className="space-y-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
                     className={({ isActive }) => cx('flex items-center gap-3 h-11 px-3 rounded-xl font-medium', isActive ? 'bg-navy-50 text-navy-700' : 'text-ink-soft hover:bg-champagne')}>
              <n.icon size={20} />{n.label}
              {n.to === '/compras' && toBuy > 0 && <span className="ml-auto text-xs bg-navy-600 text-white rounded-full px-2">{toBuy}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 min-w-0 max-w-3xl md:mx-auto">
        {(!online || pendingCount > 0 || sync === 'offline') && (
          <div className={cx('pt-safe text-[13px] font-medium', !online ? 'bg-warn-bg text-warn-ink' : 'bg-navy-50 text-navy-700')}>
            <div className="flex items-center gap-2 px-4 py-2">
              {!online ? <CloudOff size={15} /> : <RefreshCw size={15} className="animate-spin" />}
              {!online
                ? `Sem internet — a mostrar os dados guardados.${pendingCount ? ` ${pendingCount} alteração(ões) por sincronizar.` : ''}`
                : pendingCount > 0 ? `A sincronizar ${pendingCount} alteração(ões)…` : 'A restabelecer a sincronização…'}
            </div>
          </div>
        )}
        <Outlet />
      </div>

      {/* barra inferior (telemóvel) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/90 backdrop-blur-md border-t border-line pb-safe">
        <div className="grid grid-cols-5 max-w-lg mx-auto">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
                     className={({ isActive }) => cx('relative flex flex-col items-center justify-center gap-0.5 h-[58px] text-[11px] font-semibold', isActive ? 'text-navy-700' : 'text-ink-muted')}>
              {({ isActive }) => (<>
                <span className={cx('grid place-items-center h-8 w-14 rounded-full transition', isActive && 'bg-navy-50')}><n.icon size={22} strokeWidth={isActive ? 2.3 : 1.9} /></span>
                {n.label}
                {n.to === '/compras' && toBuy > 0 && <span className="absolute top-1.5 right-[calc(50%-24px)] min-w-[18px] h-[18px] px-1 rounded-full bg-navy-600 text-white text-[10px] grid place-items-center">{toBuy}</span>}
              </>)}
            </NavLink>
          ))}
        </div>
      </nav>
      <NewMovementFab />
      <UpdatePrompt />
    </div>
    </FinanceUIProvider>
  )
}

/** Botão fixo "+ Novo movimento" (registo rápido). */
function NewMovementFab() {
  const { openNew } = useFinanceUI()
  return (
    <button onClick={() => openNew()} aria-label="Novo movimento"
      className="fixed z-30 right-4 bottom-[calc(env(safe-area-inset-bottom)+76px)] md:bottom-8 md:right-8 h-14 pl-4 pr-5 rounded-full bg-wine-600 text-white shadow-sheet flex items-center gap-2 font-semibold active:scale-95 transition print:hidden">
      <Plus size={22} /><span className="text-[15px]">Novo movimento</span>
    </button>
  )
}
