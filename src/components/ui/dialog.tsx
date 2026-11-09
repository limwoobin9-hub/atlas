import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as AlertPrimitive from '@radix-ui/react-alert-dialog'
import { X } from 'lucide-react'
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Button } from './button'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

export function DialogContent({ title, description, children, className, footer, wide }: {
  title: ReactNode; description?: ReactNode; children?: ReactNode; className?: string; footer?: ReactNode; wide?: boolean | 'xl'
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] data-[state=open]:animate-in" />
      <DialogPrimitive.Content
        className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-border bg-surface shadow-2xl outline-none',
          wide === 'xl' ? 'max-w-5xl' : wide ? 'max-w-2xl' : 'max-w-md', className)}
        onOpenAutoFocus={(e) => { const t = e.currentTarget as HTMLElement | null; const first = t?.querySelector<HTMLElement>('input,textarea,select'); if (first) { e.preventDefault(); first.focus() } }}>
        <div className="flex items-start gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-[14px] font-semibold">{title}</DialogPrimitive.Title>
            {description ? <DialogPrimitive.Description className="mt-0.5 text-[12px] text-muted">{description}</DialogPrimitive.Description>
              : <DialogPrimitive.Description className="sr-only">{typeof title === 'string' ? title : 'dialog'}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close asChild><Button variant="subtle" size="icon-sm" aria-label="닫기"><X /></Button></DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-2.5">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

// ---------------------------------------------------------------- imperative confirm()
interface ConfirmOptions { title: string; description?: ReactNode; confirmLabel?: string; danger?: boolean }
const ConfirmCtx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => { state?.resolve(v); setState(null) }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <AlertPrimitive.Root open={!!state} onOpenChange={(o) => !o && close(false)}>
        <AlertPrimitive.Portal>
          <AlertPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/40" />
          <AlertPrimitive.Content className="fixed left-1/2 top-1/2 z-[90] w-[calc(100vw-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border bg-surface p-4 shadow-2xl">
            <AlertPrimitive.Title className="text-[14px] font-semibold">{state?.title}</AlertPrimitive.Title>
            <AlertPrimitive.Description asChild><div className="mt-1.5 text-[12.5px] text-muted">{state?.description}</div></AlertPrimitive.Description>
            <div className="mt-4 flex justify-end gap-2">
              <AlertPrimitive.Cancel asChild><Button variant="secondary" onClick={() => close(false)}>취소</Button></AlertPrimitive.Cancel>
              <AlertPrimitive.Action asChild>
                <Button variant={state?.danger ? 'danger' : 'default'} onClick={() => close(true)}>{state?.confirmLabel ?? '확인'}</Button>
              </AlertPrimitive.Action>
            </div>
          </AlertPrimitive.Content>
        </AlertPrimitive.Portal>
      </AlertPrimitive.Root>
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  return useContext(ConfirmCtx)
}
