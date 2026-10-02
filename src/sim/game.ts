// Headless simulation (ADR 0001). Pure data in, pure data out: no DOM, no rendering, no wall clock.
import {
  ATTRS, BUILDINGS, EXPEDITION_ATTRS, EXPEDITION_BASE_CHANCE, EXPEDITION_CHANCE_PER_DISTANCE, EXPEDITION_CHANCE_PER_POINT,
  EXPEDITION_CHANCE_RANGE, EXPEDITION_FOOD_PER_MEMBER_DISTANCE, EXPEDITION_GOLD_PER_DISTANCE, EXPEDITION_MAX_PARTY,
  EXPEDITION_SECONDS_PER_DISTANCE, EXPEDITION_XP_PER_DISTANCE, INJURY_CHANCE, INJURY_SECONDS, MAX_BUILDING_LEVEL, NAMES, OUTPOST_COST, OUTPOST_JOB, OUTPOST_SLOTS, OUTPOST_YIELD, RES_NAME,
  FOREIGN_CITIES, RUIN_BASE_CHANCE, RUIN_INJURY_CHANCE, RUIN_LEVEL_BASE, RUIN_MAX_CHANCE, RUIN_REWARD_PER_DISTANCE, RUIN_XP_PER_DISTANCE, SPECS, SPEC_LEVEL, TRADE_JOB, TRAITS,
  TRAIT_IDS, UPGRADE_SCALE, type Attr, type Bag, type Bonus, type BuildingType, type JobDef, type Res, type SpecId, type TraitId, type Workplace,
} from './data'
import { mulberry32 } from './random'
import { generateWorldMap, withMaterials, type Site } from './world'

export interface Villager {
  id: number
  name: string
  level: number
  xp: number
  points: number // unspent Attribute points
  attrs: Record<Attr, number>
  traits: TraitId[]
  spec?: SpecId
  activity?: Activity // undefined = idle
}

// The one thing a Villager is doing.
export type Activity =
  | { kind: 'job'; plot: number; job: string; progress: number }
  | { kind: 'outpost'; site: number; progress: number }
  | { kind: 'trade'; site: number; give: Res; get: Res; progress: number } // a Trade Route with a Foreign City
  | { kind: 'expedition'; expedition: number }
  | { kind: 'injured'; recoversAt: number } // game time

// Reach a revealed Site, explore: reveal the nearest hidden one, or raid a reached Ruin.
export type ExpeditionTarget = { kind: 'reach'; site: number } | { kind: 'explore' } | { kind: 'ruin'; site: number }

export interface ExpeditionPlan { site: Site; duration: number; cost: Bag; chance: number }

export interface Expedition {
  id: number
  party: number[] // Villager ids
  goal: ExpeditionTarget['kind']
  site: number
  duration: number
  progress: number
  chance: number // fixed when the party sets out, as shown in the preview
}

export type Plot = { type: BuildingType; level: number } | null

export interface Game {
  time: number
  seed: number
  stock: Record<Res, number>
  plots: Plot[] // plot 0 is always the Town Hall
  villagers: Villager[]
  recruits: Villager[]
  tavernRefreshAt: number
  chapter: number
  done: string[] // completed Objective ids
  starving: boolean
  nextId: number
  worldMap: Site[]
  expeditions: Expedition[]
}

export type GameEvent =
  | { kind: 'level'; name: string; level: number }
  | { kind: 'contract'; name: string; job: string }
  | { kind: 'chapter'; chapter: number }
  | { kind: 'starving' }
  | { kind: 'worldMap' }
  | { kind: 'expeditionSucceeded'; party: string[]; goal: Expedition['goal']; site: Site['kind'] }
  | { kind: 'expeditionFailed'; party: string[] }
  | { kind: 'siteRevealed'; party: string[]; id: number; site: Site['kind']; distance: number }
  | { kind: 'ruinCleared'; party: string[]; reward: Bag }
  | { kind: 'traded'; name: string; city: string; gave: Bag; got: Bag } // one Trade Route cycle
  | { kind: 'injured'; name: string }
  | { kind: 'recovered'; name: string }

