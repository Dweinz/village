import { expect, test } from 'vitest'
import {
  EXPEDITION_XP_PER_DISTANCE, RENOWN_PER_REPUTATION_TIER, RENOWN_PER_RUIN_CLEARED, RENOWN_PER_SITE_REVEALED, REPUTATION_TIERS, TALENT_LINKS, TALENTS, TRADE_JOB, type Res, type TalentId,
} from './data'
import { advance, assign, build, findJob, foreignCity, newGame, openTradeRoute, planExpedition, speed, renownToNext, respecCost, respecTalents, ruinXp, sendExpedition, takeTalent, type Game, type GameEvent } from './game'
import { rich, taking } from './test-helpers'

// All the Renown ever earned, across ranks.
const totalRenown = (g: Game) => Array.from({ length: g.renownRank }, (_, r) => renownToNext(r)).reduce((a, b) => a + b, g.renown)
// A rich game whose Villagers have no Traits, so XP is exactly what the Job or Expedition pays.
const plainGame = () => {
  const g = rich(newGame(1))
  for (const v of g.villagers) { v.traits = []; v.level = 20 }
  return g
}
// Send the whole Party out with success guaranteed, and bring them home.
const succeed = (g: Game, target: Parameters<typeof sendExpedition>[2]) => {
  const out = sendExpedition(g, [1, 2, 3], target)
  out.expeditions[0].chance = 1
  return advance(out, out.expeditions[0].duration)
}

test('every bit of XP a Villager earns adds the same amount of Renown', () => {
  const g = assign(newGame(1), 1, 2, 'chop') // 2 XP per cycle, short of a level-up after 30s
  const after = advance(g, 30)
  expect(after.villagers[0].level).toBe(1)
  expect(after.villagers[0].xp).toBeGreaterThan(0)
  expect(after.renown).toBe(after.villagers[0].xp)
})

test('each Renown rank grants a Talent Point and says so, carrying the extra Renown over', () => {
  const g = assign(newGame(1), 1, 2, 'chop')
  g.renown = renownToNext(0) - 1
  const ev: GameEvent[] = []
  const after = advance(g, 30, ev)
  expect(after.renownRank).toBe(1)
  expect(after.talentPoints).toBe(1)
  expect(after.renown).toBe(after.villagers[0].xp - 1)
  expect(ev.filter((e) => e.kind === 'renownRank')).toEqual([{ kind: 'renownRank', rank: 1 }])
})

test('Renown ranks cost more each time', () => {
  expect(renownToNext(1)).toBeGreaterThan(renownToNext(0))
})

test('revealing a Site earns flat Renown on top of the Party\'s XP', () => {
  const g = plainGame()
  const after = succeed(g, { kind: 'explore' })
  const site = after.worldMap.find((s) => s.id === g.worldMap.filter((x) => x.discovery === 'hidden').sort((a, b) => a.distance - b.distance || a.id - b.id)[0].id)!
  expect(site.discovery).toBe('revealed')
  expect(totalRenown(after)).toBe(3 * EXPEDITION_XP_PER_DISTANCE * site.distance + RENOWN_PER_SITE_REVEALED)
})

test('clearing a Ruin earns flat Renown on top of the Party\'s XP', () => {
  const g = plainGame()
  const ruin = g.worldMap.find((s) => s.kind === 'ruin')!
  ruin.discovery = 'reached'
  const after = succeed(g, { kind: 'ruin', site: ruin.id })
  expect(after.worldMap.find((s) => s.id === ruin.id)!.cleared).toBe(true)
  expect(totalRenown(after)).toBe(3 * ruinXp(ruin) + RENOWN_PER_RUIN_CLEARED)
})

test('a Foreign City reaching a new Reputation Tier earns flat Renown', () => {
  const g = plainGame()
  const city = g.worldMap.find((s) => s.kind === 'city')!
  city.discovery = 'reached'
  city.reputation = REPUTATION_TIERS[1].reputation - 1
  const { buys, sells } = foreignCity(g, city.id)
  const give = (Object.keys(buys) as Res[]).find((r) => r !== 'food')!
  const get = (Object.keys(sells) as Res[]).find((r) => r !== give)!
  const ev: GameEvent[] = []
  const after = advance(openTradeRoute(g, 1, city.id, give, get), TRADE_JOB.duration, ev)
  expect(ev.filter((e) => e.kind === 'traded')).toHaveLength(1)
  expect(totalRenown(after)).toBe(TRADE_JOB.xp + RENOWN_PER_REPUTATION_TIER)
})

test('completing a Chapter grants a bonus Talent Point', () => {
  const g = build(rich(newGame(1)), 3, 'house')
  g.plots[0]!.level = 2 // every Objective of the first Chapter met
  const ev: GameEvent[] = []
  const after = advance(g, 1, ev)
  expect(ev).toContainEqual({ kind: 'chapter', chapter: 1 })
  expect(after.renownRank).toBe(0)
  expect(after.talentPoints).toBe(1)
})

