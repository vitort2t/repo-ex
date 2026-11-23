import { useRegisterSW } from 'virtual:pwa-register/react'

/** Aviso quando existe uma nova versão da aplicação (os dados nunca se perdem ao atualizar). */
export function UpdatePrompt() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, reg) { if (reg) setInterval(() => reg.update(), 60 * 60 * 1000) },
  })
  if (!needRefresh) return null
  return (
    <div className="fixed z-[55] left-4 right-4 bottom-24 md:bottom-6 md:left-auto md:w-96 card p-4 flex items-center gap-3 animate-pop">
      <p className="flex-1 text-sm">Há uma nova versão da aplicação.</p>
      <button className="btn-ghost h-10 px-3" onClick={() => setNeedRefresh(false)}>Depois</button>
      <button className="btn-primary h-10 px-4" onClick={() => updateServiceWorker(true)}>Atualizar</button>
    </div>
  )
}
