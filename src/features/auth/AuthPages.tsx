import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { friendlyError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

const redirectBase = () => `${window.location.origin}${import.meta.env.BASE_URL}`

const loginSchema = z.object({
  email: z.string().trim().email('올바른 이메일 주소를 입력하세요.'),
  password: z.string().min(1, '비밀번호를 입력하세요.'),
})

export function LoginPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const [error, setError] = useState<string | null>(null)
  const [unconfirmed, setUnconfirmed] = useState<string | null>(null)
  const form = useForm<z.infer<typeof loginSchema>>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '' } })
  const from = (loc.state as { from?: string } | null)?.from ?? '/projects'

  if (user) return <Navigate to={from} replace />

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null)
    setUnconfirmed(null)
    const { error } = await supabase.auth.signInWithPassword({ email: v.email, password: v.password })
    if (error) {
      if (/Email not confirmed/i.test(error.message)) setUnconfirmed(v.email)
      setError(friendlyError(error))
      return
    }
    nav(from, { replace: true })
  })

  return (
    <AuthLayout title="ATLAS에 로그인" subtitle="대체역사 세계관 통합 작업실"
      footer={<>계정이 없나요? <Link className="text-accent hover:underline" to="/signup">회원가입</Link></>}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <Field label="이메일" error={form.formState.errors.email?.message} htmlFor="email">
          <Input id="email" type="email" autoComplete="email" {...form.register('email')} />
        </Field>
        <Field label="비밀번호" error={form.formState.errors.password?.message} htmlFor="password">
          <Input id="password" type="password" autoComplete="current-password" {...form.register('password')} />
        </Field>
        {error && <p role="alert" className="rounded-md bg-danger-soft px-2.5 py-2 text-[12px] text-danger">{error}</p>}
        {unconfirmed && <ResendButton email={unconfirmed} />}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? '로그인 중…' : '로그인'}</Button>
        <Link to="/forgot-password" className="text-center text-[12px] text-muted hover:text-fg">비밀번호를 잊으셨나요?</Link>
      </form>
    </AuthLayout>
  )
}

function ResendButton({ email }: { email: string }) {
  const [busy, setBusy] = useState(false)
  return (
    <Button variant="secondary" disabled={busy} onClick={async () => {
      setBusy(true)
      const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectBase() } })
      setBusy(false)
      if (error) toast.error(friendlyError(error))
      else toast.success('인증 메일을 다시 보냈습니다.')
    }}>인증 메일 다시 보내기</Button>
  )
}

const signupSchema = z.object({
  displayName: z.string().trim().min(1, '표시 이름을 입력하세요.').max(80),
  email: z.string().trim().email('올바른 이메일 주소를 입력하세요.'),
  password: z.string().min(8, '비밀번호는 8자 이상이어야 합니다.'),
  confirm: z.string(),
}).refine((v) => v.password === v.confirm, { path: ['confirm'], message: '비밀번호가 일치하지 않습니다.' })

