// Static game content. Balance numbers live here; rules live in game.ts.

export const ATTRS = ['str', 'dex', 'int', 'cha', 'end', 'per'] as const
export type Attr = (typeof ATTRS)[number]
export const ATTR_NAMES: Record<Attr, string> = {
  str: 'Strength', dex: 'Dexterity', int: 'Intellect', cha: 'Charm', end: 'Endurance', per: 'Perception',
}

export const RARE_MATERIALS = ['crystal', 'spice', 'silk'] as const // only from Sites or trade
export type RareMaterial = (typeof RARE_MATERIALS)[number]
export const RESOURCES = ['gold', 'wood', 'stone', 'food', 'ore', ...RARE_MATERIALS] as const
export type Res = (typeof RESOURCES)[number]
export type Bag = Partial<Record<Res, number>>
export const isRare = (r: Res): r is RareMaterial => (RARE_MATERIALS as readonly Res[]).includes(r)
export const RES_ICON: Record<Res, string> = { gold: '🪙', wood: '🪵', stone: '🪨', food: '🌾', ore: '⛏️', crystal: '🔮', spice: '🌶️', silk: '🧵' }
export const RES_NAME: Record<Res, string> = {
  gold: 'Gold', wood: 'Wood', stone: 'Stone', food: 'Food', ore: 'Ore', crystal: 'Crystal', spice: 'Spice', silk: 'Silk',
}

export type BuildingType = 'townhall' | 'farm' | 'lumbercamp' | 'house' | 'tavern' | 'quarry' | 'mine' | 'guildhall'

// Where a Villager can work something that repeats each cycle: a Building, an Outpost on a Resource Deposit, or a Trade Route.
export type Workplace = BuildingType | 'outpost' | 'trade'

// Shared shape for Trait and Specialization effects. No `workplaces` = applies everywhere.
// expedition: added success chance; trade: added speed on Trade Routes only.
export interface Bonus { workplaces?: Workplace[]; speed?: number; xp?: number; gold?: number; expedition?: number; trade?: number }

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
  green_thumb: { name: 'Green Thumb', desc: '+50% speed at Farms', workplaces: ['farm'], speed: 0.5 },
  lumberjack: { name: 'Lumberjack', desc: '+50% speed at Lumber Camps', workplaces: ['lumbercamp'], speed: 0.5 },
  stonehand: { name: 'Stonehand', desc: '+40% speed at Quarries, Mines and Outposts', workplaces: ['quarry', 'mine', 'outpost'], speed: 0.4 },
  silver_tongue: { name: 'Silver Tongue', desc: '+25% Gold from all Jobs', gold: 0.25 },
  tireless: { name: 'Tireless', desc: '+15% speed everywhere, +5% Expedition success', speed: 0.15, expedition: 0.05 },
  quick_learner: { name: 'Quick Learner', desc: '+50% XP', xp: 0.5 },
}
export const TRAIT_IDS = Object.keys(TRAITS) as TraitId[]

