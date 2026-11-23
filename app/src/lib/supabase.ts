import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

// A anon key é pública por natureza: o acesso aos dados é protegido pelas políticas RLS.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'lar-auth' },
  realtime: { params: { eventsPerSecond: 10 } },
})
