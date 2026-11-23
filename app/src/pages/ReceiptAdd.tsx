import { Camera, ChevronRight, FileText, Image as ImageIcon, PenLine } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useHousehold } from '@/hooks/auth'
import { keys, useReceipts } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { compressImage, sha256 } from '@/lib/files'
import { fmtDate, money, relativeDay } from '@/lib/format'
import type { Receipt } from '@/lib/types'
import { Badge, Page, PageHeader, Spinner, useConfirm, useToast } from '@/components/ui'

type Step = null | 'hash' | 'upload' | 'reading'

export const STATUS_LABEL: Record<string, { label: string; tone: 'neutral' | 'ok' | 'warn' | 'alert' }> = {
  uploaded: { label: 'Por ler', tone: 'neutral' },
  processing: { label: 'A ler…', tone: 'neutral' },
  parsed: { label: 'Por confirmar', tone: 'warn' },
  failed: { label: 'Leitura falhou', tone: 'alert' },
  confirmed: { label: 'Confirmada', tone: 'ok' },
  discarded: { label: 'Descartada', tone: 'neutral' },
  voided: { label: 'Anulada', tone: 'neutral' },
}

/** Invoca a Edge Function que interpreta a fatura no servidor. */
export async function parseReceipt(receiptId: string): Promise<{ ok: true } | { ok: false; code?: string; message: string }> {
  const { error } = await supabase.functions.invoke('parse-receipt', { body: { receipt_id: receiptId } })
  if (!error) return { ok: true }
  let body: { error?: string; code?: string } = {}
  try { body = await (error as { context?: Response }).context?.json() } catch { /* sem corpo */ }
  return { ok: false, code: body.code, message: body.error ?? friendlyError(error) }
}

