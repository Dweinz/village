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
// expedition: added success chance; trade: added speed on Trade Routes only; expeditionSpeed: added speed on Expeditions.
export interface Bonus { workplaces?: Workplace[]; speed?: number; xp?: number; gold?: number; expedition?: number; trade?: number; expeditionSpeed?: number }

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
  rareUpgrade: Partial<Record<RareMaterial, number>> // what the last upgrade (to MAX_BUILDING_LEVEL) costs in Rare Materials, on top of the usual cost
}

export const UPGRADE_SCALE = 1.9
export const MAX_BUILDING_LEVEL = 5

const prod = (id: string, name: string, duration: number, attrs: JobDef['attrs'], yields: Bag, xp: number, extra: Partial<JobDef> = {}): JobDef =>
  ({ id, name, kind: 'production', minLevel: 1, duration, attrs, yields, xp, ...extra })
const contract = (id: string, name: string, minLevel: number, duration: number, attrs: JobDef['attrs'], yields: Bag, xp: number, cost?: Bag): JobDef =>
  ({ id, name, kind: 'contract', minLevel, duration, attrs, yields, xp, cost })

export const BUILDINGS: Record<BuildingType, BuildingDef> = {
  townhall: {
    name: 'Town Hall', cost: { wood: 40, gold: 40 }, slots: 1, housing: 3, unique: true, chapter: 0, rareUpgrade: { crystal: 6, silk: 6 },
    jobs: [
      prod('taxes', 'Collect Taxes', 20, { cha: 1 }, { gold: 6 }, 3),
      contract('dispute', 'Settle a Dispute', 2, 90, { cha: 1, int: 1 }, { gold: 80 }, 40),
    ],
  },
  farm: {
    name: 'Farm', cost: { wood: 20 }, slots: 2, chapter: 0, rareUpgrade: { spice: 4 },
    jobs: [
      prod('fields', 'Tend Fields', 10, { end: 1 }, { food: 4 }, 2),
      contract('festival', 'Harvest Festival', 3, 180, { end: 1, cha: 1 }, { food: 120, gold: 40 }, 60),
    ],
  },
  lumbercamp: {
    name: 'Lumber Camp', cost: { gold: 20 }, slots: 2, chapter: 0, rareUpgrade: { silk: 4 },
    jobs: [
      prod('chop', 'Chop Wood', 12, { str: 1 }, { wood: 4 }, 2),
      contract('thicket', 'Clear the Thicket', 3, 150, { str: 1, end: 1 }, { wood: 100 }, 50),
    ],
  },
  house: { name: 'House', cost: { wood: 30 }, slots: 0, housing: 2, chapter: 0, jobs: [], rareUpgrade: { silk: 3 } },
  tavern: {
    name: 'Tavern', cost: { wood: 50, gold: 50 }, slots: 1, unique: true, chapter: 1, rareUpgrade: { spice: 6 },
    jobs: [
      prod('serve', 'Serve Drinks', 15, { cha: 1, dex: 1 }, { gold: 5 }, 3, { cost: { food: 1 } }),
      contract('feast', 'Host a Feast', 2, 120, { cha: 1 }, { gold: 150 }, 60, { food: 40 }),
      contract('banquet', 'Spice Banquet', 3, 240, { cha: 2 }, { gold: 450 }, 150, { spice: 4, food: 40 }),
    ],
  },
  quarry: {
    name: 'Quarry', cost: { wood: 40, gold: 30 }, slots: 2, chapter: 1, rareUpgrade: { crystal: 4 },
    jobs: [prod('cut', 'Cut Stone', 15, { str: 1, end: 1 }, { stone: 3 }, 3)],
  },
  mine: {
    name: 'Mine', cost: { wood: 60, stone: 40 }, slots: 2, chapter: 2, rareUpgrade: { crystal: 6 },
    jobs: [prod('dig', 'Dig Ore', 20, { str: 1, per: 1 }, { ore: 2 }, 4)],
  },
  guildhall: {
    name: 'Guild Hall', cost: { wood: 80, stone: 60, gold: 100 }, slots: 1, unique: true, chapter: 2, rareUpgrade: { crystal: 5, spice: 5, silk: 5 },
    jobs: [
      prod('train', 'Train', 30, { int: 1 }, {}, 12),
      contract('archives', 'Study the Archives', 2, 240, { int: 2 }, {}, 100),
      contract('lore', 'Crystal Lore', 3, 300, { int: 2 }, {}, 300, { crystal: 4 }),
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

export const RECRUIT_POOL = 3 // Recruits in the Tavern at a time

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

// Renown: the player's town-wide XP. Each rank costs RENOWN_BASE × (rank + 1)^RENOWN_GROWTH and grants a Talent Point.
export const RENOWN_BASE = 250
export const RENOWN_GROWTH = 1.6
// Flat Renown for world milestones, on top of the XP Villagers earn for them.
export const RENOWN_PER_SITE_REVEALED = 50
export const RENOWN_PER_RUIN_CLEARED = 150
export const RENOWN_PER_REPUTATION_TIER = 100

// Talent Tree: one web shared by all Settlements, grown out from its centre (ADR 0003). A Talent's bonus applies to
// every Villager, and an `expedition` bonus once to each Party; Talent bonuses add together, then multiply with Traits
// and Specializations.
// chapter: the Chapter index the player must reach to take it (for Talents about features that open later).
// at: [depth, lane] within its region: depth counts out from the centre, lane runs across the region (see webPosition).
export type TalentKind = 'minor' | 'notable' | 'keystone'
export type TalentRegion = 'wayfinding' | 'industry' | 'stewardship'
// Levers only Talents pull, on top of the shared Bonus. Each adds its fraction; `…Cost`, `upkeep` and `injury…` are
// taken off instead (so 0.1 = 10% less), and `party`, `recruits`, `housing` and `offlineCap` are flat amounts.
export interface TalentBonus extends Bonus {
  yield?: number // more Materials (not Gold) from each Job cycle
  expeditionCost?: number
  party?: number // more Villagers in a Party
  injuryChance?: number
  injuryTime?: number
  upkeep?: number
  buildCost?: number // building and upgrading Buildings
  housing?: number
  hireCost?: number
  recruits?: number // more Recruits in the Tavern pool
  traitChance?: number // added chance that a Recruit rolls a Trait
  tradeRate?: number // more of each load a Foreign City sells
  reputation?: number // more Reputation per Trade Route cycle
  rareYield?: number // more Rare Materials from Outposts and Ruins
  offlineCap?: number // seconds
}
export type WebSpot = [depth: number, lane: number]
export interface TalentDef extends TalentBonus { name: string; desc: string; kind: TalentKind; region: TalentRegion; chapter: number; at: WebSpot }
export const WORLD_MAP_CHAPTER = 4 // completing Beyond the Walls opens the World Map, and with it Expeditions, Outposts and Trade Routes
export const TALENTS = {
  // Industry: Villager speed, yields, XP, Upkeep, Injuries
  diligence: { name: 'Diligence', desc: '+5% speed everywhere', kind: 'minor', region: 'industry', chapter: 0, at: [1, 0], speed: 0.05 },
  green_fields: { name: 'Green Fields', desc: '+10% speed at Farms and Lumber Camps', kind: 'minor', region: 'industry', chapter: 0, at: [2, -1], workplaces: ['farm', 'lumbercamp'], speed: 0.1 },
  quick_study: { name: 'Quick Study', desc: '+10% XP', kind: 'minor', region: 'industry', chapter: 0, at: [2, 1], xp: 0.1 },
  steady_hands: { name: 'Steady Hands', desc: '+5% speed everywhere', kind: 'minor', region: 'industry', chapter: 0, at: [3, 0], speed: 0.05 },
  bountiful_harvest: { name: 'Bountiful Harvest', desc: '+15% Food from Farms', kind: 'minor', region: 'industry', chapter: 0, at: [3, -2], workplaces: ['farm'], yield: 0.15 },
  timber_rights: { name: 'Timber Rights', desc: '+15% Wood from Lumber Camps', kind: 'minor', region: 'industry', chapter: 0, at: [3, -1], workplaces: ['lumbercamp'], yield: 0.15 },
  frugal_meals: { name: 'Frugal Meals', desc: '-10% Upkeep', kind: 'minor', region: 'industry', chapter: 0, at: [3, 1], upkeep: 0.1 },
  mentorship: { name: 'Mentorship', desc: '+10% XP', kind: 'minor', region: 'industry', chapter: 0, at: [3, 2], xp: 0.1 },
  work_ethic: { name: 'Work Ethic', desc: '+15% speed everywhere', kind: 'notable', region: 'industry', chapter: 0, at: [4, 0], speed: 0.15 },
  stonecutting: { name: 'Stonecutting', desc: '+15% speed at Quarries', kind: 'minor', region: 'industry', chapter: 1, at: [4, -2], workplaces: ['quarry'], speed: 0.15 },
  deep_veins: { name: 'Deep Veins', desc: '+15% Stone and Ore from Quarries and Mines', kind: 'minor', region: 'industry', chapter: 1, at: [4, -1], workplaces: ['quarry', 'mine'], yield: 0.15 },
  lean_rations: { name: 'Lean Rations', desc: '-10% Upkeep', kind: 'minor', region: 'industry', chapter: 0, at: [4, 1], upkeep: 0.1 },
  apprenticeship: { name: 'Apprenticeship', desc: '+25% XP', kind: 'notable', region: 'industry', chapter: 0, at: [4, 2], xp: 0.25 },
  granaries: { name: 'Granaries', desc: '-10% Upkeep', kind: 'minor', region: 'industry', chapter: 0, at: [4, -3], upkeep: 0.1 }, // path to Stewardship
  master_craftsmen: { name: 'Master Craftsmen', desc: '+15% Materials from every Job', kind: 'notable', region: 'industry', chapter: 0, at: [5, -1], yield: 0.15 },
  guild_training: { name: 'Guild Training', desc: '+15% speed at Mines and the Guild Hall', kind: 'minor', region: 'industry', chapter: 2, at: [5, 0], workplaces: ['mine', 'guildhall'], speed: 0.15 },
  field_medicine: { name: 'Field Medicine', desc: 'Injuries heal 25% sooner', kind: 'minor', region: 'industry', chapter: WORLD_MAP_CHAPTER, at: [5, 1], injuryTime: 0.25 },
  caution: { name: 'Caution', desc: '-20% Injury chance', kind: 'minor', region: 'industry', chapter: WORLD_MAP_CHAPTER, at: [5, 2], injuryChance: 0.2 },
  bonesetters: { name: 'Bonesetters', desc: 'Injuries heal 40% sooner, -15% Injury chance', kind: 'notable', region: 'industry', chapter: WORLD_MAP_CHAPTER, at: [6, 1], injuryTime: 0.4, injuryChance: 0.15 },
  hardy_travellers: { name: 'Hardy Travellers', desc: '+5% Expedition success', kind: 'minor', region: 'industry', chapter: WORLD_MAP_CHAPTER, at: [6, 3], expedition: 0.05 }, // path to Wayfinding

  // Wayfinding: Expeditions, exploring, Outposts, Ruins
  trailcraft: { name: 'Trailcraft', desc: 'Expeditions travel 10% faster', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [1, 0], expeditionSpeed: 0.1 },
  sure_footed: { name: 'Sure-Footed', desc: '+5% Expedition success', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [2, -1], expedition: 0.05 },
  light_packs: { name: 'Light Packs', desc: 'Expeditions cost 10% less', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [2, 0], expeditionCost: 0.1 },
  prospecting: { name: 'Prospecting', desc: '+20% speed at Outposts', kind: 'notable', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [2, 1], workplaces: ['outpost'], speed: 0.2 },
  provisioner: { name: 'Provisioner', desc: 'Expeditions cost 10% less', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [3, -2], expeditionCost: 0.1 },
  keen_eye: { name: 'Keen Eye', desc: '+5% Expedition success', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [3, -1], expedition: 0.05 },
  pathfinder: { name: 'Pathfinder', desc: 'Expeditions travel 10% faster', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [3, 0], expeditionSpeed: 0.1 },
  rich_seams: { name: 'Rich Seams', desc: '+20% Rare Materials from Outposts and Ruins', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [3, 1], rareYield: 0.2 },
  tomb_robbers: { name: 'Tomb Robbers', desc: '+20% Rare Materials from Outposts and Ruins', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [3, 2], rareYield: 0.2 },
  supply_lines: { name: 'Supply Lines', desc: 'Expeditions cost 15% less', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [4, -2], expeditionCost: 0.15 },
  veteran_guides: { name: 'Veteran Guides', desc: '+10% Expedition success', kind: 'notable', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [4, -1], expedition: 0.1 },
  long_roads: { name: 'Long Roads', desc: 'Expeditions travel 25% faster', kind: 'notable', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [4, 0], expeditionSpeed: 0.25 },
  deep_cores: { name: 'Deep Cores', desc: '+15% speed at Outposts', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [4, 1], workplaces: ['outpost'], speed: 0.15 },
  pack_mules: { name: 'Pack Mules', desc: 'Expeditions cost 10% less', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [5, -2], expeditionCost: 0.1 },
  strength_in_numbers: { name: 'Strength in Numbers', desc: '+1 Villager in a Party', kind: 'notable', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [5, -1], party: 1 },
  trail_markers: { name: 'Trail Markers', desc: 'Expeditions travel 10% faster', kind: 'minor', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [5, 0], expeditionSpeed: 0.1 },
  motherlode: { name: 'Motherlode', desc: '+40% Rare Materials from Outposts and Ruins', kind: 'notable', region: 'wayfinding', chapter: WORLD_MAP_CHAPTER, at: [5, 1], rareYield: 0.4 },

  // Stewardship: Gold, trade, Reputation, costs, Housing, hiring, Offline Progress cap
  coin_sense: { name: 'Coin Sense', desc: '+10% Gold from all Jobs', kind: 'minor', region: 'stewardship', chapter: 0, at: [1, 0], gold: 0.1 },
  haggling: { name: 'Haggling', desc: '+15% speed on Trade Routes', kind: 'minor', region: 'stewardship', chapter: WORLD_MAP_CHAPTER, at: [2, -1], trade: 0.15 },
  open_doors: { name: 'Open Doors', desc: 'Hiring costs 15% less', kind: 'minor', region: 'stewardship', chapter: 1, at: [2, 0], hireCost: 0.15 },
  thrift: { name: 'Thrift', desc: 'Buildings and upgrades cost 10% less', kind: 'minor', region: 'stewardship', chapter: 0, at: [2, 1], buildCost: 0.1 },
  good_name: { name: 'Good Name', desc: '+50% Reputation from Trade Routes', kind: 'minor', region: 'stewardship', chapter: WORLD_MAP_CHAPTER, at: [3, -2], reputation: 0.5 },
  fair_dealing: { name: 'Fair Dealing', desc: 'Foreign Cities sell 10% more per load', kind: 'minor', region: 'stewardship', chapter: WORLD_MAP_CHAPTER, at: [3, -1], tradeRate: 0.1 },
  word_of_mouth: { name: 'Word of Mouth', desc: '+1 Recruit at the Tavern', kind: 'minor', region: 'stewardship', chapter: 1, at: [3, 0], recruits: 1 },
  masons_guild: { name: "Masons' Guild", desc: 'Buildings and upgrades cost 10% less', kind: 'minor', region: 'stewardship', chapter: 0, at: [3, 1], buildCost: 0.1 },
  cozy_homes: { name: 'Cozy Homes', desc: '+2 Housing', kind: 'minor', region: 'stewardship', chapter: 0, at: [3, 2], housing: 2 },
  ambassadors: { name: 'Ambassadors', desc: '+100% Reputation from Trade Routes', kind: 'notable', region: 'stewardship', chapter: WORLD_MAP_CHAPTER, at: [4, -2], reputation: 1 },
  trade_charter: { name: 'Trade Charter', desc: 'Foreign Cities sell 25% more per load', kind: 'notable', region: 'stewardship', chapter: WORLD_MAP_CHAPTER, at: [4, -1], tradeRate: 0.25 },
  good_judge: { name: 'Good Judge', desc: 'Recruits are 15% likelier to have a Trait, and to have two', kind: 'notable', region: 'stewardship', chapter: 1, at: [4, 0], traitChance: 0.15 },
  master_builders: { name: 'Master Builders', desc: 'Buildings and upgrades cost 20% less', kind: 'notable', region: 'stewardship', chapter: 0, at: [4, 1], buildCost: 0.2 },
  shared_hearths: { name: 'Shared Hearths', desc: '+2 Housing', kind: 'minor', region: 'stewardship', chapter: 0, at: [4, 2], housing: 2 },
  road_wardens: { name: 'Road Wardens', desc: 'Expeditions cost 5% less, +10% speed on Trade Routes', kind: 'minor', region: 'stewardship', chapter: WORLD_MAP_CHAPTER, at: [5, -3], expeditionCost: 0.05, trade: 0.1 }, // path to Wayfinding
  good_wages: { name: 'Good Wages', desc: 'Hiring costs 15% less', kind: 'minor', region: 'stewardship', chapter: 1, at: [5, 0], hireCost: 0.15 },
  night_watch: { name: 'Night Watch', desc: '+2h Offline Progress cap', kind: 'minor', region: 'stewardship', chapter: 0, at: [5, 1], offlineCap: 2 * 3600 },
  trusted_stewards: { name: 'Trusted Stewards', desc: '+4h Offline Progress cap', kind: 'notable', region: 'stewardship', chapter: 0, at: [6, 1], offlineCap: 4 * 3600 },
} satisfies Record<string, TalentDef>
export type TalentId = keyof typeof TALENTS
// The web's paths, both ways. 'centre' is where every build starts: it isn't a Talent and is never taken.
export const TALENT_LINKS: ['centre' | TalentId, TalentId][] = [
  ['centre', 'diligence'], ['diligence', 'green_fields'], ['diligence', 'quick_study'], ['diligence', 'steady_hands'],
  ['green_fields', 'bountiful_harvest'], ['green_fields', 'timber_rights'], ['quick_study', 'frugal_meals'], ['quick_study', 'mentorship'],
  ['steady_hands', 'work_ethic'], ['bountiful_harvest', 'stonecutting'], ['bountiful_harvest', 'granaries'], ['timber_rights', 'deep_veins'],
  ['frugal_meals', 'lean_rations'], ['mentorship', 'apprenticeship'], ['deep_veins', 'master_craftsmen'], ['stonecutting', 'master_craftsmen'],
  ['work_ethic', 'guild_training'], ['lean_rations', 'field_medicine'], ['apprenticeship', 'caution'], ['field_medicine', 'bonesetters'],
  ['caution', 'bonesetters'], ['caution', 'hardy_travellers'],

  ['centre', 'trailcraft'], ['trailcraft', 'sure_footed'], ['trailcraft', 'light_packs'], ['trailcraft', 'prospecting'],
  ['sure_footed', 'provisioner'], ['sure_footed', 'keen_eye'], ['light_packs', 'pathfinder'], ['prospecting', 'rich_seams'], ['prospecting', 'tomb_robbers'],
  ['provisioner', 'supply_lines'], ['keen_eye', 'veteran_guides'], ['pathfinder', 'long_roads'], ['rich_seams', 'deep_cores'],
  ['supply_lines', 'pack_mules'], ['veteran_guides', 'strength_in_numbers'], ['long_roads', 'trail_markers'], ['deep_cores', 'motherlode'],

  ['centre', 'coin_sense'], ['coin_sense', 'haggling'], ['coin_sense', 'open_doors'], ['coin_sense', 'thrift'],
  ['haggling', 'good_name'], ['haggling', 'fair_dealing'], ['open_doors', 'word_of_mouth'], ['thrift', 'masons_guild'], ['thrift', 'cozy_homes'],
  ['good_name', 'ambassadors'], ['fair_dealing', 'trade_charter'], ['word_of_mouth', 'good_judge'], ['masons_guild', 'master_builders'],
  ['cozy_homes', 'shared_hearths'], ['ambassadors', 'road_wardens'], ['good_judge', 'good_wages'], ['master_builders', 'night_watch'],
  ['night_watch', 'trusted_stewards'],

  // Paths between neighbouring regions
  ['granaries', 'shared_hearths'], ['hardy_travellers', 'strength_in_numbers'], ['road_wardens', 'tomb_robbers'],
]
// Keystones (#20) will sit at the outer end of each region, linked from these Talents.
export const KEYSTONE_SLOTS: Record<TalentRegion, { at: WebSpot; from: TalentId[] }> = {
  industry: { at: [6, 0], from: ['guild_training', 'master_craftsmen', 'bonesetters'] },
  wayfinding: { at: [6, 0], from: ['trail_markers', 'strength_in_numbers', 'motherlode'] },
  stewardship: { at: [6, 0], from: ['good_wages', 'trade_charter', 'trusted_stewards'] },
}
// Each region fans out in its own direction from the centre; Wayfinding lies between Industry's +lanes and Stewardship's -lanes.
export const TALENT_REGION_ANGLES: Record<TalentRegion, number> = { industry: 90, wayfinding: 210, stewardship: 330 } // degrees, counter-clockwise from +x
/** Where a spot in a region sits on the web, in grid units: x right, y up, the centre at 0,0. */
export function webPosition(region: TalentRegion, [depth, lane]: WebSpot) {
  const a = (TALENT_REGION_ANGLES[region] * Math.PI) / 180
  return { x: depth * Math.cos(a) - lane * Math.sin(a), y: depth * Math.sin(a) + lane * Math.cos(a) }
}

export const NAMES = [
  'Ada', 'Bram', 'Cora', 'Dag', 'Edda', 'Finn', 'Greta', 'Hal', 'Ivy', 'Jory', 'Kaja', 'Leif', 'Mira', 'Nils',
  'Orla', 'Pim', 'Quinn', 'Runa', 'Sten', 'Tove', 'Ulla', 'Vidar', 'Wren', 'Ylva',
]
