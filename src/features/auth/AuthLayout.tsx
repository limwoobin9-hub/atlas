import type { ReactNode } from 'react'
import { Logo } from '@/features/shell/Logo'

export function AuthLayout({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size={40} />
          <div>
            <h1 className="text-lg font-semibold">{title}</h1>
            {subtitle && <p className="mt-1 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">{children}</div>
        {footer && <div className="mt-4 text-center text-[12.5px] text-muted">{footer}</div>}
        <p className="mt-8 text-center text-[11px] text-subtle">ATLAS · Alternative Timeline &amp; Lore Administration Studio</p>
      </div>
    </div>
  )
}
