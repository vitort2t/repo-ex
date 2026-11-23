import { describe, expect, it } from 'vitest'
import { categoryChanges, consolidate, expensesByCategory, expensesByPerson, monthSummary, nextOccurrences, parseStatementCsv, savingsSeries, suggestForRow,
  type AccountBalance, type FinAccount, type FinCategory, type FinPerson, type FinTx } from '@/lib/finance'

const cat = (id: string, kind: FinCategory['kind'], name: string, parent: string | null = null, key: string | null = null): FinCategory =>
  ({ id, household_id: 'h', kind, parent_id: parent, name, system_key: key, sort: 0, archived: false })
const cats = [cat('ali', 'expense', 'Alimentação', null, 'alimentacao'), cat('sup', 'expense', 'Supermercado', 'ali', 'alimentacao.supermercado'),
  cat('hab', 'expense', 'Habitação', null, 'habitacao'), cat('hei', 'expense', 'Heitor', null, 'heitor'), cat('heit', 'expense', 'Transferências', 'hei', 'heitor.transferencias'),
  cat('sal', 'income', 'Salários', null, 'income.salarios')]
const catMap = new Map(cats.map((c) => [c.id, c]))
let n = 0
const tx = (p: Partial<FinTx>): FinTx => ({ id: String(++n), household_id: 'h', client_id: null, nature: 'expense', direction: 'out', status: 'done', amount: 10, currency: 'EUR',
  date: '2026-11-10', description: 'x', category_id: null, account_id: 'ana', person_id: 'pa', beneficiary_id: null, scope: 'shared', payment_method: null, notes: null,
  proof_path: null, transfer_group: null, transfer_kind: null, goal_id: null, recurring_id: null, purchase_id: null, import_id: null, source: 'manual',
  created_by: null, updated_by: null, created_at: '', updated_at: '', ...p })

const txs: FinTx[] = [
  tx({ nature: 'income', direction: 'in', amount: 1500, category_id: 'sal' }),
  tx({ nature: 'income', direction: 'in', amount: 300, status: 'planned' }),                       // previsto: não conta
  tx({ amount: 650, category_id: 'hab' }),
  tx({ amount: 80, category_id: 'sup', person_id: 'pv' }),
  tx({ amount: 20, category_id: 'sup', status: 'cancelled' }),                                     // anulado: não conta
  tx({ amount: 203.5, category_id: 'heit', beneficiary_id: 'heitor' }),
  tx({ nature: 'transfer', direction: 'out', amount: 300, transfer_group: 'g1', transfer_kind: 'savings', account_id: 'ana' }),
  tx({ nature: 'transfer', direction: 'in', amount: 300, transfer_group: 'g1', transfer_kind: 'savings', account_id: 'pou' }),
  tx({ amount: 40, category_id: 'sup', date: '2026-10-05' }), tx({ amount: 700, category_id: 'hab', date: '2026-10-01' }),
  tx({ amount: 99, status: 'pending', category_id: 'hab' }),
]

describe('resumo financeiro do mês', () => {
  const s = monthSummary(txs, '2026-11', catMap, 'heitor', new Set(['pou']))
  it('só conta valores realizados', () => {
    expect(s.income).toBe(1500)
    expect(s.expenses).toBe(650 + 80 + 203.5)
    expect(s.plannedIncome).toBe(300)
    expect(s.pendingExpenses).toBe(99)
  })
  it('transferências próprias e poupança não são despesa nem rendimento', () => {
    expect(s.ownTransfers).toBe(300)
    expect(s.saved).toBe(300)
    expect(s.net).toBe(1500 - 933.5)
  })
  it('envio ao Heitor contado como apoio familiar', () => { expect(s.heitor).toBe(203.5) })
})

describe('análise e categorias', () => {
  it('agrupa por categoria principal', () => {
    const c = expensesByCategory(txs, ['2026-11'], catMap)
    expect(c.find((x) => x.name === 'Alimentação')?.total).toBe(80)
    expect(c[0].name).toBe('Habitação')
  })
  it('onde se economizou e o que aumentou face ao mês anterior', () => {
    const a = categoryChanges(txs, '2026-11', catMap)
    expect(a.decreased.map((d) => d.name)).toContain('Habitação')     // 700 → 650
    expect(a.increased.map((d) => d.name)).toEqual(expect.arrayContaining(['Alimentação', 'Heitor']))
    expect(a.top[0].name).toBe('Habitação')
  })
  it('quem pagou (partilhadas contam uma vez)', () => {
    const people: FinPerson[] = [{ id: 'pa', household_id: 'h', name: 'Ana', kind: 'member', user_id: 'u1', archived: false }, { id: 'pv', household_id: 'h', name: 'Vitor', kind: 'member', user_id: 'u2', archived: false }]
    const r = expensesByPerson(txs, ['2026-11'], people)
    expect(r.find((x) => x.name === 'Vitor')?.total).toBe(80)
    expect(r.reduce((s, x) => s + x.total, 0)).toBe(933.5)
  })
})

