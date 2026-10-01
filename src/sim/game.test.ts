import { expect, test } from 'vitest'
import { advance, assign, build, newGame, raise, type GameEvent } from './game'

test('a Production Job yields Materials and XP each cycle', () => {
  let g = assign(newGame(1), 1, 2, 'chop')
  g = advance(g, 60)
  expect(g.stock.wood).toBeGreaterThan(20 + 4 * 4)
  expect(g.villagers[0].xp + g.villagers[0].level).toBeGreaterThan(1)
})

test('Offline Progress in one big step matches playing it live', () => {
  const g = assign(assign(newGame(7), 1, 1, 'fields'), 2, 0, 'taxes')
  let live = g
  for (let i = 0; i < 600; i++) live = advance(live, 1)
  expect(advance(g, 600)).toEqual(live)
})

test('running out of Food halves speed instead of killing anyone', () => {
  const ev: GameEvent[] = []
  let g = assign(newGame(3), 1, 2, 'chop')
  g = advance(g, 600, ev) // 3 Villagers eat 30 Food in ~125s, nobody farms
  expect(g.starving).toBe(true)
  expect(g.villagers).toHaveLength(3)
  expect(ev.some((e) => e.kind === 'starving')).toBe(true)
})

test('completing every Objective advances the Chapter', () => {
  let g = newGame(5)
  g.stock = { gold: 500, wood: 500, stone: 0, food: 500, ore: 0 }
  g = build(g, 3, 'house')
  g = advance(g, 1) // records wood30 + house
  g.plots[0]!.level = 2
  const ev: GameEvent[] = []
  g = advance(g, 1, ev)
  expect(g.chapter).toBe(1)
  expect(ev).toContainEqual({ kind: 'chapter', chapter: 1 })
})

test('actions reject what the player cannot do', () => {
  const g = newGame(2)
  expect(() => build(g, 3, 'tavern')).toThrow('not unlocked')
  expect(() => build(g, 1, 'house')).toThrow('taken')
  expect(() => raise(g, 1, 'str')).toThrow('No Attribute points')
})
