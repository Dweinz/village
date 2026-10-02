import { expect, test } from 'vitest'
import { advance, assign, newGame, upgrade, type Game } from './game'
import { fromSave, toSave } from './save'
import v1Save from './fixtures/v1-save.json'

const v1Text = JSON.stringify(v1Save)

test('a v1 save loads with its Villagers, Buildings, Stockpile and Chapter progress intact', () => {
  const loaded = fromSave(v1Text)!
  expect(loaded.savedAt).toBe(1790000000000)
  expect(loaded.game.villagers.map((v) => v.name)).toEqual(v1Save.game.villagers.map((v) => v.name))
  expect(loaded.game.plots.map((p) => p?.type ?? null)).toEqual(['townhall', 'farm', 'lumbercamp', 'house', null, null, null, null, null])
  expect(loaded.game.stock).toEqual(v1Save.game.stock)
  expect(loaded.game.done).toEqual(['wood30', 'house'])
  expect(loaded.game.chapter).toBe(v1Save.game.chapter)
})

test('a v1 save keeps playing: its Jobs keep producing and it can finish the Founding Chapter', () => {
  let g = fromSave(v1Text)!.game
  g = advance(g, 60)
  expect(g.stock.wood).toBeGreaterThan(v1Save.game.stock.wood)
  g = advance(upgrade(g, 0), 1) // Town Hall to level 2: the last Founding Objective
  expect(g.chapter).toBe(1)
  expect(g.villagers).toHaveLength(3)
})

test('a written save carries a version number and loads back unchanged', () => {
  const game = advance(assign(newGame(9), 1, 1, 'fields'), 30)
  const text = toSave(game, 1790000500000)
  expect(JSON.parse(text).version).toBeGreaterThan(1) // v1 saves had no version
  expect(fromSave(text)).toEqual({ game, savedAt: 1790000500000 })
})

test('loading runs every migration newer than the save, oldest first', () => {
  const mark = (tag: string) => (g: Game) => ({ ...g, done: [...g.done, tag] })
  const migrations = [mark('v1→v2'), mark('v2→v3')]
  expect(fromSave(v1Text, migrations)!.game.done).toEqual(['wood30', 'house', 'v1→v2', 'v2→v3'])
  const v2Text = JSON.stringify({ version: 2, savedAt: 0, game: v1Save.game })
  expect(fromSave(v2Text, migrations)!.game.done).toEqual(['wood30', 'house', 'v2→v3'])
})

test('a corrupt or empty save loads as nothing, so the player gets a new game', () => {
  expect(fromSave('{"game": {"stock"')).toBeNull()
  expect(fromSave('null')).toBeNull()
  expect(fromSave('{"savedAt": 5}')).toBeNull()
  expect(fromSave(JSON.stringify({ game: v1Save.game }))).toBeNull()
})

test('a save with an unusable version loads as nothing instead of skipping migrations', () => {
  for (const version of [0, -1, 1.5, '2', null, 99]) {
    expect(fromSave(JSON.stringify({ version, savedAt: 0, game: v1Save.game }))).toBeNull()
  }
})

test('a save that a migration cannot handle loads as nothing instead of crashing', () => {
  const strict = (g: Game) => { if (!g.villagers) throw new Error('bad shape'); return g }
  expect(fromSave(JSON.stringify({ savedAt: 0, game: { stock: {} } }), [strict])).toBeNull()
})
