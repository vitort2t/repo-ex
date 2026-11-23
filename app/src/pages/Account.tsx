import { useState } from 'react'
import { useAuth, useHousehold } from '@/hooks/auth'
import { supabase } from '@/lib/supabase'
import { friendlyError } from '@/lib/errors'
import { Field, Page, PageHeader, Spinner, useToast } from '@/components/ui'

export default function Account() {
  const { profile, user } = useHousehold()
  const { refresh } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(profile?.display_name ?? '')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const saveName = async () => {
    setBusy('name')
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', user.id)
    setBusy(null)
    if (error) return toast(friendlyError(error), 'alert')
    await refresh(); toast('Nome atualizado.')
  }
  const savePw = async () => {
    if (pw.length < 8) return toast('A palavra-passe deve ter pelo menos 8 caracteres.', 'alert')
    setBusy('pw')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(null)
    if (error) return toast(friendlyError(error), 'alert')
    setPw(''); toast('Palavra-passe alterada.')
  }
  return (
    <>
      <PageHeader title="A minha conta" subtitle={user.email} back />
      <Page>
        <div className="card p-4 space-y-3">
          <Field label="Nome"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <button className="btn-primary w-full" onClick={saveName} disabled={busy === 'name' || !name.trim()}>{busy === 'name' ? <Spinner className="text-white" /> : 'Guardar nome'}</button>
        </div>
        <div className="card p-4 space-y-3">
          <Field label="Nova palavra-passe" hint="Pelo menos 8 caracteres."><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
          <button className="btn-secondary w-full" onClick={savePw} disabled={busy === 'pw' || !pw}>{busy === 'pw' ? <Spinner /> : 'Alterar palavra-passe'}</button>
        </div>
      </Page>
    </>
  )
}