export const UPKEEP = 0.08 // Food per Villager per second
export const MAX_LEVEL = 30
export const OFFLINE_CAP = 8 * 3600
export const TAVERN_REFRESH = 300
export const REROLL_COST = 20
export const PLOT_COUNT = 9

// --- Chapters ---------------------------------------------------------------

export interface Objective { id: string; text: string; check: (g: Game) => boolean }
const has = (g: Game, type: BuildingType, level = 1) => g.plots.some((p) => p?.type === type && p.level >= level)

export const CHAPTERS: { name: string; objectives: Objective[] }[] = [
  {
    name: 'Founding',
    objectives: [
      { id: 'wood30', text: 'Stockpile 30 Wood', check: (g) => g.stock.wood >= 30 },
      { id: 'house', text: 'Build a House', check: (g) => has(g, 'house') },
      { id: 'th2', text: 'Upgrade the Town Hall to level 2', check: (g) => has(g, 'townhall', 2) },
    ],
  },
  {
    name: 'New Faces',
    objectives: [
      { id: 'tavern', text: 'Build a Tavern', check: (g) => has(g, 'tavern') },
      { id: 'hire', text: 'Hire a Villager', check: (g) => g.villagers.length >= 4 },
      { id: 'lvl3', text: 'Raise a Villager to level 3', check: (g) => g.villagers.some((v) => v.level >= 3) },
    ],
  },
  {
    name: 'Mastery',
    objectives: [
      { id: 'th3', text: 'Upgrade the Town Hall to level 3', check: (g) => has(g, 'townhall', 3) },
      { id: 'guild', text: 'Build a Guild Hall', check: (g) => has(g, 'guildhall') },
      { id: 'spec', text: 'Specialize a Villager', check: (g) => g.villagers.some((v) => v.spec) },
    ],
  },
  {
    name: 'Beyond the Walls',
    objectives: [
      { id: 'th4', text: 'Upgrade the Town Hall to level 4', check: (g) => has(g, 'townhall', 4) },
      { id: 'mine', text: 'Build a Mine', check: (g) => has(g, 'mine') },
      { id: 'ore50', text: 'Stockpile 50 Ore', check: (g) => g.stock.ore >= 50 },
    ],
  },
]

export const WORLD_MAP_CHAPTER = 4 // completing Beyond the Walls opens the World Map
export const worldMapUnlocked = (g: Game) => g.chapter >= WORLD_MAP_CHAPTER

// --- Helpers ----------------------------------------------------------------

function rand(g: Game) { // the seed lives in state so the sim stays deterministic
  const [value, next] = mulberry32(g.seed)
  g.seed = next
  return value
}
const pick = <T,>(g: Game, arr: readonly T[]) => arr[Math.floor(rand(g) * arr.length)]

function makeVillager(g: Game): Villager {
  const attrs = Object.fromEntries(ATTRS.map((a) => [a, 1 + Math.floor(rand(g) * 5)])) as Record<Attr, number>
  const roll = rand(g)
  const traits: TraitId[] = []
  while (traits.length < (roll < 0.1 ? 2 : roll < 0.4 ? 1 : 0)) {
    const t = pick(g, TRAIT_IDS)
    if (!traits.includes(t)) traits.push(t)
  }
  return { id: g.nextId++, name: pick(g, NAMES), level: 1, xp: 0, points: 0, attrs, traits }
}