export default function ReceiptAdd() {
  const { hid, user } = useHousehold()
  const nav = useNavigate()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: pending = [] } = useReceipts()
  const [step, setStep] = useState<Step>(null)
  const camera = useRef<HTMLInputElement>(null)
  const gallery = useRef<HTMLInputElement>(null)
  const pdf = useRef<HTMLInputElement>(null)

  const handle = async (file: File | undefined) => {
    if (!file) return
    if (!navigator.onLine) return toast('É preciso internet para enviar a fatura.', 'alert')
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    if (!isPdf && !file.type.startsWith('image/')) return toast('Escolha uma fotografia ou um PDF.', 'alert')
    if (file.size > 15 * 1024 * 1024) return toast('O ficheiro é demasiado grande (máx. 15 MB).', 'alert')
    try {
      setStep('hash')
      const hash = await sha256(file)
      // Mesmo ficheiro já importado?
      const { data: dup } = await supabase.from('receipts').select('id, status, created_at, store_name, total_paid')
        .eq('household_id', hid).eq('file_sha256', hash).neq('status', 'discarded').limit(1)
      if (dup?.length) {
        setStep(null)
        const d = dup[0] as Receipt
        const go = await confirm({
          title: 'Esta fatura já foi importada',
          text: `O mesmo ficheiro foi importado ${relativeDay(d.created_at).toLowerCase()}${d.store_name ? ` (${d.store_name}${d.total_paid ? `, ${money(d.total_paid)}` : ''})` : ''}. ${d.status === 'confirmed' ? 'A compra já está registada, por isso não será contabilizada de novo.' : 'Pode continuar a revisão dessa importação.'}`,
          confirm: 'Ver fatura', cancel: 'Fechar',
        })
        if (go) nav(`/faturas/${d.id}`)
        return
      }
      setStep('upload')
      const id = crypto.randomUUID()
      const blob = isPdf ? file : await compressImage(file)
      const mime = isPdf ? 'application/pdf' : blob.type || 'image/jpeg'
      const ext = isPdf ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
      const path = `${hid}/${id}.${ext}`
      const { error: upErr } = await supabase.storage.from('receipts').upload(path, blob, { contentType: mime, upsert: false })
      if (upErr) throw upErr
      const { error: insErr } = await supabase.from('receipts').insert({
        id, household_id: hid, file_path: path, file_sha256: hash, mime_type: mime, uploaded_by: user.id, status: 'uploaded',
      })
      if (insErr) throw insErr
      qc.invalidateQueries({ queryKey: keys.receipts(hid) })
      setStep('reading')
      const res = await parseReceipt(id)
      if (!res.ok) toast(res.code === 'AI_NOT_CONFIGURED' ? 'Leitura automática indisponível: introduza os dados manualmente.' : res.message, 'alert')
      nav(`/faturas/${id}`, { replace: true })
    } catch (e) {
      toast(String((e as Error)?.message).includes('duplicate') ? 'Esta fatura já foi importada.' : friendlyError(e), 'alert')
    } finally { setStep(null) }
  }

  const resumable = pending.filter((r) => r.status !== 'confirmed')

  return (
    <>
      <PageHeader title="Adicionar fatura" back />
      <Page>
        {step ? (
          <div className="card p-8 flex flex-col items-center text-center gap-4">
            <Spinner size={36} />
            <div>
              <p className="font-semibold text-lg">{step === 'reading' ? 'A ler a fatura…' : step === 'upload' ? 'A enviar…' : 'A verificar…'}</p>
              <p className="text-sm text-ink-muted mt-1">{step === 'reading' ? 'Pode demorar até um minuto. Não feche a aplicação.' : 'Um momento.'}</p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <button className="card w-full p-5 flex items-center gap-4 text-left active:scale-[.99] transition" onClick={() => camera.current?.click()}>
              <span className="h-12 w-12 rounded-2xl bg-navy-600 text-white grid place-items-center"><Camera size={24} /></span>
              <span className="flex-1"><b className="block text-[17px]">Fotografar fatura</b><span className="text-sm text-ink-muted">Fotografe o talão inteiro, com boa luz</span></span>
            </button>
            <button className="card w-full p-5 flex items-center gap-4 text-left active:scale-[.99] transition" onClick={() => gallery.current?.click()}>
              <span className="h-12 w-12 rounded-2xl bg-champagne grid place-items-center"><ImageIcon size={24} /></span>
              <span className="flex-1"><b className="block text-[17px]">Escolher da galeria</b><span className="text-sm text-ink-muted">Uma fotografia já tirada</span></span>
            </button>
            <button className="card w-full p-5 flex items-center gap-4 text-left active:scale-[.99] transition" onClick={() => pdf.current?.click()}>
              <span className="h-12 w-12 rounded-2xl bg-champagne grid place-items-center"><FileText size={24} /></span>
              <span className="flex-1"><b className="block text-[17px]">Anexar ficheiro PDF</b><span className="text-sm text-ink-muted">Fatura recebida por e-mail ou na app da loja</span></span>
            </button>
            <Link to="/faturas/manual" className="flex items-center gap-3 px-2 py-3 text-ink-soft">
              <PenLine size={18} /><span className="flex-1 text-sm font-medium">Registar compra sem fatura</span><ChevronRight size={18} />
            </Link>
            <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = '' }} />
            <input ref={gallery} type="file" accept="image/*" className="sr-only" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = '' }} />
            <input ref={pdf} type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => { handle(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        )}

        {resumable.length > 0 && !step && (
          <section className="space-y-2">
            <h2 className="section-title px-1 pt-2">Faturas por concluir</h2>
            <div className="card divide-y divide-line/70">
              {resumable.map((r) => (
                <Link key={r.id} to={`/faturas/${r.id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{r.store_name ?? 'Fatura'}{r.total_paid !== null ? ` · ${money(r.total_paid)}` : ''}</p>
                    <p className="text-xs text-ink-muted">{r.purchase_date ? fmtDate(r.purchase_date) : relativeDay(r.created_at)}</p>
                  </div>
                  <Badge tone={STATUS_LABEL[r.status].tone}>{STATUS_LABEL[r.status].label}</Badge>
                </Link>
              ))}
            </div>
          </section>
        )}
        <p className="text-xs text-ink-muted px-1">O stock só é atualizado depois de rever e confirmar os dados. A fatura original fica guardada de forma privada.</p>
      </Page>
    </>
  )
}
