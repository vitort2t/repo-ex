import { AlertTriangle, Bell, CalendarClock, PiggyBank, PackageX, Receipt } from 'lucide-react'
import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/hooks/auth'
import { keys, useNotifications } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { relativeDay } from '@/lib/format'
import { EmptyState, Page, PageHeader, cx } from '@/components/ui'

const ICON: Record<string, typeof Bell> = { low_stock: AlertTriangle, out_of_stock: PackageX, expiry: CalendarClock, budget: PiggyBank, bill: Receipt }

export default function Notifications() {
  const { hid } = useHousehold()
  const qc = useQueryClient()
  const { data: list = [] } = useNotifications()
  const unread = list.filter((n) => !n.read).map((n) => n.id)

  // Marcar como lidas ao abrir (com um pequeno atraso para se ver o destaque)
  useEffect(() => {
    if (!unread.length) return
    const t = setTimeout(async () => {
      await supabase.rpc('mark_notifications_read', { p_ids: unread })
      qc.invalidateQueries({ queryKey: keys.notifications(hid) })
    }, 1500)
    return () => clearTimeout(t)
  }, [unread.join(','), hid, qc]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <PageHeader title="Notificações" back />
      <Page>
        {list.length === 0 ? <EmptyState icon={<Bell />} title="Sem notificações" text="Aqui aparecem os avisos de stock baixo, validades e orçamento." /> : (
          <div className="card divide-y divide-line/70">
            {list.map((n) => { const I = ICON[n.kind] ?? Bell; return (
              <Link key={n.id} to={n.link ?? '/'} className={cx('flex gap-3 px-4 py-3.5', !n.read && 'bg-navy-50/60')}>
                <span className={cx('h-9 w-9 shrink-0 rounded-xl grid place-items-center', n.kind === 'out_of_stock' || n.kind === 'budget' ? 'bg-alert-bg text-alert-ink' : 'bg-warn-bg text-warn-ink')}><I size={18} /></span>
                <div className="flex-1 min-w-0">
                  <p className={cx('leading-snug', !n.read ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                  {n.body && <p className="text-sm text-ink-muted">{n.body}</p>}
                  <p className="text-xs text-ink-muted mt-0.5">{relativeDay(n.created_at)}</p>
                </div>
              </Link>) })}
          </div>
        )}
      </Page>
    </>
  )
}