export const plotHousing = (p: NonNullable<Plot>) => (BUILDINGS[p.type].housing ?? 0) * p.level
export const housing = (g: Game) => g.plots.reduce((n, p) => n + (p ? plotHousing(p) : 0), 0)
export const slots = (p: NonNullable<Plot>) => BUILDINGS[p.type].slots * p.level
export const currentJob = (v: Villager) => (v.activity?.kind === 'job' ? v.activity : undefined)
export const jobOf = (g: Game, v: Villager) => { const work = currentJob(v); return work && findJob(g.plots[work.plot]!.type, work.job) }
export const workers = (g: Game, plot: number) => g.villagers.filter((v) => currentJob(v)?.plot === plot)
export const jobsFor = (p: NonNullable<Plot>) => BUILDINGS[p.type].jobs.filter((j) => j.minLevel <= p.level)
export const findJob = (type: BuildingType, id: string) => BUILDINGS[type].jobs.find((j) => j.id === id)!
export const xpToNext = (level: number) => Math.round(10 * level ** 1.6)
export const hireCost = (g: Game) => Math.round(50 * 1.5 ** Math.max(0, g.villagers.length - 3))
export const buildCost = (type: BuildingType, level: number): Bag =>
  Object.fromEntries(Object.entries(BUILDINGS[type].cost).map(([r, n]) => [r, Math.round(n * UPGRADE_SCALE ** level)]))
/** Half of everything paid for a Building (its level-1 cost and every upgrade), rounded down. */
export function demolishRefund(p: NonNullable<Plot>): Bag {
  const refund: Bag = {}
  for (let level = 0; level < p.level; level++) {
    for (const [r, n] of Object.entries(buildCost(p.type, level))) refund[r as Res] = (refund[r as Res] ?? 0) + n
  }
  return Object.fromEntries(Object.entries(refund).map(([r, n]) => [r, Math.floor(n / 2)]))
}
export const maxLevel = (g: Game, type: BuildingType) => (type === 'townhall' ? MAX_BUILDING_LEVEL : g.plots[0]!.level)
export const canAfford = (g: Game, bag: Bag) => Object.entries(bag).every(([r, n]) => g.stock[r as Res] >= n)

const bonuses = (v: Villager): Bonus[] => [...v.traits.map((t) => TRAITS[t]), ...(v.spec ? [SPECS[v.spec]] : [])]
const applies = (b: Bonus, type: Workplace) => !b.workplaces || b.workplaces.includes(type)
const mult = (v: Villager, type: Workplace, key: 'xp' | 'gold') =>
  bonuses(v).reduce((m, b) => (applies(b, type) ? m * (1 + (b[key] ?? 0)) : m), 1)

export function speed(g: Game, v: Villager, type: Workplace, job: JobDef) {
  let s = 1 + 0.04 * Object.entries(job.attrs).reduce((n, [a, w]) => n + v.attrs[a as Attr] * w, 0)
  for (const b of bonuses(v)) {
    if (applies(b, type)) s *= 1 + (b.speed ?? 0)
    if (type === 'trade') s *= 1 + (b.trade ?? 0)
  }
  return g.starving ? s / 2 : s
}

export function canSpecialize(g: Game, v: Villager, id: SpecId) {
  const s = SPECS[id]
  const meetsReq = Object.entries(s.req).every(([a, n]) => v.attrs[a as Attr] >= n) || (!!s.trait && v.traits.includes(s.trait))
  return !v.spec && v.level >= SPEC_LEVEL && has(g, 'guildhall') && meetsReq
}

const villager = (g: Game, id: number) => g.villagers.find((v) => v.id === id)!
export const siteById = (g: Game, id: number) => g.worldMap.find((s) => s.id === id)!
// XP bonuses that apply everywhere (e.g. Quick Learner, Scholar), for XP earned outside a Building.
const xpMult = (v: Villager) => bonuses(v).reduce((m, b) => (b.workplaces ? m : m * (1 + (b.xp ?? 0))), 1)

/** What a Villager is doing, in words for the player. */
export function activityName(g: Game, v: Villager) {
  if (v.activity?.kind === 'expedition') return 'Away on an Expedition'
  if (v.activity?.kind === 'injured') return 'Injured'
  if (v.activity?.kind === 'trade') return `Trade Route to ${foreignCity(g, v.activity.site).name}`
  if (v.activity?.kind === 'outpost') return `Work the ${RES_NAME[siteById(g, v.activity.site).material!]} Deposit`
  return jobOf(g, v)?.name ?? 'Idle'
}
/**
 * Why a Villager can't be given something else to do right now, or undefined if they're free.
 * A Contract can't be abandoned (its cost is paid); away or Injured Villagers can't be called on.
 * A Production Job doesn't count: it is simply left behind.
 */
