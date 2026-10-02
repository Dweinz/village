// Static game content. Balance numbers live here; rules live in game.ts.

export const ATTRS = ['str', 'dex', 'int', 'cha', 'end', 'per'] as const
export type Attr = (typeof ATTRS)[number]
export const ATTR_NAMES: Record<Attr, string> = {
  str: 'Strength', dex: 'Dexterity', int: 'Intellect', cha: 'Charm', end: 'Endurance', per: 'Perception',
}

export const RESOURCES = ['gold', 'wood', 'stone', 'food', 'ore'] as const
export type Res = (typeof RESOURCES)[number]
export type Bag = Partial<Record<Res, number>>
export const RES_ICON: Record<Res, string> = { gold: '🪙', wood: '🪵', stone: '🪨', food: '🌾', ore: '⛏️' }
export const RES_NAME: Record<Res, string> = { gold: 'Gold', wood: 'Wood', stone: 'Stone', food: 'Food', ore: 'Ore' }

export type BuildingType = 'townhall' | 'farm' | 'lumbercamp' | 'house' | 'tavern' | 'quarry' | 'mine' | 'guildhall'

// Shared shape for Trait and Specialization effects. No `buildings` = applies everywhere.
export interface Bonus { buildings?: BuildingType[]; speed?: number; xp?: number; gold?: number }

export interface JobDef {
  id: string
  name: string
  kind: 'production' | 'contract'
  minLevel: number
  duration: number // seconds at speed 1
  attrs: Partial<Record<Attr, number>> // weights: which Attributes speed this Job up
  yields: Bag
  cost?: Bag // production: per cycle; contract: paid up front
  xp: number
}

export interface BuildingDef {
  name: string
  cost: Bag // level 1; each upgrade multiplies by UPGRADE_SCALE^level
  slots: number // per level
  housing?: number // per level
  unique?: boolean
  chapter: number // Chapter index that unlocks it
  jobs: JobDef[]
}

export const UPGRADE_SCALE = 1.9
export const MAX_BUILDING_LEVEL = 5

const prod = (id: string, name: string, duration: number, attrs: JobDef['attrs'], yields: Bag, xp: number, extra: Partial<JobDef> = {}): JobDef =>
  ({ id, name, kind: 'production', minLevel: 1, duration, attrs, yields, xp, ...extra })
const contract = (id: string, name: string, minLevel: number, duration: number, attrs: JobDef['attrs'], yields: Bag, xp: number, cost?: Bag): JobDef =>
  ({ id, name, kind: 'contract', minLevel, duration, attrs, yields, xp, cost })

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  townhall: {
    name: 'Town Hall', cost: { wood: 40, gold: 40 }, slots: 1, housing: 3, unique: true, chapter: 0,
    jobs: [
      prod('taxes', 'Collect Taxes', 20, { cha: 1 }, { gold: 6 }, 3),
      contract('dispute', 'Settle a Dispute', 2, 90, { cha: 1, int: 1 }, { gold: 80 }, 40),
    ],
  },
  farm: {
    name: 'Farm', cost: { wood: 20 }, slots: 2, chapter: 0,
    jobs: [
      prod('fields', 'Tend Fields', 10, { end: 1 }, { food: 4 }, 2),
      contract('festival', 'Harvest Festival', 3, 180, { end: 1, cha: 1 }, { food: 120, gold: 40 }, 60),
    ],
  },
  lumbercamp: {
    name: 'Lumber Camp', cost: { gold: 20 }, slots: 2, chapter: 0,
    jobs: [
      prod('chop', 'Chop Wood', 12, { str: 1 }, { wood: 4 }, 2),
      contract('thicket', 'Clear the Thicket', 3, 150, { str: 1, end: 1 }, { wood: 100 }, 50),
    ],
  },
  house: { name: 'House', cost: { wood: 30 }, slots: 0, housing: 2, chapter: 0, jobs: [] },
  tavern: {
    name: 'Tavern', cost: { wood: 50, gold: 50 }, slots: 1, unique: true, chapter: 1,
    jobs: [
      prod('serve', 'Serve Drinks', 15, { cha: 1, dex: 1 }, { gold: 5 }, 3, { cost: { food: 1 } }),
      contract('feast', 'Host a Feast', 2, 120, { cha: 1 }, { gold: 150 }, 60, { food: 40 }),
    ],
  },
  quarry: {
    name: 'Quarry', cost: { wood: 40, gold: 30 }, slots: 2, chapter: 1,
    jobs: [prod('cut', 'Cut Stone', 15, { str: 1, end: 1 }, { stone: 3 }, 3)],
  },
  mine: {
    name: 'Mine', cost: { wood: 60, stone: 40 }, slots: 2, chapter: 2,
    jobs: [prod('dig', 'Dig Ore', 20, { str: 1, per: 1 }, { ore: 2 }, 4)],
  },
  guildhall: {
    name: 'Guild Hall', cost: { wood: 80, stone: 60, gold: 100 }, slots: 1, unique: true, chapter: 2,
    jobs: [
      prod('train', 'Train', 30, { int: 1 }, {}, 12),
      contract('archives', 'Study the Archives', 2, 240, { int: 2 }, {}, 100),
    ],
  },
}

