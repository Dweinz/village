import { expect, test } from 'vitest'
import { BUILDINGS, INJURY_SECONDS, MAX_BUILDING_LEVEL, RARE_MATERIALS, REPUTATION_TIERS, SITE_REVEAL_DISTANCE, isRare, type Bag, type Res, type SiteKind } from './data'
import {
  CHAPTERS, WORLD_MAP_CHAPTER, advance, assign, assignOutpost, build, buildCost, buildOutpost, demolish, foreignCity, newGame, openTradeRoute, planExpedition,
  sendExpedition, upgrade, type ExpeditionTarget, type Game, type GameEvent,
} from './game'
import { rich } from './test-helpers'
import type { Discovery } from './world'

const rareIn = (bag: Bag) => Object.keys(bag).some((r) => isRare(r as Res))

test('the v2 Chapters follow Beyond the Walls, in order', () => {
  expect(CHAPTERS.slice(WORLD_MAP_CHAPTER - 1).map((c) => c.name)).toEqual([
    'Beyond the Walls', 'The Wider World', 'Riches of the Land', 'Friends Abroad', 'Secrets of the Ruins',
  ])
  const ids = CHAPTERS.flatMap((c) => c.objectives.map((o) => o.id))
  expect(new Set(ids).size).toBe(ids.length)
})

test("a later Chapter's Objectives don't count until the Chapters before it are complete", () => {
  const g = rich(newGame(1))
  g.chapter = WORLD_MAP_CHAPTER
  g.worldMap.find((s) => s.kind === 'deposit')!.outpost = { level: 1 } // what Riches of the Land asks for
  const after = advance(g, 1)
  expect(after.chapter).toBe(WORLD_MAP_CHAPTER)
  expect(after.done).not.toContain('outpost')
})

test("every Building's last upgrade also costs Rare Materials, and earlier ones don't", () => {
  for (const type of Object.keys(BUILDINGS) as (keyof typeof BUILDINGS)[]) {
    expect(rareIn(buildCost(type, MAX_BUILDING_LEVEL - 1)), type).toBe(true)
    for (let level = 0; level < MAX_BUILDING_LEVEL - 1; level++) expect(rareIn(buildCost(type, level)), `${type} ${level}`).toBe(false)
  }
})

test('demolishing a Building at its last level gives back no Rare Materials', () => {
  const g = rich(newGame(1))
  g.plots[0]!.level = MAX_BUILDING_LEVEL
  g.plots[1] = { type: 'farm', level: MAX_BUILDING_LEVEL }
  const after = demolish(g, 1)
  expect(after.stock.spice).toBe(g.stock.spice)
  expect(after.stock.wood).toBeGreaterThan(g.stock.wood)
})

test('the Town Hall cannot reach its last level without the Rare Materials', () => {
  const g = rich(newGame(1))
  g.plots[0]!.level = MAX_BUILDING_LEVEL - 1
  g.stock.crystal = 0
  expect(() => upgrade(g, 0)).toThrow('Not enough resources')
})

test('some Contracts cost Rare Materials up front', () => {
  const contracts = Object.values(BUILDINGS).flatMap((b) => b.jobs).filter((j) => j.kind === 'contract' && j.cost && rareIn(j.cost))
  expect(contracts.length).toBeGreaterThanOrEqual(1)

  const g = rich(newGame(1))
  g.plots[3] = { type: 'tavern', level: 3 }
  const banquet = BUILDINGS.tavern.jobs.find((j) => j.cost && rareIn(j.cost))!
  const started = assign(g, 1, 3, banquet.id)
  for (const [r, n] of Object.entries(banquet.cost!)) expect(started.stock[r as Res]).toBe(g.stock[r as Res] - n)
  g.stock.spice = 0
  expect(() => assign(g, 1, 3, banquet.id)).toThrow('Not enough resources')
})

// --- A seeded playthrough of every v2 Chapter, through public actions and advance ---

/** Sends the whole party at `target` and waits for it to come home, until `done` holds; Injured members are waited out. */
function expeditionUntil(g: Game, target: () => ExpeditionTarget, done: (g: Game) => boolean, ev: GameEvent[]): Game {
  for (let tries = 0; tries < 40 && !done(g); tries++) {
    const party = g.villagers.filter((v) => !v.activity || v.activity.kind === 'job').map((v) => v.id).slice(0, 3)
    if (party.length === 0) { g = advance(g, INJURY_SECONDS, ev); continue }
    const plan = planExpedition(g, party, target())
    g = advance(sendExpedition(g, party, target()), plan.duration + 1, ev)
  }
  expect(done(g)).toBe(true)
  return g
}
const hiddenSites = (g: Game) => g.worldMap.filter((s) => s.discovery === 'hidden').length
/** Explores until one more Site comes out of the fog. */
const exploreOnce = (g: Game, ev: GameEvent[]) => { const hidden = hiddenSites(g); return expeditionUntil(g, () => ({ kind: 'explore' }), (x) => hiddenSites(x) < hidden, ev) }
const nearest = (g: Game, kind: SiteKind, discovery: Discovery) =>
  g.worldMap.filter((s) => s.kind === kind && s.discovery === discovery).sort((a, b) => a.distance - b.distance)[0]

