// Cores dos gráficos (identidade LAR.). Verde/amarelo/vermelho ficam reservados para estados.
export const C = {
  navy: '#14263D', wine: '#642C40', plum: '#806071', rose: '#C07A93', steel: '#4F79A8', taupe: '#B3A07F',
  grid: '#ECE4DA', tick: '#8B8F98', cursor: 'rgba(20,38,61,.05)',
}
/** Ordem fixa para séries categóricas (categorias, pessoas). */
export const SERIES = ['#14263D', '#C07A93', '#4F79A8', '#642C40', '#B3A07F', '#806071', '#7FA7C9', '#3B2A4F']
export const axis = { tick: { fontSize: 11, fill: C.tick }, tickLine: false, axisLine: false } as const
export const euroTick = (v: unknown) => `${Math.round(Number(v))}€`
