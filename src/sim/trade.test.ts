import { expect, test } from 'vitest'
import { FOREIGN_CITIES, RESOURCES, SITE_COUNTS, type Res } from './data'
import {
  activityName, advance, assign, closeTradeRoute, foreignCity, newGame, openTradeRoute, sendExpedition, unassign, type Game, type GameEvent,
} from './game'
import { rich } from './test-helpers'

// A rich game with a reached Foreign City, and the first Villager's Attributes pinned so speeds compare fairly.
// `give` is a good the city buys (not Food, which Upkeep also eats) and `get` a different good it sells.
const cityGame = () => {
  const g = rich(newGame(1))
  const city = g.worldMap.find((s) => s.kind === 'city')!
  city.discovery = 'reached'
  g.villagers[0].attrs = { str: 2, dex: 2, int: 2, cha: 2, end: 2, per: 2 }
  g.villagers[0].traits = []
  const { buys, sells } = foreignCity(g, city.id)
  const give = (Object.keys(buys) as Res[]).find((r) => r !== 'food')!
  const get = (Object.keys(sells) as Res[]).find((r) => r !== give)!
  return { g, city, buys, sells, give, get }
}

test('there is a rate table for every Foreign City a World Map can hold', () => {
  expect(FOREIGN_CITIES.length).toBeGreaterThanOrEqual(SITE_COUNTS.city)
})

test('each Foreign City has its own rate table', () => {
  const g = newGame(1)
  const cities = g.worldMap.filter((s) => s.kind === 'city').map((s) => foreignCity(g, s.id))
  expect(new Set(cities.map((c) => c.name)).size).toBe(cities.length)
  expect(cities.map((c) => c.name)).toEqual(FOREIGN_CITIES.slice(0, cities.length).map((c) => c.name))
})

test('each cycle a Trade Route sends what the city buys and receives what it sells, at its rates, with XP', () => {
  const { g, city, buys, sells, give, get } = cityGame()
  const ev: GameEvent[] = []
  const traded = advance(openTradeRoute(g, 1, city.id, give, get), 300, ev)
  const cycles = ev.filter((e) => e.kind === 'traded').length
  expect(cycles).toBeGreaterThan(0)
  expect(traded.stock[get] - g.stock[get]).toBeCloseTo(cycles * sells[get]!)
  expect(g.stock[give] - traded.stock[give]).toBeCloseTo(cycles * buys[give]!)
  expect(ev).toContainEqual({ kind: 'traded', name: g.villagers[0].name, city: foreignCity(g, city.id).name, gave: { [give]: buys[give] }, got: { [get]: sells[get] } })
  const v = traded.villagers[0]
  expect(v.level > 1 || v.xp > 0).toBe(true)
  expect(activityName(traded, v)).toBe(`Trade Route to ${foreignCity(g, city.id).name}`)
})

test('a Trade Route stalls instead of overdrawing the Stockpile, and picks up again once it can pay', () => {
  const { g, city, buys, sells, give, get } = cityGame()
  g.stock[give] = buys[give]! - 1
  const stalled = advance(openTradeRoute(g, 1, city.id, give, get), 300)
  expect(stalled.stock[give]).toBe(buys[give]! - 1)
  expect(stalled.stock[get]).toBe(g.stock[get])

  stalled.stock[give] += 1
  expect(advance(stalled, 1).stock[get]).toBe(g.stock[get] + sells[get]!) // it was waiting at the end of its cycle
})

test('Charm and the Merchant Specialization speed up a Trade Route', () => {
  const { g, city, give, get } = cityGame()
  const received = (x: Game) => advance(openTradeRoute(x, 1, city.id, give, get), 600).stock[get] - x.stock[get]
  const charming = structuredClone(g)
  charming.villagers[0].attrs.cha = 12
  const merchant = structuredClone(g)
  merchant.villagers[0].spec = 'merchant'
  expect(received(charming)).toBeGreaterThan(received(g))
  expect(received(merchant)).toBeGreaterThan(received(g))
})

test('opening a Trade Route is refused for an unreached or unknown city, a busy or Injured Villager, or goods it does not deal in', () => {
  const { g, city, buys, sells, give, get } = cityGame()
  const name = g.villagers[0].name
  const cityName = foreignCity(g, city.id).name

  const unreached = g.worldMap.find((s) => s.kind === 'city' && s.id !== city.id)!
  expect(() => openTradeRoute(g, 1, unreached.id, give, get)).toThrow('Reach this Foreign City first')
  expect(() => openTradeRoute(g, 1, 999, give, get)).toThrow('No such Site')
  const deposit = g.worldMap.find((s) => s.kind === 'deposit')!
  deposit.discovery = 'reached'
  expect(() => openTradeRoute(g, 1, deposit.id, give, get)).toThrow('Only a Foreign City can be traded with')

  const notBought = RESOURCES.find((r) => !buys[r])!
  const notSold = RESOURCES.find((r) => !sells[r] && r !== give)!
  expect(() => openTradeRoute(g, 1, city.id, notBought, get)).toThrow(`${cityName} doesn't buy`)
  expect(() => openTradeRoute(g, 1, city.id, give, notSold)).toThrow(`${cityName} doesn't sell`)
  const both = (Object.keys(buys) as Res[]).find((r) => sells[r])
  if (both) expect(() => openTradeRoute(g, 1, city.id, both, both)).toThrow('Choose two different goods')

  const away = sendExpedition(g, [1], { kind: 'explore' })
  expect(() => openTradeRoute(away, 1, city.id, give, get)).toThrow(`${name} is away on an Expedition`)
  const hurt = structuredClone(g)
  hurt.villagers[0].activity = { kind: 'injured', recoversAt: 100 }
  expect(() => openTradeRoute(hurt, 1, city.id, give, get)).toThrow(`${name} is Injured`)
  const contract = structuredClone(g)
  contract.plots[0]!.level = 2
  expect(() => openTradeRoute(assign(contract, 1, 0, 'dispute'), 1, city.id, give, get)).toThrow(`${name} is busy with a Contract`)
})

test('closing a Trade Route frees its Villager at any time and stops the trade', () => {
  const { g, city, give, get } = cityGame()
  const open = advance(openTradeRoute(g, 1, city.id, give, get), 10)
  const closed = closeTradeRoute(open, 1)
  expect(closed.villagers[0].activity).toBeUndefined()
  expect(advance(closed, 600).stock[get]).toBe(open.stock[get])
  expect(() => closeTradeRoute(closed, 1)).toThrow(`${g.villagers[0].name} has no Trade Route`)
  expect(() => assign(closed, 1, 1, 'fields')).not.toThrow()
  expect(unassign(open, 1).villagers[0].activity).toBeUndefined() // a Trade Route never locks its Villager in
})

test('Offline Progress matches live play with a Trade Route running', () => {
  const { g, city, give, get } = cityGame()
  const start = openTradeRoute(g, 1, city.id, give, get)
  let live = start
  for (let i = 0; i < 600; i++) live = advance(live, 1)
  expect(advance(start, 600)).toEqual(live)
})
