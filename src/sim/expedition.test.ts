import { expect, test } from 'vitest'
import { rich } from './test-helpers'
import type { TraitId } from './data'
import { UPKEEP, advance, assign, newGame, planExpedition, recallExpedition, sendExpedition, unassign, xpToNext, type Game, type GameEvent } from './game'

const firstRevealed = (g: Game) => g.worldMap.find((s) => s.discovery === 'revealed')!

test('a reaching Expedition is rolled once at the end: success reaches the Site and grants XP, failure brings nothing', () => {
  const outcomes = new Set<string>()
  for (let seed = 1; seed <= 40; seed++) {
    let g = rich(newGame(seed))
    const site = firstRevealed(g)
    g = sendExpedition(g, [1], { kind: 'reach', site: site.id })
    const ev: GameEvent[] = []
    g = advance(g, g.expeditions[0].duration, ev)

    const v = g.villagers.find((x) => x.id === 1)!
    const succeeded = ev.some((e) => e.kind === 'expeditionSucceeded')
    outcomes.add(succeeded ? 'success' : 'failure')
    expect(ev.some((e) => e.kind === 'expeditionFailed')).toBe(!succeeded)
    expect(g.worldMap.find((s) => s.id === site.id)!.discovery).toBe(succeeded ? 'reached' : 'revealed')
    expect(v.level > 1 || v.xp > 0).toBe(succeeded)
    expect(v.activity === undefined || (!succeeded && v.activity.kind === 'injured')).toBe(true) // home again, maybe hurt
    expect(g.expeditions).toHaveLength(0)
  }
  expect(outcomes).toEqual(new Set(['success', 'failure']))
})

test('exploring heads for the nearest hidden Site not already being explored, and reveals it on success', () => {
  const outcomes = new Set<string>()
  for (let seed = 1; seed <= 40; seed++) {
    let g = rich(newGame(seed))
    const hidden = g.worldMap.filter((s) => s.discovery === 'hidden').sort((a, b) => a.distance - b.distance || a.id - b.id)
    g = sendExpedition(sendExpedition(g, [1], { kind: 'explore' }), [2], { kind: 'explore' })
    expect(g.expeditions.map((x) => x.site)).toEqual([hidden[0].id, hidden[1].id])

    const ev: GameEvent[] = []
    g = advance(g, g.expeditions[0].duration, ev) // only the nearer one is back
    const found = ev.some((e) => e.kind === 'siteRevealed' && e.id === hidden[0].id)
    outcomes.add(found ? 'found' : 'lost')
    expect(g.worldMap.find((s) => s.id === hidden[0].id)!.discovery).toBe(found ? 'revealed' : 'hidden')
  }
  expect(outcomes).toEqual(new Set(['found', 'lost']))
})

test('a Villager on an Expedition can be neither assigned nor unassigned, and still eats', () => {
  let g = rich(newGame(1))
  const name = g.villagers[0].name
  g = sendExpedition(g, [1], { kind: 'explore' })
  expect(() => assign(g, 1, 1, 'fields')).toThrow(`${name} is away on an Expedition`)
  expect(() => unassign(g, 1)).toThrow(`${name} is away on an Expedition`)
  expect(() => sendExpedition(g, [1], { kind: 'explore' })).toThrow(`${name} is away on an Expedition`)

  const food = g.stock.food
  g = advance(g, 10)
  expect(food - g.stock.food).toBeCloseTo(3 * UPKEEP * 10) // all three Villagers, the one away included
})

test('an Expedition is refused for a bad party, an unrevealed or reached Site, nothing left to explore, or too little Food and Gold', () => {
  const g = rich(newGame(1))
  g.villagers.push({ ...g.villagers[0], id: 99, name: 'Extra', activity: undefined })
  const hidden = g.worldMap.find((s) => s.discovery === 'hidden')!
  const revealed = firstRevealed(g)
  expect(() => sendExpedition(g, [], { kind: 'explore' })).toThrow('Choose at least one Villager')
  expect(() => sendExpedition(g, [1, 2, 3, 99], { kind: 'explore' })).toThrow('A party is at most 3 Villagers')
  expect(() => sendExpedition(g, [1, 1], { kind: 'explore' })).toThrow('A party is at most 3 Villagers')
  expect(() => sendExpedition(g, [1], { kind: 'reach', site: hidden.id })).toThrow('That Site is still hidden in the fog')

  const reached = structuredClone(g)
  reached.worldMap.find((s) => s.id === revealed.id)!.discovery = 'reached'
  expect(() => sendExpedition(reached, [1], { kind: 'reach', site: revealed.id })).toThrow('Already reached')

  const charted = structuredClone(g)
  for (const s of charted.worldMap) s.discovery = 'revealed'
  expect(() => sendExpedition(charted, [1], { kind: 'explore' })).toThrow('Nothing left to explore')

  const poor = structuredClone(g)
  poor.stock.food = 0
  expect(() => sendExpedition(poor, [1], { kind: 'explore' })).toThrow('Not enough resources')
})

