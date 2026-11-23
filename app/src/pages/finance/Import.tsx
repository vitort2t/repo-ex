import { AlertTriangle, FileText, FileUp } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHousehold } from '@/hooks/auth'
import { useFinLookups, useInvalidateFinance } from '@/hooks/finance'
import { supabase } from '@/lib/supabase'
import { errorCode, friendlyError } from '@/lib/errors'
import { sha256 } from '@/lib/files'
import { fmtDate, money } from '@/lib/format'
import { parseStatementCsv, suggestForRow, type StatementRow } from '@/lib/finance'
import { CategorySelect } from '@/components/finance/MovementForm'
import { Badge, Page, PageHeader, Spinner, cx, useToast } from '@/components/ui'

type Nature = 'income' | 'expense' | 'transfer' | ''
type Row = StatementRow & { action: 'create' | 'skip' | 'link'; nature: Nature; category_id: string; to_account_id: string; dup?: { id: string; description: string; date: string; source: string } }

export default function Import() {
  const { hid } = useHousehold()
  const L = useFinLookups()
  const inv = useInvalidateFinance()
  const toast = useToast()
  const nav = useNavigate()
  const file = useRef<HTMLInputElement>(null)
  const [account, setAccount] = useState('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [meta, setMeta] = useState<{ name: string; hash: string; path: string | null } | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const prepare = async (parsed: StatementRow[]) => {
    const { data: dups } = await supabase.rpc('fin_find_duplicates', { p_household: hid, p_rows: parsed.map((r) => ({ key: r.key, date: r.date, amount: r.amount, description: r.description })), p_days: 3 })
    const byKey = new Map<string, { transaction_id: string; description: string; date: string; source: string }>()
    for (const d of (dups ?? []) as { key: string; transaction_id: string; description: string; date: string; source: string }[]) if (!byKey.has(d.key)) byKey.set(d.key, d)
    setRows(parsed.map((r) => {
      const s = suggestForRow(r.description, r.amount, L.cats)
      const d = byKey.get(r.key)
      return { ...r, nature: (s.nature ?? '') as Nature, category_id: s.categoryKey ? L.cats.find((c) => c.system_key === s.categoryKey)?.id ?? '' : '', to_account_id: '',
        action: d ? (d.source === 'purchase' || d.source === 'manual' ? 'link' : 'skip') : 'create',
        dup: d ? { id: d.transaction_id, description: d.description, date: d.date, source: d.source } : undefined }
    }))
  }

  const onFile = async (f: File | undefined) => {
    if (!f) return
    if (!account) return toast('Escolha primeiro a conta a que o extrato pertence.', 'alert')
    setBusy('read'); setWarnings([]); setRows(null)
    try {
      const hash = await sha256(f)
      const { data: prev } = await supabase.from('fin_imports').select('id, created_at').eq('household_id', hid).eq('file_sha256', hash).limit(1)
      if (prev?.length) { setBusy(null); return toast('Este extrato já foi importado.', 'alert') }
      const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      let parsed: StatementRow[] = []
      let path: string | null = null
      if (isPdf) {
        path = `${hid}/extratos/${crypto.randomUUID()}.pdf`
        const up = await supabase.storage.from('finance-docs').upload(path, f, { contentType: 'application/pdf' })
        if (up.error) throw up.error
        const { data, error } = await supabase.functions.invoke('parse-statement', { body: { path } })
        if (error) {
          let body: { error?: string } = {}
          try { body = await (error as { context?: Response }).context?.json() } catch { /* */ }
          throw new Error(body.error ?? 'Não foi possível ler o PDF. Exporte o extrato em CSV no site do banco.')
        }
        parsed = (data.rows as { date: string; description: string; amount: number }[]).map((r, i) => ({ key: String(i), ...r }))
        if (data.warnings?.length) setWarnings(data.warnings)
      } else {
        const text = await f.text()
        const res = parseStatementCsv(text)
        parsed = res.rows
        setWarnings(res.warnings)
      }
      setMeta({ name: f.name, hash, path })
      await prepare(parsed)
    } catch (e) { toast((e as Error).message && !(e as Error).message.includes('fetch') ? (e as Error).message : friendlyError(e), 'alert') }
    finally { setBusy(null) }
  }

  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs?.map((r) => (r.key === key ? { ...r, ...patch } : r)) ?? null)
  const counts = useMemo(() => ({
    create: rows?.filter((r) => r.action === 'create').length ?? 0, link: rows?.filter((r) => r.action === 'link').length ?? 0,
    skip: rows?.filter((r) => r.action === 'skip').length ?? 0, undecided: rows?.filter((r) => r.action === 'create' && !r.nature).length ?? 0,
  }), [rows])

  const confirmImport = async () => {
    if (!rows || !meta) return
    if (counts.undecided) return toast(`Indique se ${counts.undecided} movimento(s) são entradas, despesas ou transferências (ou ignore-os).`, 'alert')
    const badTransfer = rows.find((r) => r.action === 'create' && r.nature === 'transfer' && !r.to_account_id)
    if (badTransfer) return toast(`Escolha a outra conta da transferência “${badTransfer.description}”.`, 'alert')
    setBusy('save')
    const { data, error } = await supabase.rpc('fin_import_movements', {
      p_household: hid, p_import: { file_name: meta.name, file_sha256: meta.hash, file_path: meta.path, account_id: account },
      p_rows: rows.map((r) => ({ key: r.key, date: r.date, description: r.description, amount: r.amount, direction: r.amount < 0 ? 'out' : 'in', action: r.action,
        nature: r.nature || null, category_id: r.category_id || null, to_account_id: r.to_account_id || null, link_id: r.dup?.id ?? null })),
    })
    setBusy(null)
    if (error) return toast(errorCode(error).includes('IMPORT_ALREADY_DONE') ? 'Este extrato já foi importado.' : friendlyError(error), 'alert')
    const r = data as { created: number; linked: number; skipped: number }
    inv(); toast(`Importado: ${r.created} novos, ${r.linked} associados, ${r.skipped} ignorados.`)
    nav(`/financas/movimentos?conta=${account}`)
  }

  return (
    <>
      <PageHeader title="Importar extrato" back="/financas" />
      <Page>
        {!rows ? (
          <div className="card p-4 space-y-4">
            <label className="block"><span className="label">Conta do extrato</span>
              <select className="input" value={account} onChange={(e) => setAccount(e.target.value)}><option value="">Escolher…</option>{L.accounts.filter((a) => !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </label>
            <button className="btn-primary w-full" disabled={!!busy} onClick={() => (account ? file.current?.click() : toast('Escolha primeiro a conta.', 'alert'))}>
              {busy ? <><Spinner className="text-white" />{' '}A ler…</> : <><FileUp size={19} />Escolher ficheiro CSV ou PDF</>}
            </button>
            <input ref={file} type="file" accept=".csv,text/csv,application/pdf,.pdf,.txt" className="sr-only" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
            <ul className="text-xs text-ink-muted space-y-1 list-disc pl-4">
              <li>CSV: exportado no site/app do banco (recomendado — lido no próprio telemóvel).</li>
              <li>PDF: lido pelo serviço de leitura no servidor (requer a chave da IA configurada).</li>
              <li>Nada é registado antes de rever e confirmar. Movimentos que já existem (ex. faturas de supermercado) são detetados.</li>
              <li>O LAR. não acede ao banco: só lê o ficheiro que escolher.</li>
            </ul>
          </div>
        ) : (
          <>
            <div className="card p-4 flex items-center gap-3"><FileText size={20} className="text-navy-600" /><div className="flex-1 min-w-0"><p className="font-semibold truncate">{meta?.name}</p><p className="text-xs text-ink-muted">{rows.length} movimentos · {L.accountName(account)}</p></div>
              <button className="text-sm font-semibold text-navy-600" onClick={() => { setRows(null); setMeta(null) }}>Trocar</button></div>
            {warnings.length > 0 && <div className="card p-3 bg-warn-bg/60 text-sm text-warn-ink flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5" /><span>{warnings.join(' ')}</span></div>}
            <div className="flex flex-wrap gap-2"><Badge tone="ok">{counts.create} a criar</Badge><Badge>{counts.link} associar</Badge><Badge>{counts.skip} ignorar</Badge>{counts.undecided > 0 && <Badge tone="warn">{counts.undecided} por classificar</Badge>}</div>
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.key} className={cx('card p-3 space-y-2', r.action === 'skip' && 'opacity-55')}>
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0"><p className="font-medium text-sm leading-snug">{r.description}</p><p className="text-xs text-ink-muted">{fmtDate(r.date)}</p></div>
                    <p className={cx('font-bold tabular-nums', r.amount > 0 ? 'text-ok-ink' : 'text-ink')}>{r.amount > 0 ? '+' : '−'}{money(Math.abs(r.amount))}</p>
                  </div>
                  {r.dup && <p className="text-xs bg-champagne rounded-lg px-2.5 py-1.5">Já existe: <b>{r.dup.description}</b> ({fmtDate(r.dup.date)}{r.dup.source === 'purchase' ? ', fatura de supermercado' : ''})</p>}
                  <div className="grid grid-cols-3 gap-1 bg-champagne rounded-xl p-1 text-[12px] font-semibold">
                    {(['create', ...(r.dup ? ['link'] : []), 'skip'] as Row['action'][]).map((a) => (
                      <button key={a} onClick={() => update(r.key, { action: a })} className={cx('h-8 rounded-lg', r.action === a ? 'bg-white shadow-card' : 'text-ink-muted')}>{a === 'create' ? 'Registar' : a === 'link' ? 'É o mesmo' : 'Ignorar'}</button>
                    ))}
                  </div>
                  {r.action === 'create' && (
                    <div className="grid grid-cols-2 gap-2">
                      <select className={cx('input h-10 text-sm', !r.nature && 'border-warn')} value={r.nature} onChange={(e) => update(r.key, { nature: e.target.value as Nature, category_id: '' })} aria-label="Natureza">
                        <option value="">É o quê?</option>
                        {r.amount > 0 ? <option value="income">Rendimento</option> : <option value="expense">Despesa</option>}
                        <option value="transfer">Transferência própria</option>
                      </select>
                      {r.nature === 'transfer'
                        ? <select className="input h-10 text-sm" value={r.to_account_id} onChange={(e) => update(r.key, { to_account_id: e.target.value })} aria-label="Outra conta"><option value="">{r.amount < 0 ? 'Para a conta…' : 'Da conta…'}</option>{L.accounts.filter((a) => a.id !== account && !a.archived).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                        : r.nature ? <div className="[&_select]:h-10 [&_select]:text-sm"><CategorySelect kind={r.nature} value={r.category_id} onChange={(v) => update(r.key, { category_id: v })} cats={L.cats} /></div> : <span />}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button className="btn-primary w-full h-14" onClick={confirmImport} disabled={busy === 'save'}>{busy === 'save' ? <Spinner className="text-white" /> : `Confirmar importação (${counts.create + counts.link})`}</button>
            <p className="text-xs text-ink-muted px-1">Transferências (MB Way, TRF…) não são classificadas automaticamente: indique se são próprias, rendimento ou despesa.</p>
          </>
        )}
      </Page>
    </>
  )
}