test('a seeded game plays through every v2 Chapter to the end of content', () => {
  // Setup: a game that has finished v1, with plenty of basic goods but no Rare Materials, so every Rare Material spent
  // is earned in play, and with strong, high-level Villagers so the playthrough doesn't take hours of grinding.
  let g = rich(newGame(7))
  for (const r of RARE_MATERIALS) g.stock[r] = 0
  g.chapter = WORLD_MAP_CHAPTER - 1
  for (const v of g.villagers) Object.assign(v, { level: 20, attrs: { str: 15, dex: 5, int: 5, cha: 15, end: 15, per: 15 }, traits: [] })
  const ev: GameEvent[] = []
  const chapters = () => ev.filter((e) => e.kind === 'chapter').map((e) => (e as { chapter: number }).chapter)

  // Beyond the Walls: Town Hall 4, a Mine, 50 Ore.
  for (let i = 0; i < 3; i++) g = upgrade(g, 0)
  g = advance(build(g, 3, 'mine'), 1, ev)
  expect(g.chapter).toBe(WORLD_MAP_CHAPTER)

  // The Wider World: reveal a Site in the fog, then reach one.
  g = expeditionUntil(g, () => ({ kind: 'explore' }), (x) => x.worldMap.some((s) => s.distance > SITE_REVEAL_DISTANCE && s.discovery !== 'hidden'), ev)
  g = expeditionUntil(g, () => ({ kind: 'reach', site: nearest(g, 'deposit', 'revealed').id }), (x) => x.worldMap.some((s) => s.kind === 'deposit' && s.discovery === 'reached'), ev)
  g = advance(g, 1, ev)
  expect(g.chapter).toBe(WORLD_MAP_CHAPTER + 1)

  // Riches of the Land: build an Outpost and work it until 10 of its Rare Material are in the Stockpile.
  const deposit = nearest(g, 'deposit', 'reached')
  g = assignOutpost(buildOutpost(g, deposit.id), 1, deposit.id)
  for (let i = 0; i < 60 && g.chapter === WORLD_MAP_CHAPTER + 1; i++) g = advance(g, 60, ev)
  expect(g.stock[deposit.material!]).toBeGreaterThanOrEqual(10)
  expect(g.chapter).toBe(WORLD_MAP_CHAPTER + 2)

  // Friends Abroad: reach a Foreign City, trade with it, and become its Friend.
  while (!nearest(g, 'city', 'revealed') && !nearest(g, 'city', 'reached')) g = exploreOnce(g, ev)
  if (!nearest(g, 'city', 'reached')) {
    g = expeditionUntil(g, () => ({ kind: 'reach', site: nearest(g, 'city', 'revealed').id }), (x) => !!nearest(x, 'city', 'reached'), ev)
  }
  const city = nearest(g, 'city', 'reached')
  const { buys, sells } = foreignCity(g, city.id)
  const give = (Object.keys(buys) as Res[]).find((r) => r !== 'food')!
  const get = (Object.keys(sells) as Res[]).find((r) => r !== give)!
  g = openTradeRoute(g, 2, city.id, give, get)
  for (let i = 0; i < 60 && g.chapter === WORLD_MAP_CHAPTER + 2; i++) g = advance(g, 60, ev)
  expect(g.worldMap.find((s) => s.id === city.id)!.reputation).toBeGreaterThanOrEqual(REPUTATION_TIERS[1].reputation)
  expect(g.chapter).toBe(WORLD_MAP_CHAPTER + 3)

  // Secrets of the Ruins: clear a Ruin, then raise the Town Hall to its last level with Rare Materials.
  while (!nearest(g, 'ruin', 'revealed') && !nearest(g, 'ruin', 'reached')) g = exploreOnce(g, ev)
  if (!nearest(g, 'ruin', 'reached')) {
    g = expeditionUntil(g, () => ({ kind: 'reach', site: nearest(g, 'ruin', 'revealed').id }), (x) => !!nearest(x, 'ruin', 'reached'), ev)
  }
  const ruin = nearest(g, 'ruin', 'reached')
  g = expeditionUntil(g, () => ({ kind: 'ruin', site: ruin.id }), (x) => !!x.worldMap.find((s) => s.id === ruin.id)!.cleared, ev)
  g = advance(upgrade(g, 0), 1, ev)

  expect(g.chapter).toBe(CHAPTERS.length)
  expect(CHAPTERS[g.chapter]).toBeUndefined()
  expect(chapters()).toEqual(Array.from({ length: CHAPTERS.length - WORLD_MAP_CHAPTER + 1 }, (_, i) => WORLD_MAP_CHAPTER + i))
})
