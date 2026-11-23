import { Copy, Share2, UserPlus, X } from 'lucide-react'
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth, useHousehold } from '@/hooks/auth'
import { useInvites, useMembers } from '@/hooks/data'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { fmtDate } from '@/lib/format'
import { Badge, Field, Page, PageHeader, Spinner, useConfirm, useToast } from '@/components/ui'

export default function HouseSettings() {
  const { hid, household, membership, user } = useHousehold()
  const { refresh } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const confirm = useConfirm()
  const { data: members = [] } = useMembers()
  const { data: invites = [] } = useInvites()
  const [name, setName] = useState(household.name)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const isOwner = membership?.role === 'owner'
  const link = (token: string) => `${window.location.origin}/convite/${token}`

  const saveName = async () => {
    const { error } = await supabase.from('households').update({ name: name.trim() }).eq('id', hid)
    if (error) return toast(friendlyError(error), 'alert')
    await refresh(); toast('Nome atualizado.')
  }

  const share = async (token: string) => {
    const url = link(token)
    const text = `Convite para a casa “${household.name}” no LAR.: ${url}`
    if (navigator.share) { try { await navigator.share({ title: 'LAR.', text, url }); return } catch { /* cancelado */ } }
    await navigator.clipboard.writeText(url)
    toast('Ligação copiada. Envie-a por mensagem.')
  }

  const invite = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('create_invite', { p_household: hid, p_email: email.trim() })
    setBusy(false)
    if (error) return toast(friendlyError(error), 'alert')
    setEmail('')
    qc.invalidateQueries({ queryKey: ['invites', hid] })
    await share((data as { token: string }).token)
  }

  const revoke = async (id: string) => {
    const { error } = await supabase.from('household_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id)
    if (error) return toast(friendlyError(error), 'alert')
    qc.invalidateQueries({ queryKey: ['invites', hid] })
  }

  const removeMember = async (uid: string, label: string) => {
    if (!(await confirm({ title: uid === user.id ? 'Sair da casa?' : `Remover ${label}?`, text: 'Deixa de ter acesso ao stock, compras e despesas desta casa. Os registos feitos mantêm-se.', confirm: 'Remover', danger: true }))) return
    const { error } = await supabase.from('household_members').delete().eq('household_id', hid).eq('user_id', uid)
    if (error) return toast(friendlyError(error), 'alert')
    if (uid === user.id) { await refresh(); return }
    qc.invalidateQueries({ queryKey: ['members', hid] })
  }

  const pendingInvites = invites.filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > new Date())

  return (
    <>
      <PageHeader title="A casa" back />
      <Page>
        <div className="card p-4 space-y-3">
          <Field label="Nome da casa"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          {name.trim() !== household.name && <button className="btn-primary w-full" onClick={saveName} disabled={!name.trim()}>Guardar</button>}
        </div>

        <section className="space-y-2">
          <h2 className="section-title px-1">Membros</h2>
          <div className="card divide-y divide-line/70">
            {members.map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <span className="h-10 w-10 rounded-full bg-navy-50 text-navy-700 grid place-items-center font-bold">{(m.profile?.display_name || '?').charAt(0).toUpperCase()}</span>
                <div className="flex-1 min-w-0"><p className="font-medium truncate">{m.profile?.display_name}{m.user_id === user.id && ' (eu)'}</p><p className="text-xs text-ink-muted truncate">{m.profile?.email}</p></div>
                {m.role === 'owner' ? <Badge tone="ok">Administrador</Badge> : (isOwner || m.user_id === user.id) &&
                  <button aria-label="Remover" className="h-9 w-9 grid place-items-center rounded-full hover:bg-champagne text-ink-muted" onClick={() => removeMember(m.user_id, m.profile?.display_name ?? 'membro')}><X size={17} /></button>}
              </div>
            ))}
          </div>
        </section>

        {isOwner && (
          <section className="space-y-2">
            <h2 className="section-title px-1">Convidar</h2>
            <div className="card p-4 space-y-3">
              <p className="text-sm text-ink-muted">Indique o e-mail da pessoa. Será criada uma ligação de convite para enviar por mensagem; a pessoa cria a conta com esse e-mail e entra diretamente nesta casa.</p>
              <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="vitor@exemplo.pt" /></Field>
              <button className="btn-primary w-full" onClick={invite} disabled={busy || !email.includes('@')}>{busy ? <Spinner className="text-white" /> : <><UserPlus size={18} />Criar convite</>}</button>
            </div>
            {pendingInvites.length > 0 && (
              <div className="card divide-y divide-line/70">
                {pendingInvites.map((i) => (
                  <div key={i.id} className="flex items-center gap-2 px-4 py-3">
                    <div className="flex-1 min-w-0"><p className="font-medium truncate">{i.email}</p><p className="text-xs text-ink-muted">Válido até {fmtDate(i.expires_at)}</p></div>
                    <button aria-label="Partilhar" className="h-9 w-9 grid place-items-center rounded-full hover:bg-champagne" onClick={() => share(i.token)}>{'share' in navigator ? <Share2 size={17} /> : <Copy size={17} />}</button>
                    <button aria-label="Cancelar convite" className="h-9 w-9 grid place-items-center rounded-full hover:bg-champagne text-ink-muted" onClick={() => revoke(i.id)}><X size={17} /></button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </Page>
    </>
  )
}
