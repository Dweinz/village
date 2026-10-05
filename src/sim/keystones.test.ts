import { expect, test } from 'vitest'
import { TRADE_JOB, type Res, type TalentId } from './data'
import { advance, buildCost, findJob, foreignCity, maxParty, newGame, openTradeRoute, planExpedition, sendExpedition, speed, talentBlocker, type Game } from './game'
import { plain, taking } from './test-helpers'

// Each Keystone changes a rule, with an upside and a downside (#20).

test('a Keystone needs a Talent next to it in the web', () => {
  const g = plain()
  g.chapter = 10
  g.talentPoints = 1
  expect(talentBlocker(g, 'iron_discipline')).toBe("Iron Discipline doesn't connect to a Talent you have")
  expect(talentBlocker(taking(g, 'diligence', 'steady_hands', 'work_ethic', 'guild_training'), 'iron_discipline')).toBeUndefined()
})

// A revealed Site far enough away that the success chance isn't capped, even with Lone Wanderer.
const farSite = (g: Game) => {
  const site = g.worldMap.find((s) => s.discovery === 'hidden')!
  Object.assign(site, { discovery: 'revealed', distance: 10 })
  return { kind: 'reach', site: site.id } as const
}

test('Lone Wanderer: Parties hold one Villager, who goes 40% likelier to succeed and in half the time', () => {
  const g = plain()
  const target = farSite(g)
  const lone = taking(g, 'lone_wanderer')
  expect(maxParty(lone)).toBe(1)
  expect(() => planExpedition(lone, [1, 2], target)).toThrow('A party is at most 1 Villagers')
  expect(planExpedition(lone, [1], target).chance).toBeCloseTo(planExpedition(g, [1], target).chance + 0.4)
  expect(planExpedition(lone, [1], target).duration).toBeCloseTo(planExpedition(g, [1], target).duration / 2)
})

test('Lone Wanderer caps the Party even with Party size Talents', () => {
  expect(maxParty(taking(plain(), 'strength_in_numbers', 'lone_wanderer'))).toBe(1)
})

test('an Expedition already under way when Lone Wanderer is taken finishes as it was', () => {
  const start = plain()
  const g = sendExpedition(start, [1, 2], farSite(start))
  const x = g.expeditions[0]
  const lone = taking(g, 'lone_wanderer')
  expect(advance(lone, x.duration - 1).expeditions).toEqual([{ ...x, progress: x.duration - 1 }])
  expect(advance(lone, x.duration).expeditions).toEqual([])
})

test('Iron Discipline: every Villager works 30% faster, but Upkeep is doubled', () => {
  const g = plain()
  const v = g.villagers[0]
  const chop = findJob('lumbercamp', 'chop')
  expect(speed(taking(g, 'iron_discipline'), v, 'lumbercamp', chop)).toBeCloseTo(speed(g, v, 'lumbercamp', chop) * 1.3)
  const eaten = (g: Game) => g.stock.food - advance(g, 100).stock.food
  expect(eaten(taking(g, 'iron_discipline'))).toBeCloseTo(eaten(g) * 2)
  expect(eaten(taking(g, 'frugal_meals', 'iron_discipline'))).toBeCloseTo(eaten(taking(g, 'frugal_meals')) * 2) // doubled after Upkeep Talents
})

test('Merchant Prince: Foreign Cities sell more and Reputation grows faster, but every Building costs 25% more', () => {
  const g = plain()
  const city = g.worldMap.find((s) => s.kind === 'city')!
  city.discovery = 'reached'
  const { buys, sells } = foreignCity(g, city.id)
  const give = (Object.keys(buys) as Res[]).find((r) => r !== 'food')!
  const get = (Object.keys(sells) as Res[]).find((r) => r !== give && r !== 'food')!
  const pr = taking(g, 'merchant_prince')
  expect(foreignCity(pr, city.id).sells[get]).toBeGreaterThanOrEqual(sells[get]! * 1.5)
  const reputation = (g: Game) => advance(openTradeRoute(g, 1, city.id, give, get), TRADE_JOB.duration).worldMap.find((s) => s.id === city.id)!.reputation!
  expect(reputation(pr)).toBeGreaterThanOrEqual(reputation(g) * 2)

  expect(buildCost(pr, 'house', 0).wood).toBe(Math.round(buildCost(g, 'house', 0).wood! * 1.25))
  expect(buildCost(pr, 'townhall', 1).gold).toBe(Math.round(buildCost(g, 'townhall', 1).gold! * 1.25))
  const thrift = taking(g, 'thrift')
  expect(buildCost(taking(g, 'thrift', 'merchant_prince'), 'house', 0).wood).toBeCloseTo(buildCost(thrift, 'house', 0).wood! * 1.25, -0.2) // 25% more after building cost Talents
})