export function busyReason(g: Game, v: Villager): string | undefined {
  if (jobOf(g, v)?.kind === 'contract') return `${v.name} is busy with a Contract`
  if (v.activity?.kind === 'expedition') return `${v.name} is away on an Expedition`
  if (v.activity?.kind === 'injured') return `${v.name} is Injured`
}
export const canJoinExpedition = (g: Game, v: Villager) => !busyReason(g, v)
/** Seconds until an Injured Villager recovers, or undefined if they aren't Injured. */
export const recoveryLeft = (g: Game, v: Villager) => (v.activity?.kind === 'injured' ? Math.max(0, v.activity.recoversAt - g.time) : undefined)

function endExpedition(g: Game, x: Expedition) {
  for (const id of x.party) villager(g, id).activity = undefined
  g.expeditions = g.expeditions.filter((e) => e !== x)
}

function pay(g: Game, bag: Bag) {
  if (!canAfford(g, bag)) throw new Error('Not enough resources')
  for (const [r, n] of Object.entries(bag)) g.stock[r as Res] -= n
}

function addXp(v: Villager, xp: number, ev: GameEvent[]) {
  v.xp += xp
  while (v.level < MAX_LEVEL && v.xp >= xpToNext(v.level)) {
    v.xp -= xpToNext(v.level)
    v.level++
    v.points += 2
    ev.push({ kind: 'level', name: v.name, level: v.level })
  }
  if (v.level >= MAX_LEVEL) v.xp = 0
}

// --- Simulation -------------------------------------------------------------

export function newGame(seed = Date.now()): Game {
  const g: Game = {
    time: 0, seed, stock: { gold: 30, wood: 20, stone: 0, food: 30, ore: 0, crystal: 0, spice: 0, silk: 0 },
    plots: Array(PLOT_COUNT).fill(null), villagers: [], recruits: [], tavernRefreshAt: 0,
    chapter: 0, done: [], starving: false, nextId: 1, worldMap: withMaterials(generateWorldMap(seed)), expeditions: [],
  }
  g.plots[0] = { type: 'townhall', level: 1 }
  g.plots[1] = { type: 'farm', level: 1 }
  g.plots[2] = { type: 'lumbercamp', level: 1 }
  for (let i = 0; i < 3; i++) g.villagers.push(makeVillager(g))
  return g
}

