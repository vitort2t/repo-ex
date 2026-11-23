import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { useAuth } from '@/hooks/auth'
import { Field, Spinner, useToast } from '@/components/ui'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-5 py-10 pt-safe">
      <div className="w-full max-w-sm animate-pop">
        <div className="flex items-center gap-3 mb-8">
          <img src="/favicon.svg" alt="" className="h-12 w-12 rounded-2xl shadow-card" />
          <div>
            <p className="font-bold text-lg tracking-tight leading-tight">Casa em Stock</p>
            <p className="text-xs text-ink-muted">A despensa, as compras e as contas da casa</p>
          </div>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-ink-muted mt-1 text-[15px]">{subtitle}</p>}
        <div className="mt-6">{children}</div>
        {footer && <div className="mt-6 text-sm text-center text-ink-muted">{footer}</div>}
      </div>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string | null }) {
  return msg ? <p className="text-sm text-alert-ink bg-alert-bg rounded-xl px-3.5 py-2.5">{msg}</p> : null
}

export function Login() {
  const nav = useNavigate()
  const loc = useLocation() as { state?: { from?: string } }
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) return setErr(friendlyError(error))
    nav(loc.state?.from ?? '/', { replace: true })
  }
  return (
    <AuthLayout title="Entrar" subtitle="Bem-vindo de volta."
      footer={<>Ainda não tem conta? <Link to="/criar-conta" className="font-semibold text-sage-700">Criar conta</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="E-mail"><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Palavra-passe"><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorMsg msg={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Entrar'}</button>
        <Link to="/recuperar" className="block text-center text-sm text-ink-muted">Esqueci-me da palavra-passe</Link>
      </form>
    </AuthLayout>
  )
}

export function Signup() {
  const [params] = useSearchParams()
  const invite = params.get('convite')
  const [name, setName] = useState('')
  const [email, setEmail] = useState(params.get('email') ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const nav = useNavigate()
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    if (password.length < 8) return setErr('A palavra-passe deve ter pelo menos 8 caracteres.')
    setBusy(true)
    const redirect = window.location.origin + (invite ? `/convite/${invite}` : '/bem-vindo')
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: redirect },
    })
    setBusy(false)
    if (error) return setErr(friendlyError(error))
    if (data.session) nav(invite ? `/convite/${invite}` : '/bem-vindo', { replace: true })
    else setSent(true)
  }
  if (sent) return (
    <AuthLayout title="Confirme o seu e-mail" subtitle={`Enviámos uma ligação de confirmação para ${email}. Abra-a neste dispositivo para concluir.`}
      footer={<Link to="/entrar" className="font-semibold text-sage-700">Voltar a entrar</Link>}><span /></AuthLayout>
  )
  return (
    <AuthLayout title="Criar conta" subtitle={invite ? 'Crie a sua conta para entrar na casa para onde foi convidado.' : 'Cada pessoa da casa tem a sua conta.'}
      footer={<>Já tem conta? <Link to={invite ? `/entrar` : '/entrar'} state={invite ? { from: `/convite/${invite}` } : undefined} className="font-semibold text-sage-700">Entrar</Link></>}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="O seu nome"><input className="input" autoComplete="given-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Vitor" /></Field>
        <Field label="E-mail"><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Palavra-passe" hint="Pelo menos 8 caracteres."><input className="input" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorMsg msg={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Criar conta'}</button>
      </form>
    </AuthLayout>
  )
}

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin + '/redefinir' })
    setBusy(false)
    if (error) return setErr(friendlyError(error))
    setSent(true)
  }
  return (
    <AuthLayout title="Recuperar palavra-passe" subtitle={sent ? 'Se existir uma conta com este e-mail, receberá uma ligação para definir uma nova palavra-passe.' : 'Indique o e-mail da sua conta.'}
      footer={<Link to="/entrar" className="font-semibold text-sage-700">Voltar a entrar</Link>}>
      {!sent && (
        <form onSubmit={submit} className="space-y-4">
          <Field label="E-mail"><input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <ErrorMsg msg={err} />
          <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Enviar ligação'}</button>
        </form>
      )}
    </AuthLayout>
  )
}

export function ResetPassword() {
  const { session } = useAuth()
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const toast = useToast()
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setErr(null)
    if (password.length < 8) return setErr('A palavra-passe deve ter pelo menos 8 caracteres.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) return setErr(friendlyError(error))
    toast('Palavra-passe alterada.')
    window.location.replace('/')
  }
  if (!session) return (
    <AuthLayout title="Ligação inválida" subtitle="A ligação expirou ou já foi usada. Peça uma nova."
      footer={<Link to="/recuperar" className="font-semibold text-sage-700">Pedir nova ligação</Link>}><span /></AuthLayout>
  )
  return (
    <AuthLayout title="Nova palavra-passe">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nova palavra-passe" hint="Pelo menos 8 caracteres."><input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        <ErrorMsg msg={err} />
        <button className="btn-primary w-full" disabled={busy}>{busy ? <Spinner className="text-white" /> : 'Guardar'}</button>
      </form>
    </AuthLayout>
  )
}
