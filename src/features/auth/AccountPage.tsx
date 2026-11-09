import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Card, CardHeader, Loading } from '@/components/ui/misc'
import { friendlyError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { ThemeToggle } from '@/features/shell/ThemeToggle'
import { Logo } from '@/features/shell/Logo'
import { useAuth } from './AuthProvider'

export function AccountPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const profile = useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from('atlas_profiles').select('*').eq('id', user!.id).maybeSingle()
      if (error) throw error
      return data as { display_name: string; bio: string } | null
    },
  })
  const [name, setName] = useState('')
  const [bio, setBio] = useState('')
  const [pw, setPw] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (profile.data) {
      setName(profile.data.display_name)
      setBio(profile.data.bio)
    }
  }, [profile.data])

  return (
    <div className="min-h-full bg-bg">
      <header className="flex h-12 items-center gap-3 border-b border-border bg-surface px-4">
        <Link to="/projects" className="flex items-center gap-2 text-muted hover:text-fg"><ArrowLeft className="size-4" /><Logo size={22} withText /></Link>
        <div className="flex-1" />
        <ThemeToggle />
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-8">
        <h1 className="text-lg font-semibold">계정 설정</h1>
        <Card>
          <CardHeader title="프로필" sub={user?.email} />
          {profile.isLoading ? <Loading /> : (
            <form className="flex flex-col gap-3 p-4" onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              const { error } = await supabase.from('atlas_profiles').upsert({ id: user!.id, display_name: name.trim().slice(0, 80), bio })
              setBusy(false)
              if (error) toast.error(friendlyError(error))
              else { toast.success('프로필을 저장했습니다.'); qc.invalidateQueries({ queryKey: ['profile'] }) }
            }}>
              <Field label="표시 이름"><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></Field>
              <Field label="소개"><Textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={2000} /></Field>
              <div><Button type="submit" disabled={busy}>저장</Button></div>
            </form>
          )}
        </Card>
        <Card>
          <CardHeader title="비밀번호 변경" />
          <form className="flex items-end gap-2 p-4" onSubmit={async (e) => {
            e.preventDefault()
            if (pw.length < 8) return toast.error('비밀번호는 8자 이상이어야 합니다.')
            const { error } = await supabase.auth.updateUser({ password: pw })
            if (error) toast.error(friendlyError(error))
            else { toast.success('비밀번호를 변경했습니다.'); setPw('') }
          }}>
            <Field label="새 비밀번호" className="flex-1"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Button type="submit" variant="secondary">변경</Button>
          </form>
        </Card>
        <Card className="flex items-center justify-between p-4">
          <div>
            <p className="text-[13px] font-medium">로그아웃</p>
            <p className="text-[12px] text-muted">이 기기에서 세션을 종료합니다.</p>
          </div>
          <Button variant="secondary" onClick={() => supabase.auth.signOut()}><LogOut />로그아웃</Button>
        </Card>
      </main>
    </div>
  )
}