export const SPEC_LEVEL = 10
export type SpecId = 'harvester' | 'forester' | 'mason' | 'prospector' | 'merchant' | 'scholar'
// Requirement: all `req` Attributes met, OR the Villager has `trait` (hidden path).
export const SPECS: Record<SpecId, Bonus & { name: string; desc: string; req: Partial<Record<Attr, number>>; trait?: TraitId }> = {
  harvester: { name: 'Harvester', desc: '+100% speed at Farms', req: { end: 8 }, trait: 'green_thumb', workplaces: ['farm'], speed: 1 },
  forester: { name: 'Forester', desc: '+100% speed at Lumber Camps', req: { str: 8 }, trait: 'lumberjack', workplaces: ['lumbercamp'], speed: 1 },
  mason: { name: 'Mason', desc: '+100% speed at Quarries', req: { str: 8, end: 6 }, trait: 'stonehand', workplaces: ['quarry'], speed: 1 },
  prospector: { name: 'Prospector', desc: '+100% speed at Mines and Outposts, +10% Expedition success', req: { per: 8 }, workplaces: ['mine', 'outpost'], speed: 1, expedition: 0.1 },
  merchant: { name: 'Merchant', desc: '+50% Gold from all Jobs, +100% speed on Trade Routes', req: { cha: 8 }, trait: 'silver_tongue', gold: 0.5, trade: 1 },
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

// Expeditions: a timed journey to a Site. Longer and riskier the farther it is.
export const EXPEDITION_MAX_PARTY = 3
export const EXPEDITION_SECONDS_PER_DISTANCE = 90
export const EXPEDITION_FOOD_PER_MEMBER_DISTANCE = 4
export const EXPEDITION_GOLD_PER_DISTANCE = 10
export const EXPEDITION_XP_PER_DISTANCE = 12 // per party member, on success
export const EXPEDITION_BASE_CHANCE = 0.85
export const EXPEDITION_CHANCE_PER_DISTANCE = 0.07 // lost per step of distance
export const EXPEDITION_CHANCE_PER_POINT = 0.01 // gained per point of Strength, Endurance or Perception in the party
export const EXPEDITION_ATTRS: Attr[] = ['str', 'end', 'per']
export const EXPEDITION_CHANCE_RANGE: [min: number, max: number] = [0.05, 0.95]
export const INJURY_CHANCE = 0.4 // per Party member, when an Expedition fails
export const INJURY_SECONDS = 600 // how long an Injured Villager takes to recover

// Ruins: one high-risk, high-reward Expedition into a reached Ruin. Duration and cost as for any Expedition.
export const RUIN_LEVEL_BASE = 5 // every Party member must be at least this level, plus the Ruin's distance
export const RUIN_BASE_CHANCE = 0.6 // replaces EXPEDITION_BASE_CHANCE
export const RUIN_MAX_CHANCE = 0.75 // replaces the top of EXPEDITION_CHANCE_RANGE, so even a strong Party takes a risk
export const RUIN_INJURY_CHANCE = 0.75 // replaces INJURY_CHANCE
export const RUIN_REWARD_PER_DISTANCE: Bag = { gold: 150, crystal: 3, spice: 3, silk: 3 }
export const RUIN_XP_PER_DISTANCE = 50 // per Party member, on success

// Outposts: built on a reached Resource Deposit, worked like a Production Job for its Rare Material.
export const OUTPOST_COST: Bag = { wood: 60, stone: 30, gold: 40 } // level 1; each upgrade multiplies by UPGRADE_SCALE^level
export const OUTPOST_SLOTS = 1 // per level
export const OUTPOST_YIELD = 1 // of the deposit's Rare Material, per cycle and per Outpost level
export const OUTPOST_JOB: JobDef = { id: 'deposit', name: 'Work the Deposit', kind: 'production', minLevel: 1, duration: 40, attrs: { str: 1, per: 1 }, yields: {}, xp: 5 }

// Foreign Cities: each reached city trades at its own rates. In each cycle a Trade Route sends one load of a good
// the city buys and receives one load of a good it sells. The Nth Foreign City on the map (by id) gets the Nth entry.
// `unlocks[t]` are extra goods (per load) the city deals in once its Reputation reaches tier t.
export interface ForeignCityDef { name: string; buys: Bag; sells: Bag; unlocks: Record<number, { buys?: Bag; sells?: Bag }> }
export const FOREIGN_CITIES: ForeignCityDef[] = [
  {
    name: 'Varenhold', buys: { wood: 30, food: 40, gold: 25 }, sells: { crystal: 1, stone: 15, silk: 1 },
    unlocks: { 1: { buys: { ore: 8 } }, 2: { sells: { spice: 1 } }, 3: { sells: { gold: 20 } } },
  },
  {
    name: 'Saltmere', buys: { food: 30, ore: 6, gold: 20 }, sells: { spice: 2, wood: 20, gold: 12 },
    unlocks: { 1: { buys: { stone: 20 } }, 2: { sells: { silk: 1 } }, 3: { sells: { crystal: 1 } } },
  },
  {
    name: 'Ashkar', buys: { stone: 20, crystal: 1, gold: 30 }, sells: { silk: 2, ore: 8, spice: 1 },
    unlocks: { 1: { buys: { wood: 30 } }, 2: { sells: { food: 40 } }, 3: { sells: { crystal: 1 } } },
  },
]
// Reputation: a Foreign City's standing toward the player, earned by completed Trade Route cycles. Each Reputation
// Tier raises every load the city sells by its sellBonus (see ratesAt in game.ts) and unlocks that city's goods for the tier.
export const REPUTATION_PER_CYCLE = 1
export const REPUTATION_TIERS = [
  { name: 'Stranger', reputation: 0, sellBonus: 0 },
  { name: 'Friend', reputation: 20, sellBonus: 0.2 },
  { name: 'Partner', reputation: 60, sellBonus: 0.4 },
  { name: 'Honored', reputation: 150, sellBonus: 0.6 },
] as const
export const TRADE_JOB: JobDef = { id: 'trade', name: 'Trade Route', kind: 'production', minLevel: 1, duration: 30, attrs: { cha: 1 }, yields: {}, xp: 3 }

export const NAMES = [
  'Ada', 'Bram', 'Cora', 'Dag', 'Edda', 'Finn', 'Greta', 'Hal', 'Ivy', 'Jory', 'Kaja', 'Leif', 'Mira', 'Nils',
  'Orla', 'Pim', 'Quinn', 'Runa', 'Sten', 'Tove', 'Ulla', 'Vidar', 'Wren', 'Ylva',
]