function step(g: Game, s: number, ev: GameEvent[]) {
  g.time += s

  const upkeep = g.villagers.length * UPKEEP * s
  if (g.stock.food >= upkeep) {
    g.stock.food -= upkeep
    g.starving = false
  } else {
    g.stock.food = 0
    if (!g.starving) ev.push({ kind: 'starving' })
    g.starving = true
  }

  for (const v of g.villagers) {
    const work = currentJob(v)
    if (!work) continue
    const type = g.plots[work.plot]!.type
    const job = findJob(type, work.job)
    work.progress = Math.min(job.duration, work.progress + s * speed(g, v, type, job))
    if (work.progress < job.duration) continue
    if (job.kind === 'production') {
      if (job.cost && !canAfford(g, job.cost)) continue // stalls until it can pay
      if (job.cost) pay(g, job.cost)
      work.progress = 0
    } else {
      v.activity = undefined
      ev.push({ kind: 'contract', name: v.name, job: job.name })
    }
    const goldMult = mult(v, type, 'gold')
    for (const [r, n] of Object.entries(job.yields)) g.stock[r as Res] += r === 'gold' ? n * goldMult : n
    addXp(v, job.xp * mult(v, type, 'xp'), ev)
  }

  for (const v of g.villagers) {
    const work = v.activity
    if (work?.kind !== 'outpost') continue
    work.progress = Math.min(OUTPOST_JOB.duration, work.progress + s * speed(g, v, 'outpost', OUTPOST_JOB))
    if (work.progress < OUTPOST_JOB.duration) continue
    work.progress = 0
    const site = siteById(g, work.site)
    g.stock[site.material!] += OUTPOST_YIELD * site.outpost!.level
    addXp(v, OUTPOST_JOB.xp * mult(v, 'outpost', 'xp'), ev)
  }

  for (const v of g.villagers) {
    const route = v.activity
    if (route?.kind !== 'trade') continue
    route.progress = Math.min(TRADE_JOB.duration, route.progress + s * speed(g, v, 'trade', TRADE_JOB))
    if (route.progress < TRADE_JOB.duration) continue
    if (tradeStalled(g, v)) continue // stalls until it can pay
    const city = foreignCity(g, route.site)
    const gave = { [route.give]: city.buys[route.give]! }
    const got = { [route.get]: city.sells[route.get]! }
    pay(g, gave)
    g.stock[route.get] += got[route.get]!
    route.progress = 0
    addXp(v, TRADE_JOB.xp * mult(v, 'trade', 'xp'), ev)
    ev.push({ kind: 'traded', name: v.name, city: city.name, gave, got })
  }

  for (const v of g.villagers) {
    if (v.activity?.kind !== 'injured' || g.time < v.activity.recoversAt) continue
    v.activity = undefined
    ev.push({ kind: 'recovered', name: v.name })
  }

  for (const x of [...g.expeditions]) {
    x.progress = Math.min(x.duration, x.progress + s)
    if (x.progress < x.duration) continue
    const party = x.party.map((id) => villager(g, id))
    const names = party.map((v) => v.name)
    const site = siteById(g, x.site)
    endExpedition(g, x)
    if (rand(g) < x.chance) {
      if (x.goal === 'ruin') {
        site.cleared = true
        const reward = ruinReward(site)
        for (const [r, n] of Object.entries(reward)) g.stock[r as Res] += n
        ev.push({ kind: 'ruinCleared', party: names, reward })
      } else if (x.goal === 'reach') {
        site.discovery = 'reached'
        ev.push({ kind: 'expeditionSucceeded', party: names, goal: x.goal, site: site.kind })
      } else {
        site.discovery = 'revealed'
        ev.push({ kind: 'siteRevealed', party: names, id: site.id, site: site.kind, distance: site.distance })
      }
      const xp = x.goal === 'ruin' ? ruinXp(site) : EXPEDITION_XP_PER_DISTANCE * site.distance
      for (const v of party) addXp(v, xp * xpMult(v), ev)
    } else {
      ev.push({ kind: 'expeditionFailed', party: names })
      for (const v of party) {
        if (rand(g) >= (x.goal === 'ruin' ? RUIN_INJURY_CHANCE : INJURY_CHANCE)) continue
        v.activity = { kind: 'injured', recoversAt: g.time + INJURY_SECONDS }
        ev.push({ kind: 'injured', name: v.name })
      }
    }
  }

  if (g.time >= g.tavernRefreshAt) {
    g.recruits = [0, 1, 2].map(() => makeVillager(g))
    g.tavernRefreshAt = g.time + TAVERN_REFRESH
  }

  const ch = CHAPTERS[g.chapter]
  if (ch) {
    for (const o of ch.objectives) if (!g.done.includes(o.id) && o.check(g)) g.done.push(o.id)
    if (ch.objectives.every((o) => g.done.includes(o.id))) {
      g.chapter++
      ev.push({ kind: 'chapter', chapter: g.chapter })
      if (g.chapter === WORLD_MAP_CHAPTER) ev.push({ kind: 'worldMap' })
    }
  }
}

/** Advance the world by `dt` seconds in fixed 1s steps. Offline Progress is just a big `dt`. */
export function advance(g0: Game, dt: number, ev: GameEvent[] = []): Game {
  const g = structuredClone(g0)
  // ponytail: fixed 1s steps, ~29k iterations for the 8h cap; switch to analytic catch-up if that gets slow
  for (let left = dt; left > 1e-9; left -= 1) step(g, Math.min(1, left), ev)
  return g
}

