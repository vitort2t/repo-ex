export function SetupNeeded() {
  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="card p-6 max-w-md space-y-3">
        <h1 className="text-xl font-bold">Configuração em falta</h1>
        <p className="text-sm text-ink-soft">
          A aplicação ainda não está ligada à base de dados. Defina as variáveis <code>VITE_SUPABASE_URL</code> e
          <code> VITE_SUPABASE_ANON_KEY</code> (ficheiro <code>.env.local</code> ou definições do Vercel) e volte a publicar.
          Consulte <code>docs/INSTALACAO.md</code>.
        </p>
      </div>
    </div>
  )
}
