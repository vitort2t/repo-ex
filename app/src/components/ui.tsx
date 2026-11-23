import { ChevronLeft, Loader2, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ')

// ---------------------------------------------------------------- cabeçalho de página
export function PageHeader({ title, subtitle, back, actions }: { title: ReactNode; subtitle?: ReactNode; back?: boolean | string; actions?: ReactNode }) {
  const nav = useNavigate()
  return (
    <header className="sticky top-0 z-20 bg-base/90 backdrop-blur-md pt-safe">
      <div className="flex items-center gap-2 px-4 h-14">
        {back && (
          <button aria-label="Voltar" onClick={() => (typeof back === 'string' ? nav(back) : nav(-1))}
                  className="-ml-2 h-10 w-10 grid place-items-center rounded-full hover:bg-champagne text-ink">
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-[19px] font-bold tracking-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-ink-muted truncate -mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
    </header>
  )
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={cx('px-4 pb-44 md:pb-28 space-y-4 animate-fade', className)}>{children}</main>
}

// ---------------------------------------------------------------- elementos
export function Spinner({ size = 20, className }: { size?: number; className?: string }) {
  return <Loader2 size={size} className={cx('animate-spin text-navy-600', className)} aria-label="A carregar" />
}

export function Loading({ label = 'A carregar…' }: { label?: string }) {
  return <div className="py-16 flex flex-col items-center gap-3 text-ink-muted text-sm"><Spinner size={26} />{label}</div>
}

export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const offline = typeof navigator !== 'undefined' && !navigator.onLine
  return (
    <div className="card p-5 text-center space-y-3">
      <p className="text-sm text-ink-soft">{offline ? 'Sem ligação à internet e sem dados guardados para este ecrã.' : 'Não foi possível carregar os dados.'}</p>
      {import.meta.env.DEV && <p className="text-xs text-ink-muted break-all">{String((error as Error)?.message ?? error)}</p>}
      {retry && <button className="btn-secondary h-10" onClick={retry}>Tentar novamente</button>}
    </div>
  )
}

export function EmptyState({ icon, title, text, action }: { icon?: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="card px-6 py-10 text-center flex flex-col items-center gap-2">
      {icon && <div className="h-14 w-14 rounded-2xl bg-champagne grid place-items-center text-ink-soft mb-1">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {text && <p className="text-sm text-ink-muted max-w-xs">{text}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function Badge({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'alert'; children: ReactNode }) {
  const t = { neutral: 'bg-champagne text-ink-soft', ok: 'bg-ok-bg text-ok-ink', warn: 'bg-warn-bg text-warn-ink', alert: 'bg-alert-bg text-alert-ink' }[tone]
  return <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 h-6 text-xs font-semibold whitespace-nowrap', t)}>{children}</span>
}

export function ProgressBar({ value, tone }: { value: number; tone?: 'ok' | 'warn' | 'alert' }) {
  const v = Math.max(0, Math.min(1, value))
  const t = tone ?? (value >= 1 ? 'alert' : value >= 0.75 ? 'warn' : 'ok')
  const color = { ok: 'bg-ok', warn: 'bg-warn', alert: 'bg-alert' }[t]
  return (
    <div className="h-2.5 rounded-full bg-champagne overflow-hidden" role="progressbar" aria-valuenow={Math.round(v * 100)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-all duration-500', color)} style={{ width: `${v * 100}%` }} />
    </div>
  )
}

export function Field({ label, hint, children, error }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {error ? <span className="block text-xs text-alert-ink mt-1">{error}</span> : hint ? <span className="block text-xs text-ink-muted mt-1">{hint}</span> : null}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="grid bg-champagne rounded-xl p-1 gap-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0,1fr))` }}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
                className={cx('h-10 rounded-lg text-sm font-semibold transition', value === o.value ? 'bg-white shadow-card text-ink' : 'text-ink-muted')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Chips<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; count?: number }[] }) {
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 pb-1">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} className={cx('chip', value === o.value && 'chip-active')}>
          {o.label}{o.count !== undefined && <span className={cx('text-xs', value === o.value ? 'text-white/70' : 'text-ink-muted')}>{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Campo numérico que aceita vírgula decimal (teclado português). */
export function NumberInput({ value, onChange, placeholder, className, autoFocus, ariaLabel, decimals = true }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; autoFocus?: boolean; ariaLabel?: string; decimals?: boolean
}) {
  return (
    <input className={cx('input', className)} inputMode={decimals ? 'decimal' : 'numeric'} value={value} placeholder={placeholder}
           autoFocus={autoFocus} aria-label={ariaLabel}
           onChange={(e) => onChange(e.target.value.replace(/[^0-9.,-]/g, ''))} />
  )
}

export function Stepper({ value, onChange, step = 1, min = 0 }: { value: number; onChange: (v: number) => void; step?: number; min?: number }) {
  const set = (v: number) => onChange(Math.max(min, Math.round(v * 1000) / 1000))
  return (
    <div className="flex items-center gap-3">
      <button type="button" aria-label="Diminuir" className="h-14 w-14 rounded-2xl bg-champagne text-2xl font-semibold active:scale-95" onClick={() => set(value - step)}>−</button>
      <input className="input h-14 text-center text-2xl font-bold flex-1" inputMode="decimal" aria-label="Quantidade"
             value={String(value).replace('.', ',')}
             onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n)) set(n) }} />
      <button type="button" aria-label="Aumentar" className="h-14 w-14 rounded-2xl bg-champagne text-2xl font-semibold active:scale-95" onClick={() => set(value + step)}>+</button>
    </div>
  )
}

// ---------------------------------------------------------------- painel inferior (bottom sheet)
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/30 animate-fade" onClick={onClose} />
      <div ref={ref} className="relative w-full md:max-w-lg max-h-[92vh] flex flex-col bg-white rounded-t-3xl md:rounded-3xl shadow-sheet animate-sheet">
        <div className="pt-2.5 pb-1 flex justify-center md:hidden"><div className="h-1.5 w-10 rounded-full bg-line" /></div>
        <div className="flex items-center gap-3 px-5 pt-2 pb-3">
          <div className="flex-1 min-w-0 text-lg font-bold tracking-tight">{title}</div>
          <button aria-label="Fechar" onClick={onClose} className="h-9 w-9 grid place-items-center rounded-full bg-champagne text-ink-soft"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-5 pb-4 space-y-4">{children}</div>
        {footer && <div className="px-5 pt-2 pb-safe border-t border-line/70 bg-white rounded-b-3xl">{footer}</div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- confirmação
type ConfirmOpts = { title: string; text?: string; confirm?: string; cancel?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false)
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => { state?.resolve(v); setState(null) }
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Sheet open={!!state} onClose={() => close(false)} title={state?.title}
             footer={<div className="grid grid-cols-2 gap-3 py-2">
               <button className="btn-secondary" onClick={() => close(false)}>{state?.cancel ?? 'Cancelar'}</button>
               <button className={state?.danger ? 'btn bg-alert text-white' : 'btn-primary'} onClick={() => close(true)}>{state?.confirm ?? 'Confirmar'}</button>
             </div>}>
        {state?.text && <p className="text-ink-soft text-[15px] leading-relaxed">{state.text}</p>}
      </Sheet>
    </ConfirmCtx.Provider>
  )
}
export const useConfirm = () => useContext(ConfirmCtx)

// ---------------------------------------------------------------- avisos (toasts)
type Toast = { id: number; text: string; tone: 'ok' | 'alert' | 'info' }
const ToastCtx = createContext<(text: string, tone?: Toast['tone']) => void>(() => {})
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, tone }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'alert' ? 5000 : 2800)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="fixed z-[60] left-0 right-0 bottom-24 md:bottom-6 flex flex-col items-center gap-2 px-4 pointer-events-none" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={cx('animate-pop pointer-events-auto max-w-md w-full rounded-2xl px-4 py-3 text-[15px] font-medium shadow-sheet',
            t.tone === 'ok' && 'bg-navy-600 text-white', t.tone === 'alert' && 'bg-alert text-white', t.tone === 'info' && 'bg-white text-ink border border-line')}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)