// --- Player actions: (game, ...args) => new game, throw Error with a player-facing message ---

const action = <A extends unknown[]>(fn: (g: Game, ...a: A) => void) => (g0: Game, ...a: A) => {
  const g = structuredClone(g0)
  fn(g, ...a)
  return g
}
const rejectIfCommitted = (g: Game, v: Villager) => {
  const reason = busyReason(g, v)
  if (reason) throw new Error(reason)
}

// The nearest hidden Site that no Expedition is already exploring.
const nextToExplore = (g: Game) => g.worldMap
  .filter((s) => s.discovery === 'hidden' && !g.expeditions.some((x) => x.goal === 'explore' && x.site === s.id))
  .sort((a, b) => a.distance - b.distance || a.id - b.id)[0]

/** The level every member of a Party must have to raid this Ruin. */
export const ruinLevel = (site: Site) => RUIN_LEVEL_BASE + site.distance
/** The XP each Party member earns for clearing this Ruin, before their own XP bonuses. */
export const ruinXp = (site: Site) => RUIN_XP_PER_DISTANCE * site.distance
/** What clearing this Ruin pays into the Stockpile. */
export const ruinReward = (site: Site): Bag =>
  Object.fromEntries(Object.entries(RUIN_REWARD_PER_DISTANCE).map(([r, n]) => [r, n * site.distance]))

/** What an Expedition would take and risk. Throws a player-facing Error if the party or target is invalid. */
export function planExpedition(g: Game, party: number[], target: ExpeditionTarget): ExpeditionPlan {
  if (party.length === 0) throw new Error('Choose at least one Villager')
  if (party.length > EXPEDITION_MAX_PARTY || new Set(party).size < party.length) throw new Error(`A party is at most ${EXPEDITION_MAX_PARTY} Villagers`)
  const site = target.kind === 'explore' ? nextToExplore(g) : g.worldMap.find((s) => s.id === target.site)
  if (!site) throw new Error(target.kind === 'explore' ? 'Nothing left to explore' : 'No such Site')
  if (target.kind === 'reach') {
    if (site.discovery === 'hidden') throw new Error('That Site is still hidden in the fog')
    if (site.discovery === 'reached') throw new Error('Already reached')
    if (g.expeditions.some((x) => x.goal === 'reach' && x.site === site.id)) throw new Error('An Expedition is already on its way there')
  }
  if (target.kind === 'ruin') {
    if (site.kind !== 'ruin') throw new Error('That Site is not a Ruin')
    if (site.discovery !== 'reached') throw new Error('Reach this Ruin first')
    if (site.cleared) throw new Error('This Ruin has already been cleared')
    if (g.expeditions.some((x) => x.goal === 'ruin' && x.site === site.id)) throw new Error('A Party is already inside this Ruin')
  }
  if (party.some((id) => !g.villagers.some((v) => v.id === id))) throw new Error('No such Villager')
  const members = party.map((id) => villager(g, id))
  for (const v of members) rejectIfCommitted(g, v) // a Villager on a Production Job leaves it to go
  if (target.kind === 'ruin' && members.some((v) => v.level < ruinLevel(site))) {
    throw new Error(`Every member of the Party must be level ${ruinLevel(site)} or higher`)
  }
  const points = members.reduce((n, v) => n + EXPEDITION_ATTRS.reduce((m, a) => m + v.attrs[a], 0), 0)
  const [lo, max] = EXPEDITION_CHANCE_RANGE
  const hi = target.kind === 'ruin' ? RUIN_MAX_CHANCE : max
  const bonus = members.reduce((n, v) => n + bonuses(v).reduce((m, b) => m + (b.expedition ?? 0), 0), 0)
  const base = target.kind === 'ruin' ? RUIN_BASE_CHANCE : EXPEDITION_BASE_CHANCE
  const raw = base - EXPEDITION_CHANCE_PER_DISTANCE * site.distance + EXPEDITION_CHANCE_PER_POINT * points + bonus
  return {
    site,
    duration: EXPEDITION_SECONDS_PER_DISTANCE * site.distance,
    cost: { food: EXPEDITION_FOOD_PER_MEMBER_DISTANCE * site.distance * party.length, gold: EXPEDITION_GOLD_PER_DISTANCE * site.distance },
    chance: Math.min(hi, Math.max(lo, raw)),
  }
}

