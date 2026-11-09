/** Convert Supabase / Postgres / network errors to friendly Korean messages. */
export function friendlyError(err: unknown): string {
  if (!err) return '알 수 없는 오류가 발생했습니다.'
  const e = err as { message?: string; code?: string; status?: number; name?: string }
  const msg = (e.message ?? String(err)).toString()
  const code = e.code ?? ''

  if (typeof navigator !== 'undefined' && navigator.onLine === false) return '인터넷 연결이 끊어졌습니다. 연결을 확인한 뒤 다시 시도하세요.'
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) return '서버에 연결할 수 없습니다. 네트워크 상태를 확인하세요.'
  if (/Invalid login credentials/i.test(msg)) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (/Email not confirmed/i.test(msg)) return '이메일 인증이 완료되지 않았습니다. 받은편지함의 인증 메일을 확인하세요.'
  if (/User already registered/i.test(msg)) return '이미 가입된 이메일입니다.'
  if (/Password should be at least/i.test(msg)) return '비밀번호가 너무 짧습니다 (최소 6자, 권장 8자 이상).'
  if (/rate limit|too many requests/i.test(msg) || e.status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도하세요.'
  if (/JWT expired|invalid JWT|refresh token/i.test(msg)) return '로그인 세션이 만료되었습니다. 다시 로그인하세요.'
  if (code === '42501' || /row-level security|permission denied|forbidden/i.test(msg)) return '이 작업을 수행할 권한이 없습니다.'
  if (code === '23505') return '이미 존재하는 항목입니다 (중복).'
  if (code === '23503') return '연결된 항목이 존재하지 않거나 다른 데이터가 이 항목을 참조하고 있습니다.'
  if (code === '23514') {
    if (/cycle/i.test(msg)) return '편제 순환참조: 하위 부대를 상위부대로 지정할 수 없습니다.'
    if (/main world line/i.test(msg)) return '기본 세계선은 삭제할 수 없습니다.'
    if (/at least one owner/i.test(msg)) return '프로젝트에는 최소 한 명의 소유자가 있어야 합니다.'
    if (/valid_to/i.test(msg)) return '종료일은 시작일보다 뒤여야 합니다.'
    return '입력값이 유효성 규칙을 위반했습니다: ' + msg
  }
  if (code === '22P02' || code === '22007' || code === '22008') return '입력 형식이 올바르지 않습니다.'
  if (code === 'PGRST116') return '항목을 찾을 수 없습니다. 삭제되었거나 접근 권한이 없습니다.'
  return msg
}
