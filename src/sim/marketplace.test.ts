import { expect, test } from 'vitest'
import { BUILDINGS } from './data'
import { advance, assign, build, newGame, upgrade, type Game } from './game'
import { rich } from './test-helpers'

// A rich game in Chapter 1 with a Marketplace on plot 3 and the first Villager free to work it.
const marketGame = () => {
  const g = rich(newGame(1))
  g.chapter = BUILDINGS.marketplace.chapter
  g.villagers[0].attrs = { str: 2, dex: 2, int: 2, cha: 2, end: 2, per: 2 }
  g.villagers[0].traits = []
  return build(g, 3, 'marketplace')
}
const swapped = (g: Game, jobId: string, from: 'wood' | 'stone', to: 'wood' | 'stone') => {
  const after = advance(assign(g, 1, 3, jobId), 300)
  return { gave: g.stock[from] - after.stock[from], got: after.stock[to] - g.stock[to] }
}

test('the Marketplace is unlocked in Chapter 1 and there can be only one', () => {
  const g = rich(newGame(1))
  expect(() => build(g, 3, 'marketplace')).toThrow('not unlocked')
  g.chapter = BUILDINGS.marketplace.chapter
  expect(() => build(build(g, 3, 'marketplace'), 4, 'marketplace')).toThrow('only have one')
})

test('a Villager at the Marketplace repeatedly swaps one Material for another, losing a share to the market', () => {
  const g = marketGame()
  const forth = swapped(g, 'wood_for_stone', 'wood', 'stone')
  expect(forth.gave).toBeGreaterThan(0)
  expect(forth.got).toBeGreaterThan(0)
  expect(forth.got).toBeLessThan(forth.gave)
  const back = swapped(g, 'stone_for_wood', 'stone', 'wood')
  expect(back.gave).toBeGreaterThan(0)
  expect(back.got).toBeGreaterThan(0)
  expect(back.got).toBeLessThan(back.gave)
})

test('a swap stalls when the Stockpile cannot pay for it', () => {
  const g = marketGame()
  g.stock.wood = 0
  const after = advance(assign(g, 1, 3, 'wood_for_stone'), 300)
  expect(after.stock.stone).toBe(g.stock.stone)
  expect(after.stock.wood).toBe(0)
})

test('a level 2 Marketplace offers a Contract that buys one of each Rare Material for Gold, paid up front', () => {
  const town = marketGame()
  town.plots[0]!.level = 2 // a Building can't outrank the Town Hall
  const g = upgrade(town, 3)
  const after = advance(assign(g, 1, 3, 'rare_goods'), 600)
  expect(after.stock.gold).toBeLessThan(g.stock.gold)
  for (const r of ['crystal', 'spice', 'silk'] as const) expect(after.stock[r]).toBeGreaterThan(g.stock[r])
})
