// Logótipo oficial LAR. — casa em contorno linear, com abertura no canto inferior esquerdo
// e quatro janelas quadradas (2 × 2). Não substituir por outro símbolo.
import { cx } from './ui'

type Variant = 'color' | 'mono' | 'inverse'
const COLORS: Record<Variant, { line: string; win: string; dot: string; text: string }> = {
  color:   { line: '#14263D', win: '#642C40', dot: '#642C40', text: '#14263D' },
  mono:    { line: '#14263D', win: '#14263D', dot: '#14263D', text: '#14263D' },   // fundos claros
  inverse: { line: '#FFFFFF', win: '#FFFFFF', dot: '#FFFFFF', text: '#FFFFFF' },   // fundos escuros
}

export const HOUSE_PATH = 'M21 55H52V28.5L32 11L12 28.5V45'
export const WINDOWS = [[23.5, 29], [33.5, 29], [23.5, 39], [33.5, 39]] as const

export function LogoSymbol({ size = 32, variant = 'color', className, title = 'LAR.' }: { size?: number; variant?: Variant; className?: string; title?: string }) {
  const c = COLORS[variant]
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} role="img" aria-label={title}>
      <path d={HOUSE_PATH} fill="none" stroke={c.line} strokeWidth={3.6} strokeLinecap="round" strokeLinejoin="round" />
      {WINDOWS.map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width={7} height={7} rx={1.4} fill={c.win} />)}
    </svg>
  )
}

export function Logo({ size = 34, variant = 'color', slogan, className }: { size?: number; variant?: Variant; slogan?: boolean; className?: string }) {
  const c = COLORS[variant]
  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      <LogoSymbol size={size} variant={variant} title="" />
      <div className="leading-none">
        <p className="font-extrabold tracking-[0.12em]" style={{ color: c.text, fontSize: size * 0.62 }}>
          LAR<span style={{ color: c.dot }}>.</span>
        </p>
        {slogan && <p className="mt-1 text-[11px] font-medium tracking-wide" style={{ color: variant === 'inverse' ? '#F4EDE5' : '#806071' }}>A vida da casa, em equilíbrio.</p>}
      </div>
    </div>
  )
}
