import { expect, test } from 'vitest'
import { INJURY_SECONDS } from './data'
import { advance, newGame, planExpedition, ruinLevel, ruinReward, sendExpedition, siteById, type Game, type GameEvent } from './game'
import { rich } from './test-helpers'

// A rich game with a reached Ruin and three Villagers strong enough to raid it.
const ruinGame = (seed = 1, level = 20) => {
  const g = rich(newGame(seed))
  const ruin = g.worldMap.find((s) => s.kind === 'ruin')!
  ruin.discovery = 'reached'
  for (const v of g.villagers) v.level = level
  return { g, ruin }
}
const raid = (g: Game, site: number) => sendExpedition(g, [1, 2, 3], { kind: 'ruin', site })

test('a Ruin Expedition targets only a reached, uncleared Ruin, with a Party all at its required level', () => {
  const { g, ruin } = ruinGame()
  expect(ruinLevel(ruin)).toBeGreaterThan(1)
  const revealed = structuredClone(g)
  siteById(revealed, ruin.id).discovery = 'revealed'
  expect(() => raid(revealed, ruin.id)).toThrow('Reach this Ruin first')
  const deposit = g.worldMap.find((s) => s.kind === 'deposit')!
  deposit.discovery = 'reached'
  expect(() => raid(g, deposit.id)).toThrow('That Site is not a Ruin')
  expect(() => raid(g, 999)).toThrow('No such Site')

  const weak = structuredClone(g)
  weak.villagers[1].level = ruinLevel(ruin) - 1
  expect(() => raid(weak, ruin.id)).toThrow(`Every member of the Party must be level ${ruinLevel(ruin)} or higher`)
  weak.villagers[1].level = ruinLevel(ruin)
  expect(() => raid(weak, ruin.id)).not.toThrow()

  const inside = raid(g, ruin.id)
  inside.villagers.push({ ...inside.villagers[0], id: 99, activity: undefined })
  expect(() => sendExpedition(inside, [99], { kind: 'ruin', site: ruin.id })).toThrow('A Party is already inside this Ruin')

  const cleared = structuredClone(g)
  siteById(cleared, ruin.id).cleared = true
  expect(() => raid(cleared, ruin.id)).toThrow('This Ruin has already been cleared')
})

test('a Ruin Expedition is less likely to succeed than a normal one to the same Site, however strong the Party', () => {
  for (const points of [1, 30]) {
    const { g, ruin } = ruinGame(1, 20)
    for (const v of g.villagers) v.attrs = { str: points, dex: 1, int: 1, cha: 1, end: points, per: points }
    const ruinChance = planExpedition(g, [1, 2, 3], { kind: 'ruin', site: ruin.id }).chance
    siteById(g, ruin.id).discovery = 'revealed'
    const reachChance = planExpedition(g, [1, 2, 3], { kind: 'reach', site: ruin.id }).chance
    expect(ruinChance).toBeLessThan(reachChance)
  }
})

// Raids the first Ruin with the whole Party on many seeds and plays until they are back.
const raids = Array.from({ length: 120 }, (_, i) => {
  const { g, ruin } = ruinGame(i + 1)
  const sent = raid(g, ruin.id)
  const ev: GameEvent[] = []
  return { before: g, after: advance(sent, sent.expeditions[0].duration, ev), ev, ruin }
})
const won = raids.filter((r) => r.ev.some((e) => e.kind === 'ruinCleared'))
const lost = raids.filter((r) => r.ev.some((e) => e.kind === 'expeditionFailed'))

test('clearing a Ruin pays its reward and lots of XP, marks it cleared and announces it; it cannot be raided again', () => {
  expect(won.length).toBeGreaterThan(5)
  for (const { before, after, ev, ruin } of won) {
    const reward = ruinReward(ruin)
    expect(reward.gold).toBeGreaterThan(0)
    expect(Object.keys(reward).some((r) => r === 'crystal' || r === 'spice' || r === 'silk')).toBe(true)
    const cost = planExpedition(before, [1, 2, 3], { kind: 'ruin', site: ruin.id }).cost
    expect(after.stock.gold - before.stock.gold).toBeCloseTo(reward.gold! - cost.gold!) // nothing else earns Gold here
    for (const r of ['crystal', 'spice', 'silk'] as const) expect(after.stock[r] - before.stock[r]).toBeCloseTo(reward[r] ?? 0)
    expect(siteById(after, ruin.id).cleared).toBe(true)
    expect(ev).toContainEqual({ kind: 'ruinCleared', party: before.villagers.map((v) => v.name), reward })
    expect(after.villagers.every((v) => v.level > 20 || v.xp > 0)).toBe(true)
    expect(() => raid(after, ruin.id)).toThrow('This Ruin has already been cleared')
  }
})

test('a failed Ruin Expedition leaves it uncleared to try again, and Injures more often than a normal one', () => {
  expect(lost.length).toBeGreaterThan(5)
  for (const { after, ruin } of lost) expect(siteById(after, ruin.id).cleared).toBeFalsy()

  const { after: hurt, ruin } = lost[0]
  const healed = advance(hurt, INJURY_SECONDS + 1)
  expect(() => raid(healed, ruin.id)).not.toThrow()

  const injuryRate = (outcomes: { after: Game }[]) =>
    outcomes.flatMap(({ after }) => after.villagers).filter((v) => v.activity?.kind === 'injured').length / (outcomes.length * 3)
  const normalFailures = Array.from({ length: 200 }, (_, i) => {
    const sent = sendExpedition(rich(newGame(i + 1)), [1, 2, 3], { kind: 'explore' })
    const ev: GameEvent[] = []
    return { after: advance(sent, sent.expeditions[0].duration, ev), ev }
  }).filter(({ ev }) => ev.some((e) => e.kind === 'expeditionFailed'))
  expect(injuryRate(lost)).toBeGreaterThan(injuryRate(normalFailures))
})
