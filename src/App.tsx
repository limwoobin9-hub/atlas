import { QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TooltipProvider } from '@radix-ui/react-tooltip'
import { lazy, Suspense, useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { Toaster, toast } from 'sonner'
import { ConfirmProvider } from '@/components/ui/dialog'
import { Loading } from '@/components/ui/misc'
import { friendlyError } from '@/lib/errors'
import { supabaseConfigured } from '@/lib/supabase'
import { applyTheme, useSession } from '@/stores/session'
import { AccountPage } from '@/features/auth/AccountPage'
import { AuthProvider } from '@/features/auth/AuthProvider'
import { ForgotPasswordPage, LoginPage, RequireAuth, SignupPage, UpdatePasswordPage } from '@/features/auth/AuthPages'
import { ProjectsPage } from '@/features/projects/ProjectsPage'
import { ErrorBoundary } from '@/features/shell/ErrorBoundary'
import { ProjectLayout } from '@/features/shell/ProjectLayout'
import { EntityListPage } from '@/features/entities/EntityListPage'
import { kindByRoute } from '@/domain/kinds'

const MapPage = lazy(() => import('@/features/map/MapPage'))
const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage').then((x) => ({ default: x.DashboardPage })))
const TimelinePage = lazy(() => import('@/features/timeline/TimelinePage').then((x) => ({ default: x.TimelinePage })))
const PoliticsPage = lazy(() => import('@/features/politics/PoliticsPage').then((x) => ({ default: x.PoliticsPage })))
const ParliamentsPage = lazy(() => import('@/features/parliament/ParliamentsPage').then((x) => ({ default: x.ParliamentsPage })))
const DiplomacyPage = lazy(() => import('@/features/diplomacy/DiplomacyPage').then((x) => ({ default: x.DiplomacyPage })))
const WarsPage = lazy(() => import('@/features/wars/WarsPage').then((x) => ({ default: x.WarsPage })))
const MilitaryPage = lazy(() => import('@/features/military/OrderOfBattle').then((x) => ({ default: x.MilitaryPage })))
const AssetsPage = lazy(() => import('@/features/assets/AssetsPage').then((x) => ({ default: x.AssetsPage })))
const SearchPage = lazy(() => import('@/features/search/SearchPage').then((x) => ({ default: x.SearchPage })))
const BranchesPage = lazy(() => import('@/features/branches/BranchesPage').then((x) => ({ default: x.BranchesPage })))
const HistoryPage = lazy(() => import('@/features/history/HistoryPage').then((x) => ({ default: x.HistoryPage })))
const ConflictsPage = lazy(() => import('@/features/conflicts/ConflictsPage').then((x) => ({ default: x.ConflictsPage })))
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage').then((x) => ({ default: x.SettingsPage })))
const CountriesPage = lazy(() => import('@/features/countries/CountriesPage').then((x) => ({ default: x.CountriesPage })))
const EntityDetailPage = lazy(() => import('@/features/entities/EntityDetailPage').then((x) => ({ default: x.EntityDetailPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: (n, e) => n < 2 && !/permission|forbidden|JWT/i.test(String((e as Error)?.message)), refetchOnWindowFocus: false },
    mutations: { onError: (e) => toast.error(friendlyError(e)) },
  },
  queryCache: new QueryCache({
    onError: (e) => { if (/JWT expired|refresh token/i.test(String((e as Error).message))) toast.error('로그인 세션이 만료되었습니다. 다시 로그인하세요.') },
  }),
})

const SPECIAL = new Set(['map', 'timeline', 'politics', 'parliaments', 'diplomacy', 'wars', 'military', 'assets', 'search', 'branches', 'history', 'conflicts', 'settings', 'countries'])

function KindRoute() {
  const { kindRoute = '' } = useParams()
  const meta = kindByRoute(kindRoute)
  if (!meta || SPECIAL.has(kindRoute)) return <Navigate to=".." replace />
  return <EntityListPage key={meta.kind} kind={meta.kind} />
}

function KindDetailRoute() {
  const { kindRoute = '' } = useParams()
  return <S><EntityDetailPage kindRoute={kindRoute} /></S>
}

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Loading />}>{children}</Suspense>
}

function ThemeSync() {
  const theme = useSession((s) => s.theme)
  useEffect(() => {
    applyTheme(theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const fn = () => applyTheme(useSession.getState().theme)
    mq.addEventListener('change', fn)
    return () => mq.removeEventListener('change', fn)
  }, [theme])
  return null
}

export default function App() {
  if (!supabaseConfigured) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div><h1 className="text-lg font-semibold">ATLAS 설정이 필요합니다</h1><p className="mt-2 text-[13px] text-muted">VITE_SUPABASE_URL과 VITE_SUPABASE_PUBLISHABLE_KEY 환경변수를 설정하세요 (.env.example 참고).</p></div>
      </div>
    )
  }
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeSync />
      <TooltipProvider>
        <ConfirmProvider>
          <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
            <AuthProvider>
              <ErrorBoundary>
                <Routes>
                  <Route path="/login" element={<LoginPage />} />
                  <Route path="/signup" element={<SignupPage />} />
                  <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                  <Route path="/update-password" element={<UpdatePasswordPage />} />
                  <Route path="/account" element={<RequireAuth><AccountPage /></RequireAuth>} />
                  <Route path="/projects" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
                  <Route path="/p/:projectId" element={<RequireAuth><ProjectLayout /></RequireAuth>}>
                    <Route index element={<S><DashboardPage /></S>} />
                    <Route path="map" element={<Suspense fallback={<Loading label="지도 엔진을 불러오는 중…" />}><MapPage /></Suspense>} />
                    <Route path="timeline" element={<S><TimelinePage /></S>} />
                    <Route path="countries" element={<S><CountriesPage /></S>} />
                    <Route path="politics" element={<S><PoliticsPage /></S>} />
                    <Route path="parliaments" element={<S><ParliamentsPage /></S>} />
                    <Route path="diplomacy" element={<S><DiplomacyPage /></S>} />
                    <Route path="wars" element={<S><WarsPage /></S>} />
                    <Route path="military" element={<S><MilitaryPage /></S>} />
                    <Route path="assets" element={<S><AssetsPage /></S>} />
                    <Route path="search" element={<S><SearchPage /></S>} />
                    <Route path="branches" element={<S><BranchesPage /></S>} />
                    <Route path="history" element={<S><HistoryPage /></S>} />
                    <Route path="conflicts" element={<S><ConflictsPage /></S>} />
                    <Route path="settings" element={<S><SettingsPage /></S>} />
                    <Route path=":kindRoute" element={<KindRoute />} />
                    <Route path=":kindRoute/:entityId" element={<KindDetailRoute />} />
                  </Route>
                  <Route path="*" element={<Navigate to="/projects" replace />} />
                </Routes>
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
          <Toaster position="bottom-right" richColors closeButton toastOptions={{ style: { fontSize: 13 } }} />
        </ConfirmProvider>
      </TooltipProvider>
    </QueryClientProvider>
  )
}