export function SignupPage() {
  const { user } = useAuth()
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const form = useForm<z.infer<typeof signupSchema>>({ resolver: zodResolver(signupSchema), defaultValues: { displayName: '', email: '', password: '', confirm: '' } })
  if (user) return <Navigate to="/projects" replace />

  if (sentTo) {
    return (
      <AuthLayout title="인증 메일을 보냈습니다" subtitle={`${sentTo} 받은편지함에서 인증 링크를 눌러 가입을 완료하세요.`}
        footer={<Link className="text-accent hover:underline" to="/login">로그인 화면으로</Link>}>
        <div className="flex flex-col gap-3 text-[12.5px] text-muted">
          <p>메일이 오지 않았다면 스팸함을 확인하거나 아래 버튼으로 다시 받으세요.</p>
          <ResendButton email={sentTo} />
        </div>
      </AuthLayout>
    )
  }

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null)
    const { data, error } = await supabase.auth.signUp({
      email: v.email, password: v.password,
      options: { emailRedirectTo: redirectBase(), data: { display_name: v.displayName } },
    })
    if (error) return setError(friendlyError(error))
    if (data.user && data.user.identities && data.user.identities.length === 0) return setError('이미 가입된 이메일입니다.')
    if (!data.session) setSentTo(v.email)
  })

  return (
    <AuthLayout title="ATLAS 계정 만들기" subtitle="세계관 데이터는 계정별로 안전하게 분리 저장됩니다."
      footer={<>이미 계정이 있나요? <Link className="text-accent hover:underline" to="/login">로그인</Link></>}>
      <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
        <Field label="표시 이름" error={form.formState.errors.displayName?.message} htmlFor="dn"><Input id="dn" {...form.register('displayName')} /></Field>
        <Field label="이메일" error={form.formState.errors.email?.message} htmlFor="em"><Input id="em" type="email" autoComplete="email" {...form.register('email')} /></Field>
        <Field label="비밀번호" error={form.formState.errors.password?.message} htmlFor="pw"><Input id="pw" type="password" autoComplete="new-password" {...form.register('password')} /></Field>
        <Field label="비밀번호 확인" error={form.formState.errors.confirm?.message} htmlFor="pw2"><Input id="pw2" type="password" autoComplete="new-password" {...form.register('confirm')} /></Field>
        {error && <p role="alert" className="rounded-md bg-danger-soft px-2.5 py-2 text-[12px] text-danger">{error}</p>}
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? '가입 중…' : '회원가입'}</Button>
      </form>
    </AuthLayout>
  )
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <AuthLayout title="비밀번호 재설정" subtitle="가입한 이메일로 재설정 링크를 보내드립니다."
      footer={<Link className="text-accent hover:underline" to="/login">로그인으로 돌아가기</Link>}>
      {sent ? (
        <p className="text-[12.5px] text-muted">{email} 로 재설정 링크를 보냈습니다. 메일의 링크를 열면 새 비밀번호를 설정할 수 있습니다.</p>
      ) : (
        <form className="flex flex-col gap-3" onSubmit={async (e) => {
          e.preventDefault()
          if (!z.string().email().safeParse(email.trim()).success) return setError('올바른 이메일 주소를 입력하세요.')
          setBusy(true)
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${redirectBase()}update-password` })
          setBusy(false)
          if (error) setError(friendlyError(error))
          else setSent(true)
        }}>
          <Field label="이메일" error={error}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
          <Button type="submit" size="lg" disabled={busy}>재설정 링크 보내기</Button>
        </form>
      )}
    </AuthLayout>
  )
}

export function UpdatePasswordPage() {
  const { user, loading, clearRecovery } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  if (!loading && !user) {
    return (
      <AuthLayout title="링크가 만료되었습니다" footer={<Link className="text-accent hover:underline" to="/forgot-password">재설정 메일 다시 받기</Link>}>
        <p className="text-[12.5px] text-muted">재설정 링크가 유효하지 않거나 만료되었습니다.</p>
      </AuthLayout>
    )
  }
  return (
    <AuthLayout title="새 비밀번호 설정">
      <form className="flex flex-col gap-3" onSubmit={async (e) => {
        e.preventDefault()
        if (pw.length < 8) return setError('비밀번호는 8자 이상이어야 합니다.')
        if (pw !== pw2) return setError('비밀번호가 일치하지 않습니다.')
        setBusy(true)
        const { error } = await supabase.auth.updateUser({ password: pw })
        setBusy(false)
        if (error) return setError(friendlyError(error))
        clearRecovery()
        toast.success('비밀번호를 변경했습니다.')
        nav('/projects', { replace: true })
      }}>
        <Field label="새 비밀번호"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="새 비밀번호 확인" error={error}><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <Button type="submit" size="lg" disabled={busy}>변경</Button>
      </form>
    </AuthLayout>
  )
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, recovery } = useAuth()
  const loc = useLocation()
  if (loading) return null
  if (recovery && loc.pathname !== '/update-password') return <Navigate to="/update-password" replace />
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />
  return <>{children}</>
}