// The starter web, read from data so it can grow without breaking these tests.
const neighbours = (id: string) => TALENT_LINKS.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []))
const ids = Object.keys(TALENTS) as TalentId[]
const open = ids.find((id) => TALENTS[id].chapter === 0 && neighbours(id).includes('centre'))!
const beyond = ids.find((id) => TALENTS[id].chapter === 0 && !neighbours(id).includes('centre') && neighbours(id).includes(open))!
const locked = ids.find((id) => TALENTS[id].chapter > 0)!
const withPoints = (n: number) => { const g = newGame(1); g.talentPoints = n; return g }

test('a Talent next to the centre can be taken for one Talent Point', () => {
  const after = takeTalent(withPoints(2), open)
  expect(after.talents).toEqual([open])
  expect(after.talentPoints).toBe(1)
})

test('a Talent can only be taken once it connects to the centre or a Talent already taken', () => {
  expect(() => takeTalent(withPoints(2), beyond)).toThrow(`${TALENTS[beyond].name} doesn't connect to a Talent you have`)
  expect(takeTalent(takeTalent(withPoints(2), open), beyond).talents).toEqual([open, beyond])
})

test('a Talent costs a Talent Point and is taken only once', () => {
  expect(() => takeTalent(withPoints(0), open)).toThrow('No Talent Points to spend')
  expect(() => takeTalent(takeTalent(withPoints(2), open), open)).toThrow(`You already have ${TALENTS[open].name}`)
})

test('a Talent for a later Chapter stays locked until the player reaches it', () => {
  const g = withPoints(20)
  g.talents = ids.filter((id) => id !== locked) // every route to it taken
  expect(() => takeTalent(g, locked)).toThrow(`${TALENTS[locked].name} requires Chapter ${TALENTS[locked].chapter + 1}`)
  g.chapter = TALENTS[locked].chapter
  expect(takeTalent(g, locked).talents).toContain(locked)
})

test('a speed Talent makes every Villager work faster', () => {
  const plain = assign(newGame(1), 1, 2, 'chop')
  const skilled = structuredClone(plain)
  skilled.talents = ['diligence'] // +5% speed everywhere
  const wood = (g: Game) => advance(g, 600).stock.wood
  expect(wood(skilled)).toBeGreaterThan(wood(plain))
})

test('an Expedition Talent shortens every journey', () => {
  const plain = newGame(1)
  const skilled = structuredClone(plain)
  skilled.talents = ['trailcraft'] // Expeditions travel 10% faster
  const duration = (g: Game) => planExpedition(g, [1], { kind: 'explore' }).duration
  expect(duration(skilled)).toBeCloseTo(duration(plain) / 1.1)
  const home = advance(sendExpedition(rich(skilled), [1], { kind: 'explore' }), duration(skilled))
  expect(home.expeditions).toHaveLength(0) // back before an untalented Party would be
  expect(duration(skilled)).toBeLessThan(duration(plain))
})

test('Talent bonuses add together, then multiply with Traits (ADR 0003)', () => {
  const g = newGame(1)
  const v = g.villagers[0]
  v.traits = []
  const chop = findJob('lumbercamp', 'chop')
  const base = speed(g, v, 'lumbercamp', chop)
  v.traits = ['lumberjack'] // +50% at Lumber Camps
  g.talents = ['diligence', 'green_fields'] // +5% everywhere, +10% at Lumber Camps
  expect(speed(g, v, 'lumbercamp', chop)).toBeCloseTo(base * 1.15 * 1.5, 6) // multiplying would give 1.155
})

test('a fresh game with its three Villagers at work earns its first Talent Point within 15 minutes, not in the first 5', () => {
  const g = assign(assign(assign(newGame(1), 1, 1, 'fields'), 2, 2, 'chop'), 3, 0, 'taxes')
  expect(advance(g, 5 * 60).renownRank).toBe(0)
  expect(advance(g, 15 * 60).renownRank).toBe(1)
})

test('on a Trade Route, speed and trade Talents add together too', () => {
  const g = newGame(1)
  const v = g.villagers[0]
  v.traits = []
  const base = speed(g, v, 'trade', TRADE_JOB)
  g.talents = ['diligence', 'haggling'] // +5% everywhere, +15% on Trade Routes
  expect(speed(g, v, 'trade', TRADE_JOB)).toBeCloseTo(base * 1.2, 6)
})

test('a respec costs 100 Gold doubled for every respec before it, clears the Talents and gives the points back', () => {
  const g = taking(newGame(1), 'diligence', 'haggling')
  g.talentPoints = 1
  g.stock.gold = 1000
  expect(respecCost(g)).toBe(100)
  const once = respecTalents(g)
  expect(once.stock.gold).toBe(900)
  expect(once.talents).toEqual([])
  expect(once.talentPoints).toBe(3)
  expect(once.respecs).toBe(1)
  expect(respecCost(once)).toBe(200)
  expect(respecTalents(once).stock.gold).toBe(700)
})

test('a respec fails when the player cannot afford it, and its bonuses stop at once when it works', () => {
  const g = taking(newGame(1), 'diligence')
  g.villagers[0].traits = []
  g.stock.gold = 99
  expect(() => respecTalents(g)).toThrow(/100 Gold/)
  g.stock.gold = 100
  const v = g.villagers[0]
  const job = findJob('lumbercamp', 'chop')
  expect(speed(respecTalents(g), v, 'lumbercamp', job)).toBeLessThan(speed(g, v, 'lumbercamp', job))
})
