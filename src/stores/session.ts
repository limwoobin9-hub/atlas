import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark' | 'system'

interface ProjectView {
  date: string
  branchId: string | null
}

interface SessionState {
  theme: Theme
  setTheme: (t: Theme) => void
  /** per-project world date and branch, persisted locally */
  views: Record<string, ProjectView>
  setDate: (projectId: string, date: string) => void
  setBranch: (projectId: string, branchId: string) => void
  collapsedGroups: Record<string, boolean>
  toggleGroup: (g: string) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (v: boolean) => void
  panel: { open: boolean; width: number; entityId: string | null }
  openPanel: (entityId: string) => void
  closePanel: () => void
  setPanelWidth: (w: number) => void
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      views: {},
      setDate: (projectId, date) =>
        set((s) => ({ views: { ...s.views, [projectId]: { ...(s.views[projectId] ?? { branchId: null }), date } } })),
      setBranch: (projectId, branchId) =>
        set((s) => ({ views: { ...s.views, [projectId]: { ...(s.views[projectId] ?? { date: '' }), branchId } } })),
      collapsedGroups: {},
      toggleGroup: (g) => set((s) => ({ collapsedGroups: { ...s.collapsedGroups, [g]: !s.collapsedGroups[g] } })),
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      panel: { open: false, width: 380, entityId: null },
      openPanel: (entityId) => set((s) => ({ panel: { ...s.panel, open: true, entityId } })),
      closePanel: () => set((s) => ({ panel: { ...s.panel, open: false } })),
      setPanelWidth: (width) => set((s) => ({ panel: { ...s.panel, width: Math.max(300, Math.min(720, width)) } })),
    }),
    { name: 'atlas-session', partialize: (s) => ({ theme: s.theme, views: s.views, collapsedGroups: s.collapsedGroups, sidebarCollapsed: s.sidebarCollapsed, panel: { ...s.panel, open: s.panel.open } }) },
  ),
)

export function applyTheme(theme: Theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}
