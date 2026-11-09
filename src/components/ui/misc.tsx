import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import { Loader2 } from 'lucide-react'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const tones: Record<string, string> = {
  default: 'bg-surface-2 text-muted border-border',
  accent: 'bg-accent-soft text-accent border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  muted: 'bg-surface-2 text-subtle border-border',
}

export function Badge({ tone = 'default', className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: string }) {
  return (
    <span className={cn('inline-flex h-5 items-center gap-1 rounded border px-1.5 text-[11px] font-medium whitespace-nowrap', tones[tone] ?? tones.default, className)} {...props}>
      {children}
    </span>
  )
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-lg border border-border bg-surface', className)} {...props} />
}

export function CardHeader({ title, actions, icon, className, sub }: { title: ReactNode; actions?: ReactNode; icon?: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <div className={cn('flex items-center gap-2 border-b border-border px-3.5 py-2.5', className)}>
      {icon && <span className="text-muted [&_svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-[13px] font-semibold">{title}</h3>
        {sub && <p className="truncate text-[11.5px] text-subtle">{sub}</p>}
      </div>
      {actions}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-muted', className)} />
}

export function Loading({ label = '불러오는 중…', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-muted', className)}>
      <Spinner /> <span className="text-[12.5px]">{label}</span>
    </div>
  )
}

export function Empty({ icon, title, description, action, className }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-10 text-center', className)}>
      {icon && <div className="text-subtle [&_svg]:size-7">{icon}</div>}
      <p className="text-[13px] font-medium">{title}</p>
      {description && <p className="max-w-md text-[12px] text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}

export function Switch({ checked, onCheckedChange, disabled, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string }) {
  return (
    <SwitchPrimitive.Root id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled}
      className="peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-surface-3 transition-colors focus-ring disabled:opacity-50 data-[state=checked]:bg-accent">
      <SwitchPrimitive.Thumb className="block size-3.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[15px] data-[state=unchecked]:translate-x-[1px]" />
    </SwitchPrimitive.Root>
  )
}

export function Tooltip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>
  return (
    <TooltipPrimitive.Root delayDuration={300}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={5} className="z-[80] max-w-xs rounded-md bg-fg px-2 py-1 text-[11.5px] text-bg shadow-lg">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor
export function PopoverContent({ className, align = 'start', sideOffset = 6, ...props }: PopoverPrimitive.PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset}
        className={cn('z-[70] rounded-lg border border-border bg-surface p-3 shadow-xl outline-none', className)} {...props} />
    </PopoverPrimitive.Portal>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-border bg-surface-2 px-1 font-mono text-[10.5px] text-muted">{children}</kbd>
}

export function ColorDot({ color, className }: { color?: string | null; className?: string }) {
  return <span className={cn('inline-block size-2.5 shrink-0 rounded-full border border-black/10', className)} style={{ background: color ?? 'var(--surface-3)' }} />
}

export function Stat({ label, value, sub, icon, onClick }: { label: string; value: ReactNode; sub?: ReactNode; icon?: ReactNode; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 text-left transition-colors enabled:hover:border-border-strong enabled:hover:bg-surface-2">
      <div className="flex items-center gap-1.5 text-[11.5px] text-muted [&_svg]:size-3.5">{icon}{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-subtle">{sub}</div>}
    </button>
  )
}
