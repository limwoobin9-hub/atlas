export function Logo({ size = 24, withText = false }: { size?: number; withText?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--accent)" />
        <circle cx="16" cy="16" r="9" fill="none" stroke="var(--accent-fg)" strokeWidth="1.8" />
        <path d="M7 16h18M16 7c-3.2 3-3.2 15 0 18M16 7c3.2 3 3.2 15 0 18" fill="none" stroke="var(--accent-fg)" strokeWidth="1.4" />
        <path d="M21 9.5 25.5 5" stroke="var(--accent-fg)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {withText && <span className="text-[14px] font-bold tracking-[0.18em]">ATLAS</span>}
    </span>
  )
}
