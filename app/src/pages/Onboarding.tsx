import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { useAuth } from '@/hooks/auth'
import { Field, Loading, Spinner } from '@/components/ui'
import { AuthLayout } from './Auth'

export function Onboarding() {
  const { household, refresh, profile, signOut } = useAuth()
  const [name, setName] = useState('A Nossa Casa')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const nav = useNavigate()
  if (household) return <Navigate to="/" replace />
  const create = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('create_household', { p_name: name })
    if (error) { setBusy(false); return setErr(friendlyError(error)) }
    await refresh()
    setBusy(false)
    nav('/', { replace: true })
  }
  return (
    <AuthLayout title={`Olá${profile?.display_name ? `, ${profile.display_name}` : ''}!`} subtitle="Para começar, crie a casa. Depois poderá convidar a outra pessoa."
      footer={<button onClick={signOut} className="text-ink-muted">Terminar sessão</button>}>
      <div className="space-y-4">
        <Field label="Nome da casa"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        {err && <p className="text-sm text-alert-ink">{err}</p>}
        <button className="btn-primary w-full" onClick={create} disabled={busy || !name.trim()}>{busy ? <Spinner className="text-white" /> : 'Criar a casa'}</button>
        <div className="card p-4 text-sm text-ink-soft">
          <p className="font-semibold text-ink mb-1">Foi convidado?</p>
          Abra a ligação de convite que recebeu. Entrará diretamente na casa partilhada.
        </div>
      </div>
    </AuthLayout>
  )
}

export function AcceptInvite() {
  const { token = '' } = useParams()
  const { session, user, refresh, household, signOut } = useAuth()
  const [info, setInfo] = useState<{ household_name: string; email: string; valid: boolean } | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const nav = useNavigate()

  useEffect(() => {
    // invite_info só está disponível para utilizadores autenticados (sem fuga de dados para anónimos)
    if (!session) return
    supabase.rpc('invite_info', { p_token: token }).then(({ data }) => setInfo((data as typeof info[] | null)?.[0] ?? null))
  }, [session, token])

  if (!session) return (
    <AuthLayout title="Convite para uma casa" subtitle="Crie a sua conta (ou entre) com o e-mail para onde foi enviado o convite.">
      <div className="space-y-3">
        <Link to={`/criar-conta?convite=${token}`} className="btn-primary w-full">Criar conta</Link>
        <Link to="/entrar" state={{ from: `/convite/${token}` }} className="btn-secondary w-full">Já tenho conta</Link>
      </div>
    </AuthLayout>
  )
  if (info === undefined) return <Loading />
  if (!info || !info.valid) return (
    <AuthLayout title="Convite inválido" subtitle="Este convite expirou, foi cancelado ou já foi usado. Peça um novo convite."
      footer={<Link to="/" className="font-semibold text-sage-700">Continuar</Link>}><span /></AuthLayout>
  )
  const accept = async () => {
    setBusy(true); setErr(null)
    const { error } = await supabase.rpc('accept_invite', { p_token: token })
    if (error) { setBusy(false); return setErr(friendlyError(error)) }
    await refresh()
    nav('/', { replace: true })
  }
  const mismatch = user?.email?.toLowerCase() !== info.email
  return (
    <AuthLayout title={`Entrar em “${info.household_name}”`} subtitle="Vão partilhar o mesmo stock, lista de compras, faturas e relatórios.">
      <div className="space-y-4">
        {household && <p className="text-sm bg-warn-bg text-warn-ink rounded-xl px-3.5 py-2.5">Já pertence à casa “{household.name}”. Ao aceitar, passará a ter acesso também a esta casa.</p>}
        {mismatch && <p className="text-sm bg-alert-bg text-alert-ink rounded-xl px-3.5 py-2.5">Este convite é para {info.email}, mas entrou como {user?.email}.</p>}
        {err && <p className="text-sm text-alert-ink">{err}</p>}
        {mismatch
          ? <button className="btn-secondary w-full" onClick={signOut}>Entrar com outra conta</button>
          : <button className="btn-primary w-full" onClick={accept} disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Aceitar convite'}</button>}
      </div>
    </AuthLayout>
  )
}
