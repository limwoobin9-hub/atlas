import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/misc'
import { useSession } from '@/stores/session'

export function ThemeToggle() {
  const theme = useSession((s) => s.theme)
  const setTheme = useSession((s) => s.setTheme)
  const next = theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light'
  const label = theme === 'light' ? '라이트 모드' : theme === 'dark' ? '다크 모드' : '시스템 설정'
  return (
    <Tooltip content={`테마: ${label}`}>
      <Button variant="subtle" size="icon-sm" aria-label="테마 전환" onClick={() => setTheme(next)}>
        {theme === 'light' ? <Sun /> : theme === 'dark' ? <Moon /> : <Monitor />}
      </Button>
    </Tooltip>
  )
}
