import { AlertTriangle, Check, CloudOff, Loader2, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/misc'
import { hasUnsavedWork, useSaveStatus } from '@/stores/saveStatus'

export function SaveIndicator() {
  const pending = useSaveStatus((s) => Object.keys(s.pending).length + Object.keys(s.dirty).length)
  const errors = useSaveStatus((s) => s.errors)
  const lastSavedAt = useSaveStatus((s) => s.lastSavedAt)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const warn = (e: BeforeUnloadEvent) => {
      if (hasUnsavedWork()) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); window.removeEventListener('beforeunload', warn) }
  }, [])

  const errList = Object.values(errors)
  if (!online) return <span className="flex items-center gap-1 text-[11.5px] text-danger"><CloudOff className="size-3.5" />오프라인</span>
  if (errList.length) {
    return (
      <Tooltip content={errList[0].message}>
        <Button variant="danger-ghost" size="xs" onClick={() => errList.forEach((e) => e.retry())} data-testid="save-error">
          <AlertTriangle />저장 실패 {errList.length > 1 ? `(${errList.length})` : ''} · 재시도<RefreshCw />
        </Button>
      </Tooltip>
    )
  }
  if (pending) return <span className="flex items-center gap-1 text-[11.5px] text-muted" data-testid="save-pending"><Loader2 className="size-3.5 animate-spin" />저장 중…</span>
  return (
    <span className="flex items-center gap-1 text-[11.5px] text-subtle" data-testid="save-ok">
      <Check className="size-3.5 text-success" />{lastSavedAt ? `저장됨 ${new Date(lastSavedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}` : '모든 변경 저장됨'}
    </span>
  )
}
