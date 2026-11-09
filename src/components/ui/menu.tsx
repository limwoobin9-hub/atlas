import * as Menu from '@radix-ui/react-dropdown-menu'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger

export function DropdownMenuContent({ children, align = 'end', className }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string }) {
  return (
    <Menu.Portal>
      <Menu.Content align={align} sideOffset={5} className={cn('z-[70] min-w-44 rounded-lg border border-border bg-surface p-1 shadow-xl', className)}>
        {children}
      </Menu.Content>
    </Menu.Portal>
  )
}

export function DropdownMenuItem({ children, onSelect, danger, disabled, icon }: { children: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; icon?: ReactNode }) {
  return (
    <Menu.Item disabled={disabled} onSelect={onSelect}
      className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-2 py-1.5 text-[12.5px] outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-2 [&_svg]:size-3.5 [&_svg]:text-muted',
        danger && 'text-danger [&_svg]:text-danger')}>
      {icon}{children}
    </Menu.Item>
  )
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="my-1 h-px bg-border" />
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return <Menu.Label className="px-2 py-1 text-[11px] font-medium text-subtle">{children}</Menu.Label>
}

export const Tabs = TabsPrimitive.Root
export const TabsContent = TabsPrimitive.Content

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
  return <TabsPrimitive.List className={cn('flex items-center gap-0.5 overflow-x-auto border-b border-border', className)}>{children}</TabsPrimitive.List>
}

export function TabsTrigger({ value, children, count }: { value: string; children: ReactNode; count?: number }) {
  return (
    <TabsPrimitive.Trigger value={value}
      className="relative -mb-px flex h-9 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 text-[12.5px] font-medium text-muted transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-fg">
      {children}
      {count !== undefined && count > 0 && <span className="rounded bg-surface-2 px-1 text-[10.5px] tabular-nums text-subtle">{count}</span>}
    </TabsPrimitive.Trigger>
  )
}
