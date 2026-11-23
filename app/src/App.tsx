import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/auth'
import { isConfigured } from './lib/supabase'
import { Loading } from './components/ui'
import { Shell } from './components/Shell'
import { Login, Signup, ForgotPassword, ResetPassword } from './pages/Auth'
import { Onboarding, AcceptInvite } from './pages/Onboarding'
import { SetupNeeded } from './pages/SetupNeeded'

const Home = lazy(() => import('./pages/Home'))
const Stock = lazy(() => import('./pages/Stock'))
const ProductDetail = lazy(() => import('./pages/ProductDetail'))
const ProductForm = lazy(() => import('./pages/ProductForm'))
const Expiry = lazy(() => import('./pages/Expiry'))
const Shopping = lazy(() => import('./pages/Shopping'))
const SupermarketMode = lazy(() => import('./pages/SupermarketMode'))
const Expenses = lazy(() => import('./pages/Expenses'))
const StoreDetail = lazy(() => import('./pages/StoreDetail'))
const PurchaseDetail = lazy(() => import('./pages/PurchaseDetail'))
const Budget = lazy(() => import('./pages/Budget'))
const Reports = lazy(() => import('./pages/Reports'))
const ReceiptAdd = lazy(() => import('./pages/ReceiptAdd'))
const ReceiptReview = lazy(() => import('./pages/ReceiptReview'))
const More = lazy(() => import('./pages/More'))
const HouseSettings = lazy(() => import('./pages/HouseSettings'))
const Taxonomy = lazy(() => import('./pages/Taxonomy'))
const History = lazy(() => import('./pages/History'))
const ExportPage = lazy(() => import('./pages/ExportPage'))
const Account = lazy(() => import('./pages/Account'))
const Notifications = lazy(() => import('./pages/Notifications'))
const Finance = lazy(() => import('./pages/finance/Finance'))
const Movements = lazy(() => import('./pages/finance/Movements'))
const Accounts = lazy(() => import('./pages/finance/Accounts'))
const Heitor = lazy(() => import('./pages/finance/Heitor'))
const FinCalendar = lazy(() => import('./pages/finance/Calendar'))
const FinBudget = lazy(() => import('./pages/finance/FinBudget'))
const Goals = lazy(() => import('./pages/finance/Goals'))
const FinImport = lazy(() => import('./pages/finance/Import'))
const FinReports = lazy(() => import('./pages/finance/FinReports'))
const FinCategories = lazy(() => import('./pages/finance/FinCategories'))

function RequireHousehold({ children }: { children: ReactNode }) {
  const { session, household, loading } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading />
  if (!session) return <Navigate to="/entrar" replace state={{ from: loc.pathname }} />
  if (!household) return <Navigate to="/bem-vindo" replace />
  return <>{children}</>
}

export default function App() {
  const { session, loading, recovery } = useAuth()
  if (!isConfigured) return <SetupNeeded />
  if (loading) return <Loading label="A abrir o LAR.…" />
  if (recovery) return <ResetPassword />

  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/entrar" element={session ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/criar-conta" element={session ? <Navigate to="/" replace /> : <Signup />} />
        <Route path="/recuperar" element={<ForgotPassword />} />
        <Route path="/redefinir" element={<ResetPassword />} />
        <Route path="/convite/:token" element={<AcceptInvite />} />
        <Route path="/bem-vindo" element={session ? <Onboarding /> : <Navigate to="/entrar" replace />} />
        <Route path="/compras/supermercado" element={<RequireHousehold><SupermarketMode /></RequireHousehold>} />
        <Route element={<RequireHousehold><Shell /></RequireHousehold>}>
          <Route index element={<Home />} />
          <Route path="stock" element={<Stock />} />
          <Route path="stock/novo" element={<ProductForm />} />
          <Route path="stock/validades" element={<Expiry />} />
          <Route path="stock/:id" element={<ProductDetail />} />
          <Route path="stock/:id/editar" element={<ProductForm />} />
          <Route path="compras" element={<Shopping />} />
          <Route path="despesas" element={<Expenses />} />
          <Route path="despesas/loja/:chain" element={<StoreDetail />} />
          <Route path="despesas/compra/:id" element={<PurchaseDetail />} />
          <Route path="despesas/orcamento" element={<Budget />} />
          <Route path="despesas/relatorios" element={<Reports />} />
          <Route path="faturas/nova" element={<ReceiptAdd />} />
          <Route path="faturas/manual" element={<ReceiptReview />} />
          <Route path="faturas/:id" element={<ReceiptReview />} />
          <Route path="mais" element={<More />} />
          <Route path="mais/casa" element={<HouseSettings />} />
          <Route path="mais/categorias" element={<Taxonomy kind="categories" />} />
          <Route path="mais/localizacoes" element={<Taxonomy kind="locations" />} />
          <Route path="mais/historico" element={<History />} />
          <Route path="mais/exportar" element={<ExportPage />} />
          <Route path="mais/conta" element={<Account />} />
          <Route path="notificacoes" element={<Notifications />} />
          <Route path="financas" element={<Finance />} />
          <Route path="financas/movimentos" element={<Movements />} />
          <Route path="financas/contas" element={<Accounts />} />
          <Route path="financas/heitor" element={<Heitor />} />
          <Route path="financas/calendario" element={<FinCalendar />} />
          <Route path="financas/orcamento" element={<FinBudget />} />
          <Route path="financas/objetivos" element={<Goals />} />
          <Route path="financas/importar" element={<FinImport />} />
          <Route path="financas/relatorios" element={<FinReports />} />
          <Route path="financas/categorias" element={<FinCategories />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
