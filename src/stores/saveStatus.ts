import { create } from 'zustand'

/** Global autosave status. Each pending save registers a key; errors keep a retry callback. */
interface SaveState {
  pending: Record<string, true>
  dirty: Record<string, true>
  errors: Record<string, { message: string; retry: () => void }>
  lastSavedAt: number | null
  markDirty: (key: string) => void
  start: (key: string) => void
  succeed: (key: string) => void
  fail: (key: string, message: string, retry: () => void) => void
  clear: (key: string) => void
}

export const useSaveStatus = create<SaveState>((set) => ({
  pending: {},
  dirty: {},
  errors: {},
  lastSavedAt: null,
  markDirty: (key) => set((s) => ({ dirty: { ...s.dirty, [key]: true } })),
  start: (key) => set((s) => ({ pending: { ...s.pending, [key]: true } })),
  succeed: (key) =>
    set((s) => {
      const pending = { ...s.pending }
      const dirty = { ...s.dirty }
      const errors = { ...s.errors }
      delete pending[key]
      delete dirty[key]
      delete errors[key]
      return { pending, dirty, errors, lastSavedAt: Date.now() }
    }),
  fail: (key, message, retry) =>
    set((s) => {
      const pending = { ...s.pending }
      delete pending[key]
      return { pending, errors: { ...s.errors, [key]: { message, retry } } }
    }),
  clear: (key) =>
    set((s) => {
      const pending = { ...s.pending }
      const dirty = { ...s.dirty }
      const errors = { ...s.errors }
      delete pending[key]
      delete dirty[key]
      delete errors[key]
      return { pending, dirty, errors }
    }),
}))

export function hasUnsavedWork() {
  const s = useSaveStatus.getState()
  return Object.keys(s.pending).length > 0 || Object.keys(s.dirty).length > 0 || Object.keys(s.errors).length > 0
}
