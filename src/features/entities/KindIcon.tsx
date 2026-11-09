import { Anchor, Building2, Crown, Flag, Landmark, MapPinned, Plane, ScrollText, Shield, Swords, Target, User, Users, Vote, Zap, Network } from 'lucide-react'
import type { EntityKind } from '@/data/types'

const ICONS: Record<EntityKind, typeof Flag> = {
  country: Flag, region: MapPinned, party: Users, faction: Network, government: Crown, parliament: Landmark, election: Vote,
  character: User, unit: Shield, ship: Anchor, equipment: Plane, event: Zap, war: Swords, battle: Target, treaty: ScrollText,
  organization: Building2,
}

export function KindIcon({ kind, className }: { kind: EntityKind; className?: string }) {
  const I = ICONS[kind] ?? Building2
  return <I className={className} />
}
