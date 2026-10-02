import { expect, test } from 'vitest'
import { FOREIGN_CITIES, REPUTATION_PER_CYCLE, REPUTATION_TIERS, type Res } from './data'
import { advance, foreignCity, newGame, nextReputationTier, openTradeRoute, reputationTier, type GameEvent } from './game'
import { rich } from './test-helpers'

// A rich game with the first Foreign City reached, a route good to send (not Food, which Upkeep eats) and one to receive.
const cityGame = () => {
  const g = rich(newGame(1))
  const city = g.worldMap.find((s) => s.kind === 'city')!
  city.discovery = 'reached'
  const { buys, sells } = foreignCity(g, city.id)
  const give = (Object.keys(buys) as Res[]).find((r) => r !== 'food')!
  const get = (Object.keys(sells) as Res[]).find((r) => r !== give)!
  return { g, city, give, get }
}

test('every Foreign City starts a new game at zero Reputation, in the lowest tier', () => {
  const g = newGame(1)
  const cities = g.worldMap.filter((s) => s.kind === 'city')
  expect(cities.map((s) => s.reputation)).toEqual(cities.map(() => 0))
  expect(cities.map((s) => foreignCity(g, s.id).tier)).toEqual(cities.map(() => 0))
  expect(REPUTATION_TIERS[0].reputation).toBe(0)
})

test('each completed Trade Route cycle raises that city\'s Reputation', () => {
  const { g, city, give, get } = cityGame()
  const ev: GameEvent[] = []
  const after = advance(openTradeRoute(g, 1, city.id, give, get), 300, ev)
  const cycles = ev.filter((e) => e.kind === 'traded').length
  expect(cycles).toBeGreaterThan(0)
  expect(after.worldMap.find((s) => s.id === city.id)!.reputation).toBe(cycles * REPUTATION_PER_CYCLE)
  expect(after.worldMap.filter((s) => s.kind === 'city' && s.id !== city.id).every((s) => s.reputation === 0)).toBe(true)
})

test('a stalled Trade Route earns no Reputation', () => {
  const { g, city, give, get } = cityGame()
  g.stock[give] = 0
  const after = advance(openTradeRoute(g, 1, city.id, give, get), 300)
  expect(after.worldMap.find((s) => s.id === city.id)!.reputation).toBe(0)
})

test('reaching a tier emits an event once, with the city and the tier', () => {
  const { g, city, give, get } = cityGame()
  city.reputation = REPUTATION_TIERS[1].reputation - 1
  const ev: GameEvent[] = []
  advance(openTradeRoute(g, 1, city.id, give, get), 300, ev)
  const name = foreignCity(g, city.id).name
  expect(ev.filter((e) => e.kind === 'reputationTier')).toEqual([{ kind: 'reputationTier', city: name, tier: 1 }])
})

test('the tier follows Reputation thresholds', () => {
  expect(reputationTier(0)).toBe(0)
  for (const [i, t] of REPUTATION_TIERS.entries()) {
    expect(reputationTier(t.reputation)).toBe(i)
    if (i > 0) expect(reputationTier(t.reputation - 1)).toBe(i - 1)
  }
  expect(reputationTier(1e9)).toBe(REPUTATION_TIERS.length - 1)
})

test('each higher tier sells every load at least its bonus up, and more than the tier before, while what the city buys never worsens', () => {
  const { g, city } = cityGame()
  const base = foreignCity(g, city.id)
  let previous = base.sells
  for (const [i, t] of REPUTATION_TIERS.entries()) {
    city.reputation = t.reputation
    const rates = foreignCity(g, city.id)
    expect(rates.tier).toBe(i)
    for (const [r, n] of Object.entries(base.sells)) {
      expect(rates.sells[r as Res]).toBeGreaterThanOrEqual(n * (1 + t.sellBonus))
      if (i > 0) expect(rates.sells[r as Res]).toBeGreaterThan(previous[r as Res]!) // a load of 1 improves at every tier too
    }
    for (const [r, n] of Object.entries(base.buys)) expect(rates.buys[r as Res]).toBe(n)
    previous = rates.sells
  }
})

test('a higher tier unlocks the goods the data module lists for that city, and a Trade Route can then use them', () => {
  const { g, city, give } = cityGame()
  const def = FOREIGN_CITIES[0]
  const [tier, extra] = Object.entries(def.unlocks).map(([t, u]) => [Number(t), u] as const).find(([, u]) => u.sells)!
  const good = Object.keys(extra.sells!)[0] as Res
  expect(def.sells[good]).toBeUndefined()

  city.reputation = REPUTATION_TIERS[tier].reputation - 1
  expect(foreignCity(g, city.id).sells[good]).toBeUndefined()
  expect(() => openTradeRoute(g, 1, city.id, give, good)).toThrow(`doesn't sell`)

  city.reputation = REPUTATION_TIERS[tier].reputation
  expect(foreignCity(g, city.id).sells[good]).toBeGreaterThanOrEqual(extra.sells![good]!)
  const before = g.stock[good]
  expect(advance(openTradeRoute(g, 1, city.id, give, good), 120).stock[good]).toBeGreaterThan(before)
})

test('every Foreign City unlocks something at every tier above the lowest', () => {
  for (const def of FOREIGN_CITIES) {
    for (let t = 1; t < REPUTATION_TIERS.length; t++) {
      const u = def.unlocks[t]
      expect(Object.keys({ ...u?.buys, ...u?.sells }).length, `${def.name} tier ${t}`).toBeGreaterThan(0)
    }
  }
})

test('the next tier says what Reputation it needs, the rates it will trade at and which goods are new, until the top tier', () => {
  const { g, city } = cityGame()
  for (const t of [1, 2, 3]) {
    city.reputation = REPUTATION_TIERS[t - 1].reputation
    const next = nextReputationTier(g, city.id)!
    const unlocks = FOREIGN_CITIES[0].unlocks[t]
    expect(next).toMatchObject({ tier: t, name: REPUTATION_TIERS[t].name, reputation: REPUTATION_TIERS[t].reputation })
    expect(next.newBuys).toEqual(Object.keys(unlocks.buys ?? {}))
    expect(next.newSells).toEqual(Object.keys(unlocks.sells ?? {}))
    city.reputation = REPUTATION_TIERS[t].reputation
    expect({ buys: next.buys, sells: next.sells }).toEqual({ buys: foreignCity(g, city.id).buys, sells: foreignCity(g, city.id).sells })
  }
  expect(nextReputationTier(g, city.id)).toBeUndefined()
})
