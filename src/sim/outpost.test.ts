import { expect, test } from 'vitest'
import { OUTPOST_COST, RARE_MATERIALS, RES_NAME, type TraitId } from './data'
import { activityName, advance, assignOutpost, buildOutpost, newGame, siteById, upgradeOutpost, type Game } from './game'
import { rich } from './test-helpers'
import type { Site } from './world'

test('a new game starts with no Rare Materials, and every Resource Deposit holds one of them', () => {
  for (const seed of [1, 2, 3, 42]) {
    const g = newGame(seed)
    for (const m of RARE_MATERIALS) expect(g.stock[m]).toBe(0)
    const deposits = g.worldMap.filter((s) => s.kind === 'deposit')
    expect(new Set(deposits.map((s) => s.material))).toEqual(new Set(RARE_MATERIALS)) // each one somewhere
    expect(g.worldMap.filter((s) => s.kind !== 'deposit').every((s) => s.material === undefined)).toBe(true)
  }
})

const withReached = (g: Game, kind: Site['kind']) => {
  const site = g.worldMap.find((s) => s.kind === kind)!
  site.discovery = 'reached'
  return site
}

test('an Outpost can be built only on a reached Resource Deposit, once, for its cost', () => {
  const g = rich(newGame(1))
  const unreached = g.worldMap.find((s) => s.kind === 'deposit' && s.discovery !== 'reached')!
  expect(() => buildOutpost(g, unreached.id)).toThrow('Reach this Site first')
  expect(() => buildOutpost(g, withReached(g, 'ruin').id)).toThrow('Only a Resource Deposit can hold an Outpost')
  expect(() => buildOutpost(g, 999)).toThrow('No such Site')

  const deposit = withReached(g, 'deposit')
  const built = buildOutpost(g, deposit.id)
  expect(siteById(built, deposit.id).outpost).toEqual({ level: 1 })
  expect(built.stock.wood).toBe(g.stock.wood - OUTPOST_COST.wood!)
  expect(() => buildOutpost(built, deposit.id)).toThrow('There is already an Outpost here')

  const poor = structuredClone(g)
  poor.stock.wood = 0
  expect(() => buildOutpost(poor, deposit.id)).toThrow('Not enough resources')
})

const outpostGame = (traits: TraitId[] = []) => {
  const g = rich(newGame(1))
  g.villagers[0].traits = traits
  g.villagers[0].attrs = { str: 2, dex: 2, int: 2, cha: 2, end: 2, per: 2 }
  const site = withReached(g, 'deposit')
  return { g: buildOutpost(g, site.id), site }
}

test("a Villager working an Outpost yields its deposit's Rare Material and XP, by the usual speed rules", () => {
  const { g, site } = outpostGame()
  const worked = advance(assignOutpost(g, 1, site.id), 400)
  const yieldOf = (x: Game) => x.stock[site.material!] - 5000
  const v = worked.villagers[0]
  expect(yieldOf(worked)).toBeGreaterThan(0)
  expect(v.level > 1 || v.xp > 0).toBe(true)
  expect(activityName(worked, v)).toBe(`Work the ${RES_NAME[site.material!]} Deposit`)

  const hand = outpostGame(['stonehand'])
  expect(yieldOf(advance(assignOutpost(hand.g, 1, hand.site.id), 400))).toBeGreaterThan(yieldOf(worked)) // Stonehand works Outposts too

  const hungry = structuredClone(g)
  hungry.stock.food = 0
  expect(yieldOf(advance(assignOutpost(hungry, 1, site.id), 400))).toBeLessThan(yieldOf(worked)) // starving halves speed
})

test('an Outpost has one Slot per level, and is staffed only where one stands', () => {
  const { g, site } = outpostGame()
  g.plots[0]!.level = 2 // an Outpost, like a Building, can't outgrow the Town Hall
  const one = assignOutpost(g, 1, site.id)
  expect(() => assignOutpost(one, 2, site.id)).toThrow('No free slots')
  const other = g.worldMap.find((s) => s.kind === 'deposit' && s.id !== site.id)!
  expect(() => assignOutpost(g, 1, other.id)).toThrow('There is no Outpost here')

  const bigger = upgradeOutpost(one, site.id)
  expect(() => upgradeOutpost(bigger, site.id)).toThrow('Upgrade the Town Hall first')
  expect(() => assignOutpost(bigger, 2, site.id)).not.toThrow() // a second Slot
})

test('upgrading an Outpost makes each cycle yield more, not just add a Slot', () => {
  const { g, site } = outpostGame()
  g.plots[0]!.level = 3
  const yieldAt = (level: number) => {
    let x = assignOutpost(g, 1, site.id)
    for (let l = 1; l < level; l++) x = upgradeOutpost(x, site.id)
    x = Object.assign(x, { stock: { ...x.stock, [site.material!]: 0 } })
    return advance(x, 400).stock[site.material!]
  }
  expect(yieldAt(2)).toBe(2 * yieldAt(1))
  expect(yieldAt(3)).toBe(3 * yieldAt(1))
})

test('unknown Sites get a plain message when upgrading or staffing an Outpost', () => {
  const { g } = outpostGame()
  expect(() => upgradeOutpost(g, 999)).toThrow('No such Site')
  expect(() => assignOutpost(g, 1, 999)).toThrow('No such Site')
})