test('recalling an Expedition brings the party home at once, with no reward and no refund', () => {
  let g = rich(newGame(1))
  const site = firstRevealed(g)
  g = sendExpedition(g, [1, 2], { kind: 'reach', site: site.id })
  const { gold } = g.stock
  g = advance(g, 30)
  const ev: GameEvent[] = []
  g = advance(recallExpedition(g, g.expeditions[0].id), 3600, ev)

  expect(g.expeditions).toHaveLength(0)
  expect(g.villagers.filter((v) => v.activity)).toHaveLength(0)
  expect(g.stock.gold).toBe(gold)
  expect(g.worldMap.find((s) => s.id === site.id)!.discovery).toBe('revealed')
  expect(ev.filter((e) => e.kind.startsWith('expedition'))).toHaveLength(0)
  expect(g.villagers.every((v) => v.xp === 0 && v.level === 1)).toBe(true)
})

test('the preview grows longer and costlier with distance, and a stronger or better-suited party has a better chance', () => {
  const g = rich(newGame(3))
  const near = firstRevealed(g)
  const toNear = planExpedition(g, [1], { kind: 'reach', site: near.id })
  const toFar = planExpedition(g, [1], { kind: 'explore' }) // hidden Sites are all farther than revealed ones
  expect(toFar.site.distance).toBeGreaterThan(near.distance)
  expect(toFar.duration).toBeGreaterThan(toNear.duration)
  expect(toFar.cost.food!).toBeGreaterThan(toNear.cost.food!)
  expect(toFar.chance).toBeLessThan(toNear.chance)

  const chance = (edit: (g: Game) => void) => {
    const h = structuredClone(g)
    h.villagers[0].attrs = { str: 1, dex: 1, int: 1, cha: 1, end: 1, per: 1 }
    h.villagers[0].traits = []
    edit(h)
    return planExpedition(h, [1], { kind: 'explore' }).chance
  }
  const plain = chance(() => {})
  expect(chance((h) => { h.villagers[0].attrs.end = 6 })).toBeGreaterThan(plain) // Endurance helps
  expect(chance((h) => { h.villagers[0].attrs.cha = 6 })).toBe(plain) // Charm doesn't
  expect(chance((h) => { h.villagers[0].traits = ['tireless'] })).toBeGreaterThan(plain)
  expect(chance((h) => { h.villagers[0].spec = 'prospector' })).toBeGreaterThan(plain)
  expect(planExpedition(g, [1, 2], { kind: 'explore' }).chance).toBeGreaterThan(planExpedition(g, [1], { kind: 'explore' }).chance)
})

test('a second Expedition to a Site already being reached, or with unknown Villagers or Sites, is refused with a message', () => {
  const g = rich(newGame(1))
  const site = firstRevealed(g)
  const going = sendExpedition(g, [1], { kind: 'reach', site: site.id })
  expect(() => sendExpedition(going, [2], { kind: 'reach', site: site.id })).toThrow('An Expedition is already on its way there')
  expect(() => sendExpedition(g, [1], { kind: 'reach', site: 999 })).toThrow('No such Site')
  expect(() => sendExpedition(g, [42], { kind: 'explore' })).toThrow('No such Villager')
})

test('Expedition XP gets the same XP bonuses as Jobs, and a found Site is announced once, naming the party', () => {
  const xpFor = (traits: TraitId[]) => {
    for (let seed = 1; ; seed++) { // the first seed where the Expedition succeeds
      let g = rich(newGame(seed))
      g.villagers[0].traits = traits
      g = sendExpedition(g, [1], { kind: 'explore' })
      const { distance } = g.worldMap.find((s) => s.id === g.expeditions[0].site)!
      const ev: GameEvent[] = []
      g = advance(g, g.expeditions[0].duration, ev)
      const found = ev.filter((e) => e.kind === 'siteRevealed')
      if (found.length === 0) continue
      expect(found).toEqual([expect.objectContaining({ party: [g.villagers[0].name] })])
      expect(ev.filter((e) => e.kind === 'expeditionSucceeded')).toHaveLength(0) // one line in the Report, not two
      const v = g.villagers[0]
      const earned = v.xp + Array.from({ length: v.level - 1 }, (_, i) => xpToNext(i + 1)).reduce((a, b) => a + b, 0)
      return { distance, earned }
    }
  }
  const plain = xpFor([])
  const quick = xpFor(['quick_learner'])
  expect(plain.earned).toBe(12 * plain.distance) // EXPEDITION_XP_PER_DISTANCE
  expect(quick.earned).toBe(12 * quick.distance * 1.5) // Quick Learner: +50% XP
})
