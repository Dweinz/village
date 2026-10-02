import { expect, test } from 'vitest'
import { advance, assign, currentJob, newGame, upgrade, workers, type Game } from './game'
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

test('a v1 save keeps every Villager on the Job they were working, with their progress', () => {
  const g = fromSave(v1Text)!.game
  const onJob = (plot: number) => workers(g, plot).map((v) => v.name)
  const [first, second, third] = v1Save.game.villagers.map((v) => v.name)
  expect([onJob(1), onJob(2), onJob(0)]).toEqual([[first], [second], [third]]) // Farm, Lumber Camp, Town Hall
  expect(g.villagers.map((v) => currentJob(v) && [currentJob(v)!.job, currentJob(v)!.progress]))
    .toEqual(v1Save.game.villagers.map((v) => [v.job.job, v.job.progress]))
})

test('an old save gains a World Map generated from its seed, the same one every time it loads', () => {
  const map = fromSave(v1Text)!.game.worldMap
  expect(map.length).toBeGreaterThan(0)
  expect(map.some((s) => s.discovery === 'revealed')).toBe(true)
  expect(fromSave(v1Text)!.game.worldMap).toEqual(map)
})

test("the v4 migration's World Map for an old save is pinned, so changing the generator can't silently alter it", () => {
  // If this fails, generateWorldMap changed: copy its v4 version into the v3 → v4 migration instead of updating this.
  const map = fromSave(v1Text)!.game.worldMap
  expect(map.map((s) => `${s.id} ${s.kind} d${s.distance} a${s.angle} ${s.discovery}`)).toMatchInlineSnapshot(`
    [
      "1 deposit d2 a2.91 revealed",
      "2 ruin d1 a1.35 revealed",
      "3 city d1 a4.69 revealed",
      "4 ruin d7 a2.41 hidden",
      "5 deposit d8 a3.39 hidden",
      "6 land d6 a5.61 hidden",
      "7 deposit d10 a1.1 hidden",
      "8 ruin d6 a6.06 hidden",
      "9 city d4 a0.07 hidden",
      "10 land d9 a3.66 hidden",
      "11 city d5 a0.64 hidden",
      "12 deposit d8 a4.3 hidden",
      "13 land d7 a5.08 hidden",
      "14 deposit d6 a1.86 hidden",
    ]
  `)
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
