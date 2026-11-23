import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { clearLocalCache } from '@/lib/queryClient'
import { supabase } from '@/lib/supabase'
import type { Household, Member, Profile } from '@/lib/types'

type AuthState = {
  loading: boolean
  session: Session | null
  user: User | null
  profile: Profile | null
  household: Household | null
  membership: Member | null
  recovery: boolean
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)
const HH_KEY = 'casa-em-stock-household'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  const [membership, setMembership] = useState<Member | null>(null)
  const [recovery, setRecovery] = useState(false)

  const loadContext = useCallback(async (s: Session | null) => {
    if (!s) { setProfile(null); setHousehold(null); setMembership(null); return }
    // Dados guardados permitem abrir a app sem internet.
    const cached = localStorage.getItem(HH_KEY)
    if (cached) {
      try {
        const c = JSON.parse(cached)
        if (c.userId === s.user.id) { setProfile(c.profile); setHousehold(c.household); setMembership(c.membership) }
      } catch { /* ignorar */ }
    }
    const [{ data: prof, error: pErr }, { data: mem, error: mErr }] = await Promise.all([
      supabase.from('profiles').select('id, display_name, email').eq('id', s.user.id).maybeSingle(),
      supabase.from('household_members').select('*').eq('user_id', s.user.id).order('joined_at', { ascending: false }).limit(1),
    ])
    if (pErr || mErr) return // offline: mantém o que estava em cache
    const m = (mem?.[0] as Member | undefined) ?? null
    let hh: Household | null = null
    if (m) {
      const { data } = await supabase.from('households').select('*').eq('id', m.household_id).maybeSingle()
      hh = (data as Household) ?? null
    }
    setProfile(prof as Profile); setMembership(m); setHousehold(hh)
    localStorage.setItem(HH_KEY, JSON.stringify({ userId: s.user.id, profile: prof, household: hh, membership: m }))
  }, [])

  useEffect(() => {
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadContext(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // adiar para fora do callback (recomendação do supabase-js)
        setTimeout(() => { loadContext(s) }, 0)
      }
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [loadContext])

  const refresh = useCallback(async () => { await loadContext(session) }, [loadContext, session])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    localStorage.removeItem(HH_KEY)
    await clearLocalCache()
    setRecovery(false)
  }, [])

  const value = useMemo<AuthState>(() => ({
    loading, session, user: session?.user ?? null, profile, household, membership, recovery, refresh, signOut,
  }), [loading, session, profile, household, membership, recovery, refresh, signOut])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}

/** Para ecrãs dentro da casa: devolve sempre household e user definidos. */
export function useHousehold() {
  const a = useAuth()
  if (!a.household || !a.user) throw new Error('Sem casa')
  return { ...a, household: a.household, user: a.user, hid: a.household.id }
}