export const sendExpedition = action((g, party: number[], target: ExpeditionTarget) => {
  const plan = planExpedition(g, party, target)
  pay(g, plan.cost)
  const id = g.nextId++
  g.expeditions.push({ id, party, goal: target.kind, site: plan.site.id, duration: plan.duration, progress: 0, chance: plan.chance })
  for (const v of party) villager(g, v).activity = { kind: 'expedition', expedition: id }
})

export const recallExpedition = action((g, id: number) => {
  const x = g.expeditions.find((e) => e.id === id)
  if (!x) throw new Error('That Expedition is already home')
  endExpedition(g, x)
})

export const outpostCost = (level: number): Bag =>
  Object.fromEntries(Object.entries(OUTPOST_COST).map(([r, n]) => [r, Math.round(n * UPGRADE_SCALE ** level)]))

export const buildOutpost = action((g, siteId: number) => {
  const site = findSite(g, siteId)
  if (site.kind !== 'deposit') throw new Error('Only a Resource Deposit can hold an Outpost')
  if (site.discovery !== 'reached') throw new Error('Reach this Site first')
  if (site.outpost) throw new Error('There is already an Outpost here')
  pay(g, outpostCost(0))
  site.outpost = { level: 1 }
})

export const outpostSlots = (site: Site) => OUTPOST_SLOTS * (site.outpost?.level ?? 0)
export const outpostWorkers = (g: Game, site: number) => g.villagers.filter((v) => v.activity?.kind === 'outpost' && v.activity.site === site)

// An Outpost, like a Building, can't outgrow the Town Hall.
export const outpostMaxLevel = (g: Game) => g.plots[0]!.level
const findSite = (g: Game, id: number) => {
  const site = g.worldMap.find((s) => s.id === id)
  if (!site) throw new Error('No such Site')
  return site
}

export const upgradeOutpost = action((g, siteId: number) => {
  const outpost = findSite(g, siteId).outpost
  if (!outpost) throw new Error('There is no Outpost here')
  if (outpost.level >= outpostMaxLevel(g)) throw new Error('Upgrade the Town Hall first')
  pay(g, outpostCost(outpost.level))
  outpost.level++
})

export const assignOutpost = action((g, villagerId: number, siteId: number) => {
  const v = villager(g, villagerId)
  const site = findSite(g, siteId)
  if (!site.outpost) throw new Error('There is no Outpost here')
  rejectIfCommitted(g, v)
  const staff = outpostWorkers(g, siteId)
  if (!staff.includes(v) && staff.length >= outpostSlots(site)) throw new Error('No free slots')
  v.activity = { kind: 'outpost', site: siteId, progress: 0 }
})

/** The rates a Foreign City trades at. Its place among the map's cities picks its entry in FOREIGN_CITIES. */
export function foreignCity(g: Game, siteId: number) {
  const cities = g.worldMap.filter((s) => s.kind === 'city')
  return FOREIGN_CITIES[cities.findIndex((s) => s.id === siteId)]
}
/** True while a Trade Route waits at the end of its cycle for the Stockpile to cover its load. */
export function tradeStalled(g: Game, v: Villager) {
  const route = v.activity
  return route?.kind === 'trade' && !canAfford(g, { [route.give]: foreignCity(g, route.site).buys[route.give] })
}
/** Villagers who could be sent to work a Trade Route now (one on a Production Job leaves it to go). */
export const canTrade = (g: Game, v: Villager) => !busyReason(g, v) && v.activity?.kind !== 'trade'