export type TraitId = 'green_thumb' | 'lumberjack' | 'stonehand' | 'silver_tongue' | 'tireless' | 'quick_learner'
export const TRAITS: Record<TraitId, Bonus & { name: string; desc: string }> = {
  green_thumb: { name: 'Green Thumb', desc: '+50% speed at Farms', buildings: ['farm'], speed: 0.5 },
  lumberjack: { name: 'Lumberjack', desc: '+50% speed at Lumber Camps', buildings: ['lumbercamp'], speed: 0.5 },
  stonehand: { name: 'Stonehand', desc: '+40% speed at Quarries and Mines', buildings: ['quarry', 'mine'], speed: 0.4 },
  silver_tongue: { name: 'Silver Tongue', desc: '+25% Gold from all Jobs', gold: 0.25 },
  tireless: { name: 'Tireless', desc: '+15% speed everywhere', speed: 0.15 },
  quick_learner: { name: 'Quick Learner', desc: '+50% XP', xp: 0.5 },
}
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[]

export const SPEC_LEVEL = 10
export type SpecId = 'harvester' | 'forester' | 'mason' | 'prospector' | 'merchant' | 'scholar'
// Requirement: all `req` Attributes met, OR the Villager has `trait` (hidden path).
export const SPECS: Record<SpecId, Bonus & { name: string; desc: string; req: Partial<Record<Attr, number>>; trait?: TraitId }> = {
  harvester: { name: 'Harvester', desc: '+100% speed at Farms', req: { end: 8 }, trait: 'green_thumb', buildings: ['farm'], speed: 1 },
  forester: { name: 'Forester', desc: '+100% speed at Lumber Camps', req: { str: 8 }, trait: 'lumberjack', buildings: ['lumbercamp'], speed: 1 },
  mason: { name: 'Mason', desc: '+100% speed at Quarries', req: { str: 8, end: 6 }, trait: 'stonehand', buildings: ['quarry'], speed: 1 },
  prospector: { name: 'Prospector', desc: '+100% speed at Mines', req: { per: 8 }, buildings: ['mine'], speed: 1 },
  merchant: { name: 'Merchant', desc: '+50% Gold from all Jobs', req: { cha: 8 }, trait: 'silver_tongue', gold: 0.5 },
  scholar: { name: 'Scholar', desc: '+100% XP', req: { int: 8 }, trait: 'quick_learner', xp: 1 },
}
export const SPEC_IDS = Object.keys(SPECS) as SpecId[]

export type SiteKind = 'deposit' | 'ruin' | 'land' | 'city'
export const SITE_KINDS: Record<SiteKind, { name: string; icon: string; desc: string }> = {
  deposit: { name: 'Resource Deposit', icon: '💎', desc: 'Rare Materials lie here. An Outpost could work them.' },
  ruin: { name: 'Ruin', icon: '🏛️', desc: 'Something old waits inside, for a party brave enough.' },
  land: { name: 'Empty Land', icon: '🌿', desc: 'Open ground, room for another Settlement one day.' },
  city: { name: 'Foreign City', icon: '🏰', desc: 'A city that is not yours. Its merchants may trade.' },
}
export const SITE_COUNTS: Record<SiteKind, number> = { deposit: 5, ruin: 3, land: 3, city: 3 }
export const SITE_REVEAL_DISTANCE = 3 // Sites this close start revealed; the rest are under fog
export const SITE_NEAR_COUNT = 3 // how many Sites a new World Map places inside the revealed area
export const SITE_MAX_DISTANCE = 10

export const NAMES = [
  'Ada', 'Bram', 'Cora', 'Dag', 'Edda', 'Finn', 'Greta', 'Hal', 'Ivy', 'Jory', 'Kaja', 'Leif', 'Mira', 'Nils',
  'Orla', 'Pim', 'Quinn', 'Runa', 'Sten', 'Tove', 'Ulla', 'Vidar', 'Wren', 'Ylva',
]
