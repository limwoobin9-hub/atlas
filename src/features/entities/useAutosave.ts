import { useCallback, useEffect, useRef } from 'react'
import { friendlyError } from '@/lib/errors'
import { useSaveStatus } from '@/stores/saveStatus'

/**
 * Debounced autosave of a patch. Changes accumulate in a pending patch; the save is retried
 * explicitly from the global indicator on failure and pending work is flushed on unmount.
 */
export function useAutosave(key: string, save: (patch: Record<string, unknown>) => Promise<void>, delay = 700) {
  const pending = useRef<Record<string, unknown>>({})
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save
  const status = useSaveStatus

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    const patch = pending.current
    if (Object.keys(patch).length === 0) return
    pending.current = {}
    status.getState().start(key)
    try {
      await saveRef.current(patch)
      // a newer edit may have been queued while saving
      if (Object.keys(pending.current).length === 0) status.getState().succeed(key)
    } catch (e) {
      pending.current = { ...patch, ...pending.current }
      status.getState().fail(key, friendlyError(e), () => { void flush() })
    }
  }, [key, status])

  const queue = useCallback((patch: Record<string, unknown>) => {
    pending.current = { ...pending.current, ...patch }
    status.getState().markDirty(key)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, delay)
  }, [delay, flush, key, status])

  useEffect(() => () => { void flush() }, [flush])

  return { queue, flush }
}
