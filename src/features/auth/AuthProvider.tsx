import type { Session, User } from '@supabase/supabase-js'
import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  recovery: boolean
  clearRecovery: () => void
}

const AuthCtx = createContext<AuthState>({ session: null, user: null, loading: true, recovery: false, clearRecovery: () => {} })

async function ensureProfile(user: User) {
  const { data } = await supabase.from('atlas_profiles').select('id').eq('id', user.id).maybeSingle()
  if (!data) {
    const name = (user.user_metadata?.display_name as string | undefined) ?? user.email?.split('@')[0] ?? ''
    await supabase.from('atlas_profiles').insert({ id: user.id, display_name: name.slice(0, 80) })
  }
  const { data: accepted } = await supabase.rpc('atlas_accept_invites')
  if (typeof accepted === 'number' && accepted > 0) toast.success(`초대받은 프로젝트 ${accepted}개가 목록에 추가되었습니다.`)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)
  const qc = useQueryClient()
  const prevUser = useRef<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
      if (data.session?.user) {
        prevUser.current = data.session.user.id
        ensureProfile(data.session.user).catch(() => {})
      }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      if (event === 'SIGNED_IN' && s?.user && prevUser.current !== s.user.id) {
        prevUser.current = s.user.id
        qc.clear()
        setTimeout(() => ensureProfile(s.user).then(() => qc.invalidateQueries()).catch(() => {}), 0)
      }
      if (event === 'SIGNED_OUT') {
        if (prevUser.current) toast.info('로그아웃되었습니다.')
        prevUser.current = null
        qc.clear()
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [qc])

  return (
    <AuthCtx.Provider value={{ session, user: session?.user ?? null, loading, recovery, clearRecovery: () => setRecovery(false) }}>
      {children}
    </AuthCtx.Provider>
  )
}

export function useAuth() {
  return useContext(AuthCtx)
}
