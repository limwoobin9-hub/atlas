import type { ReactNode } from 'react'
import type { Entity } from '@/data/types'
import { CountryDiplomacy, CountryEvents, CountryHistory, CountryMilitary, CountryOverview, CountryParliament, CountryPeople, CountryPolitics, CountryTerritory } from '@/features/countries/CountryTabs'
import { RegionTerritory } from '@/features/countries/RegionTabs'
import { CharacterCareer, CharacterNetwork } from '@/features/characters/CharacterTabs'
import { GovernmentMembers, PartyElections, PartyFactions, PartyPolling } from '@/features/politics/PartyTabs'
import { ElectionResults } from '@/features/parliament/ElectionResults'
import { ParliamentChambers } from '@/features/parliament/ParliamentChambers'
import { EquipmentUsers, ShipHistory, UnitEquipment, UnitHistory } from '@/features/military/UnitTabs'
import { WarBattlesTab, WarOverviewTab } from '@/features/wars/WarTabs'
import { TreatyTab } from '@/features/treaties/TreatyTab'
import { AttachmentsCard } from './AttachmentsCard'
import { EntityForm } from './EntityForm'
import { BacklinksCard, RelationsCard } from './RelationsPanel'
import { Card } from '@/components/ui/misc'

export interface DetailTab { id: string; label: string; render: () => ReactNode }

const formCard = (e: Entity, sections: 'all' | 'base' | 'sub' = 'all') => (
  <Card className="p-4"><EntityForm key={e.id} entity={e} sections={sections} /></Card>
)
const linksTab = (e: Entity): DetailTab => ({
  id: 'links', label: '관계·연결',
  render: () => (<><RelationsCard entityId={e.id} kind={e.kind} /><BacklinksCard entityId={e.id} /></>),
})
const filesTab = (e: Entity): DetailTab => ({ id: 'files', label: '자료', render: () => <AttachmentsCard entityId={e.id} /> })

export function detailTabsFor(e: Entity): DetailTab[] {
  const overview: DetailTab = { id: 'overview', label: '개요', render: () => formCard(e) }
  switch (e.kind) {
    case 'country':
      return [
        { id: 'overview', label: '개요', render: () => <CountryOverview entity={e} /> },
        { id: 'history', label: '역사', render: () => <CountryHistory entity={e} /> },
        { id: 'politics', label: '정치', render: () => <CountryPolitics entity={e} /> },
        { id: 'parliament', label: '의회', render: () => <CountryParliament entity={e} /> },
        { id: 'military', label: '군사', render: () => <CountryMilitary entity={e} /> },
        { id: 'diplomacy', label: '외교', render: () => <CountryDiplomacy entity={e} /> },
        { id: 'territory', label: '영토', render: () => <CountryTerritory entity={e} /> },
        { id: 'events', label: '사건', render: () => <CountryEvents entity={e} /> },
        { id: 'people', label: '인물', render: () => <CountryPeople entity={e} /> },
        linksTab(e), filesTab(e),
      ]
    case 'region':
      return [overview, { id: 'territory', label: '지배·영유권', render: () => <RegionTerritory entity={e} /> }, linksTab(e), filesTab(e)]
    case 'character':
      return [overview, { id: 'career', label: '경력·소속', render: () => <CharacterCareer entity={e} /> }, { id: 'network', label: '인물 관계도', render: () => <CharacterNetwork entity={e} /> }, linksTab(e), filesTab(e)]
    case 'party':
      return [overview, { id: 'factions', label: '계파', render: () => <PartyFactions entity={e} /> }, { id: 'polling', label: '지지율', render: () => <PartyPolling entity={e} /> }, { id: 'elections', label: '선거·의석', render: () => <PartyElections entity={e} /> }, linksTab(e), filesTab(e)]
    case 'government':
      return [overview, { id: 'members', label: '집권 정당·내각', render: () => <GovernmentMembers entity={e} /> }, linksTab(e), filesTab(e)]
    case 'parliament':
      return [{ id: 'chambers', label: '의석·구성', render: () => <ParliamentChambers entity={e} /> }, overview, linksTab(e), filesTab(e)]
    case 'election':
      return [overview, { id: 'results', label: '선거 결과', render: () => <ElectionResults entity={e} /> }, linksTab(e), filesTab(e)]
    case 'unit':
      return [overview, { id: 'oob', label: '편제·이력', render: () => <UnitHistory entity={e} /> }, { id: 'equipment', label: '장비·함선', render: () => <UnitEquipment entity={e} /> }, linksTab(e), filesTab(e)]
    case 'ship':
      return [overview, { id: 'history', label: '소속·개장 이력', render: () => <ShipHistory entity={e} /> }, linksTab(e), filesTab(e)]
    case 'equipment':
      return [overview, { id: 'users', label: '운용 부대', render: () => <EquipmentUsers entity={e} /> }, linksTab(e), filesTab(e)]
    case 'war':
      return [{ id: 'war', label: '전쟁 패널', render: () => <WarOverviewTab entity={e} /> }, overview, { id: 'battles', label: '전투·사건', render: () => <WarBattlesTab entity={e} /> }, linksTab(e), filesTab(e)]
    case 'treaty':
      return [overview, { id: 'clauses', label: '서명국·조항', render: () => <TreatyTab entity={e} /> }, linksTab(e), filesTab(e)]
    default:
      return [overview, linksTab(e), filesTab(e)]
  }
}