export const openTradeRoute = action((g, villagerId: number, siteId: number, give: Res, get: Res) => {
  const v = villager(g, villagerId)
  const site = findSite(g, siteId)
  if (site.kind !== 'city') throw new Error('Only a Foreign City can be traded with')
  if (site.discovery !== 'reached') throw new Error('Reach this Foreign City first')
  const city = foreignCity(g, siteId)
  if (give === get) throw new Error('Choose two different goods')
  if (!city.buys[give]) throw new Error(`${city.name} doesn't buy ${RES_NAME[give]}`)
  if (!city.sells[get]) throw new Error(`${city.name} doesn't sell ${RES_NAME[get]}`)
  rejectIfCommitted(g, v)
  v.activity = { kind: 'trade', site: siteId, give, get, progress: 0 }
})

export const tradeRoutes = (g: Game, site: number) => g.villagers.filter((v) => v.activity?.kind === 'trade' && v.activity.site === site)

export const closeTradeRoute = action((g, villagerId: number) => {
  const v = villager(g, villagerId)
  if (v.activity?.kind !== 'trade') throw new Error(`${v.name} has no Trade Route`)
  v.activity = undefined
})

export const build = action((g, plot: number, type: BuildingType) => {
  const def = BUILDINGS[type]
  if (g.plots[plot]) throw new Error('That plot is taken')
  if (def.chapter > g.chapter) throw new Error(`${def.name} is not unlocked yet`)
  if (def.unique && has(g, type)) throw new Error(`You can only have one ${def.name}`)
  pay(g, buildCost(type, 0))
  g.plots[plot] = { type, level: 1 }
})

export const demolish = action((g, plot: number) => {
  const p = g.plots[plot]
  if (!p) throw new Error('That plot is empty')
  if (p.type === 'townhall') throw new Error("The Town Hall can't be demolished")
  for (const v of workers(g, plot)) rejectIfCommitted(g, v)
  if (housing(g) - plotHousing(p) < g.villagers.length) throw new Error('Not enough Housing for your Villagers')
  for (const [r, n] of Object.entries(demolishRefund(p))) g.stock[r as Res] += n
  for (const v of workers(g, plot)) v.activity = undefined
  g.plots[plot] = null
})

export const upgrade = action((g, plot: number) => {
  const p = g.plots[plot]!
  if (p.level >= maxLevel(g, p.type)) throw new Error(p.type === 'townhall' ? 'Already at max level' : 'Upgrade the Town Hall first')
  pay(g, buildCost(p.type, p.level))
  p.level++
})

export const assign = action((g, id: number, plot: number, jobId: string) => {
  const v = villager(g, id)
  const p = g.plots[plot]!
  const job = jobsFor(p).find((j) => j.id === jobId)
  if (!job) throw new Error('Job not available')
  rejectIfCommitted(g, v)
  if (currentJob(v)?.plot !== plot && workers(g, plot).length >= slots(p)) throw new Error('No free slots')
  if (job.kind === 'contract' && job.cost) pay(g, job.cost)
  v.activity = { kind: 'job', plot, job: jobId, progress: 0 }
})

export const unassign = action((g, id: number) => {
  const v = villager(g, id)
  rejectIfCommitted(g, v)
  v.activity = undefined
})

export const hire = action((g, index: number) => {
  if (g.villagers.length >= housing(g)) throw new Error('Not enough Housing')
  pay(g, { gold: hireCost(g) })
  g.villagers.push(...g.recruits.splice(index, 1))
})

export const reroll = action((g) => {
  pay(g, { gold: REROLL_COST })
  g.recruits = [0, 1, 2].map(() => makeVillager(g))
  g.tavernRefreshAt = g.time + TAVERN_REFRESH
})

export const raise = action((g, id: number, attr: Attr) => {
  const v = villager(g, id)
  if (v.points < 1) throw new Error('No Attribute points to spend')
  v.points--
  v.attrs[attr]++
})

export const specialize = action((g, id: number, spec: SpecId) => {
  const v = villager(g, id)
  if (!canSpecialize(g, v, spec)) throw new Error(`${v.name} can't become a ${SPECS[spec].name}`)
  v.spec = spec
})
