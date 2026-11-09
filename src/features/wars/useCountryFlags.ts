import { useMemo } from 'react'
import { useTemporal } from '@/data/hooks'
import type { CountryState } from '@/data/types'
import { useWorld } from '@/data/world'
import { rowsAt } from '@/domain/timeline'

/** Flag path + colour of every country at the current date (falls back to entity defaults). */
export function useCountryFlags() {
  const { date } = useWorld()
  const states = useTemporal<CountryState>('atlas_country_states')
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const s of rowsAt(states.visible, date)) if (s.flag_path) m.set(s.country_id, s.flag_path)
    return m
  }, [states.visible, date])
}

export function useCountryStatesAt() {
  const { date } = useWorld()
  const states = useTemporal<CountryState>('atlas_country_states')
  return useMemo(() => {
    const m = new Map<string, CountryState>()
    for (const s of rowsAt(states.visible, date)) {
      const prev = m.get(s.country_id)
      if (!prev || (s.valid_from ?? '') > (prev.valid_from ?? '')) m.set(s.country_id, s)
    }
    return m
  }, [states.visible, date])
}
