// Headless simulation (ADR 0001). Pure data in, pure data out: no DOM, no rendering, no wall clock.
import {
  ATTRS, BUILDINGS, EXPEDITION_ATTRS, EXPEDITION_BASE_CHANCE, EXPEDITION_CHANCE_PER_DISTANCE, EXPEDITION_CHANCE_PER_POINT,
  EXPEDITION_CHANCE_RANGE, EXPEDITION_FOOD_PER_MEMBER_DISTANCE, EXPEDITION_GOLD_PER_DISTANCE, EXPEDITION_MAX_PARTY,
  EXPEDITION_SECONDS_PER_DISTANCE, EXPEDITION_XP_PER_DISTANCE, MAX_BUILDING_LEVEL, NAMES, SPECS, SPEC_LEVEL, TRAITS,
  TRAIT_IDS, UPGRADE_SCALE, type Attr, type Bag, type Bonus, type BuildingType, type JobDef, type Res, type SpecId, type TraitId,
} from './data'
import { mulberry32 } from './random'
import { generateWorldMap, type Site } from './world'

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

// The one thing a Villager is doing. Trade Routes and Injured become further kinds (v2).
export type Activity =
  | { kind: 'job'; plot: number; job: string; progress: number }
  | { kind: 'expedition'; expedition: number }

// Reach a revealed Site, or explore: reveal the nearest hidden one.
export type ExpeditionTarget = { kind: 'reach'; site: number } | { kind: 'explore' }

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
const applies = (b: Bonus, type: BuildingType) => !b.buildings || b.buildings.includes(type)
const mult = (v: Villager, type: BuildingType, key: 'xp' | 'gold') =>
  bonuses(v).reduce((m, b) => (applies(b, type) ? m * (1 + (b[key] ?? 0)) : m), 1)

export function speed(g: Game, v: Villager, type: BuildingType, job: JobDef) {
  let s = 1 + 0.04 * Object.entries(job.attrs).reduce((n, [a, w]) => n + v.attrs[a as Attr] * w, 0)
  for (const b of bonuses(v)) if (applies(b, type)) s *= 1 + (b.speed ?? 0)
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
const xpMult = (v: Villager) => bonuses(v).reduce((m, b) => (b.buildings ? m : m * (1 + (b.xp ?? 0))), 1)

/** What a Villager is doing, in words for the player. */
export function activityName(g: Game, v: Villager) {
  if (v.activity?.kind === 'expedition') return 'Away on an Expedition'
  return jobOf(g, v)?.name ?? 'Idle'
}
// Free to go on an Expedition: not away already, not mid-Contract. A Production Job is left behind.
export const canJoinExpedition = (g: Game, v: Villager) => v.activity?.kind !== 'expedition' && jobOf(g, v)?.kind !== 'contract'

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
    time: 0, seed, stock: { gold: 30, wood: 20, stone: 0, food: 30, ore: 0 },
    plots: Array(PLOT_COUNT).fill(null), villagers: [], recruits: [], tavernRefreshAt: 0,
    chapter: 0, done: [], starving: false, nextId: 1, worldMap: generateWorldMap(seed), expeditions: [],
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

  for (const x of [...g.expeditions]) {
    x.progress = Math.min(x.duration, x.progress + s)
    if (x.progress < x.duration) continue
    const party = x.party.map((id) => villager(g, id))
    const names = party.map((v) => v.name)
    const site = siteById(g, x.site)
    endExpedition(g, x)
    if (rand(g) < x.chance) {
      if (x.goal === 'reach') {
        site.discovery = 'reached'
        ev.push({ kind: 'expeditionSucceeded', party: names, goal: x.goal, site: site.kind })
      } else {
        site.discovery = 'revealed'
        ev.push({ kind: 'siteRevealed', party: names, id: site.id, site: site.kind, distance: site.distance })
      }
      for (const v of party) addXp(v, EXPEDITION_XP_PER_DISTANCE * site.distance * xpMult(v), ev)
    } else {
      ev.push({ kind: 'expeditionFailed', party: names })
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
// A Contract can't be abandoned or swapped (its cost is already paid), and a Villager away can't be called on.
const rejectIfCommitted = (g: Game, v: Villager) => {
  if (jobOf(g, v)?.kind === 'contract') throw new Error(`${v.name} is busy with a Contract`)
  if (v.activity?.kind === 'expedition') throw new Error(`${v.name} is away on an Expedition`)
}

// The nearest hidden Site that no Expedition is already exploring.
const nextToExplore = (g: Game) => g.worldMap
  .filter((s) => s.discovery === 'hidden' && !g.expeditions.some((x) => x.goal === 'explore' && x.site === s.id))
  .sort((a, b) => a.distance - b.distance || a.id - b.id)[0]

/** What an Expedition would take and risk. Throws a player-facing Error if the party or target is invalid. */
export function planExpedition(g: Game, party: number[], target: ExpeditionTarget): ExpeditionPlan {
  if (party.length === 0) throw new Error('Choose at least one Villager')
  if (party.length > EXPEDITION_MAX_PARTY || new Set(party).size < party.length) throw new Error(`A party is at most ${EXPEDITION_MAX_PARTY} Villagers`)
  const site = target.kind === 'reach' ? g.worldMap.find((s) => s.id === target.site) : nextToExplore(g)
  if (!site) throw new Error(target.kind === 'reach' ? 'No such Site' : 'Nothing left to explore')
  if (site.discovery === 'hidden' && target.kind === 'reach') throw new Error('That Site is still hidden in the fog')
  if (site.discovery === 'reached' && target.kind === 'reach') throw new Error('Already reached')
  if (target.kind === 'reach' && g.expeditions.some((x) => x.goal === 'reach' && x.site === site.id)) throw new Error('An Expedition is already on its way there')
  if (party.some((id) => !g.villagers.some((v) => v.id === id))) throw new Error('No such Villager')
  const members = party.map((id) => villager(g, id))
  for (const v of members) rejectIfCommitted(g, v) // a Villager on a Production Job leaves it to go
  const points = members.reduce((n, v) => n + EXPEDITION_ATTRS.reduce((m, a) => m + v.attrs[a], 0), 0)
  const [lo, hi] = EXPEDITION_CHANCE_RANGE
  const bonus = members.reduce((n, v) => n + bonuses(v).reduce((m, b) => m + (b.expedition ?? 0), 0), 0)
  const raw = EXPEDITION_BASE_CHANCE - EXPEDITION_CHANCE_PER_DISTANCE * site.distance + EXPEDITION_CHANCE_PER_POINT * points + bonus
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
