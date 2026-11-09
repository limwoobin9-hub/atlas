import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { friendlyError } from '@/lib/errors'

interface State { error: Error | null }

/** Keeps the app usable when a screen crashes: shows the error with recovery actions. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ATLAS] screen error', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    if (this.props.fallback) return this.props.fallback
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="max-w-md rounded-xl border border-border bg-surface p-6 text-center">
          <AlertTriangle className="mx-auto mb-2 size-7 text-warning" />
          <h2 className="text-[14px] font-semibold">이 화면을 표시하는 중 오류가 발생했습니다</h2>
          <p className="mt-1.5 break-words text-[12.5px] text-muted">{friendlyError(this.state.error)}</p>
          <p className="mt-1 text-[11.5px] text-subtle">저장된 데이터는 영향을 받지 않았습니다.</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>다시 시도</Button>
            <Button onClick={() => window.location.reload()}>새로고침</Button>
          </div>
        </div>
      </div>
    )
  }
}