describe('saldos', () => {
  it('consolidado, disponível e reservado', () => {
    const b = (p: Partial<AccountBalance>): AccountBalance => ({ id: 'x', household_id: 'h', name: 'x', kind: 'bank', currency: 'EUR', owner_person_id: null, institution: null, archived: false, reserved_amount: 0, opening_balance: 0, balance: 0, pending_out: 0, pending_in: 0, ...p })
    const c = consolidate([b({ balance: 1000, pending_out: 100, reserved_amount: 200 }), b({ kind: 'savings', balance: 500 }), b({ kind: 'credit_card', balance: -50 }), b({ currency: 'BRL', balance: 900 })])
    expect(c.real).toBe(1450)
    expect(c.available).toBe(1000 - 200 - 50 - 100)
    expect(c.reserved).toBe(700)
    expect(c.byCurrency.BRL).toBe(900)
  })
  it('evolução da poupança', () => {
    const acc: FinAccount[] = [{ id: 'pou', household_id: 'h', name: 'Poupança', kind: 'savings', owner_person_id: null, institution: null, currency: 'EUR', opening_balance: 100, opening_date: '2026-01-01', reserved_amount: 0, archived: false, sort: 0 }]
    expect(savingsSeries(txs, acc, ['2026-10', '2026-11']).map((r) => r.total)).toEqual([100, 400])
  })
})

describe('recorrências', () => {
  it('mensal no fim do mês respeita meses curtos', () => {
    expect(nextOccurrences({ next_due: '2026-01-31', frequency: 'monthly', interval_n: 1, end_date: null }, 3)).toEqual(['2026-01-31', '2026-02-28', '2026-03-31'])
  })
  it('semanal e fim', () => {
    expect(nextOccurrences({ next_due: '2026-11-01', frequency: 'weekly', interval_n: 2, end_date: '2026-11-20' }, 5)).toEqual(['2026-11-01', '2026-11-15'])
  })
})

describe('extratos CSV', () => {
  it('formato português com débito/crédito', () => {
    const csv = 'Extrato da conta\nData Mov.;Data Valor;Descrição;Débito;Crédito;Saldo\n02-11-2026;02-11-2026;COMPRA MERCADONA;23,40;;1.000,00\n05-11-2026;05-11-2026;TRF SALARIO NOVEMBRO;;1.500,00;2.476,60\n'
    const { rows } = parseStatementCsv(csv)
    expect(rows).toEqual([
      { key: '2', date: '2026-11-02', description: 'COMPRA MERCADONA', amount: -23.4 },
      { key: '3', date: '2026-11-05', description: 'TRF SALARIO NOVEMBRO', amount: 1500 },
    ])
  })
  it('coluna única de montante com sinal', () => {
    const { rows } = parseStatementCsv('Data,Descricao,Montante\n2026-11-03,"GALP, LDA",-45.10\n')
    expect(rows[0]).toMatchObject({ date: '2026-11-03', description: 'GALP, LDA', amount: -45.1 })
  })
  it('colunas desconhecidas → aviso', () => {
    expect(parseStatementCsv('a;b\n1;2').warnings[0]).toMatch(/colunas/)
  })
  it('sugestões: transferências não são presumidas', () => {
    const all = [...cats, cat('comb', 'expense', 'Combustível', null, 'transportes.combustivel')]
    expect(suggestForRow('TRF MB WAY JOAO', -20, all).nature).toBeNull()
    expect(suggestForRow('COMPRA MERCADONA PORTO', -23.4, all)).toEqual({ nature: 'expense', categoryKey: 'alimentacao.supermercado' })
    expect(suggestForRow('VENCIMENTO NOV', 1500, all)).toEqual({ nature: 'income', categoryKey: 'income.salarios' })
  })
})
