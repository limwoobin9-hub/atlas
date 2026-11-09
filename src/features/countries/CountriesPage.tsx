import { EntityListPage } from '@/features/entities/EntityListPage'
import { StorageImage } from '@/features/entities/common'
import { useCountryStatesAt } from '@/features/wars/useCountryFlags'

export function CountriesPage() {
  const states = useCountryStatesAt()
  return (
    <EntityListPage kind="country" extraColumns={[
      { label: '현재 국기', width: '70px', render: (e) => { const s = states.get(e.id); const p = s?.flag_path ?? e.image_path; return p ? <StorageImage path={p} className="h-5 w-8 rounded-sm border border-border object-cover" /> : <span className="text-subtle">—</span> } },
      { label: '현재 국명·체제', width: 'minmax(140px,1.2fr)', render: (e) => { const s = states.get(e.id); return s ? <span className="text-[12px]">{s.name || e.name}{s.government_form && <span className="text-subtle"> · {s.government_form}</span>}</span> : <span className="text-subtle">—</span> } },
    ]} />
  )
}
