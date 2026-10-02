import { expect, test } from 'vitest'
import { advance, assign, assignOutpost, build, buildOutpost, demolish, hire, newGame, raise, sendExpedition, unassign, upgrade, workers, type GameEvent } from './game'

test('a Production Job yields Materials and XP each cycle', () => {
  let g = assign(newGame(1), 1, 2, 'chop')
  g = advance(g, 60)
  expect(g.stock.wood).toBeGreaterThan(20 + 4 * 4)
  expect(g.villagers[0].xp + g.villagers[0].level).toBeGreaterThan(1)
})

test('Offline Progress in one big step matches playing it live, Expeditions and Outposts included', () => {
  const start = assign(assign(newGame(7), 1, 1, 'fields'), 2, 0, 'taxes')
  start.stock.gold = 500
  const deposit = start.worldMap.find((s) => s.kind === 'deposit')!
  deposit.discovery = 'reached'
  Object.assign(start.stock, { wood: 500, stone: 500 })
  const staffed = assignOutpost(buildOutpost(unassign(start, 2), deposit.id), 2, deposit.id) // a Villager on an Outpost too
  const g = sendExpedition(staffed, [3], { kind: 'explore' }) // back within the 20 minutes, rolled on the way
  let live = g
  for (let i = 0; i < 1200; i++) live = advance(live, 1)
  expect(live.expeditions).toHaveLength(0)
  expect(advance(g, 1200)).toEqual(live)
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
  Object.assign(g.stock, { gold: 500, wood: 500, stone: 0, food: 500, ore: 0 })
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

test('a Villager mid-Contract can be neither unassigned nor reassigned until the Contract is done', () => {
  let g = newGame(4)
  g.plots[0]!.level = 2 // unlocks Settle a Dispute
  g = assign(g, 1, 0, 'dispute')
  expect(() => unassign(g, 1)).toThrow('busy with a Contract')
  expect(() => assign(g, 1, 1, 'fields')).toThrow('busy with a Contract')

  g = advance(g, 90) // the Contract's full duration, at speed ≥ 1
  expect(workers(g, 0)).toHaveLength(0)
  g = unassign(assign(g, 1, 1, 'fields'), 1)
  expect(workers(g, 1)).toHaveLength(0)
})

test('demolishing a House frees its Plot, so a Settlement full of Houses can still build its Tavern', () => {
  let g = newGame(1)
  Object.assign(g.stock, { gold: 5000, wood: 5000, stone: 0, food: 5000, ore: 0 })
  for (let plot = 3; plot < 9; plot++) g = build(g, plot, 'house')
  g = advance(upgrade(g, 0), 1)
  expect(g.chapter).toBe(1) // New Faces opens with "Build a Tavern"
  expect(() => build(g, 3, 'tavern')).toThrow('That plot is taken')

  g = advance(build(demolish(g, 3), 3, 'tavern'), 1)
  expect(g.done).toContain('tavern')
})

test('demolishing refunds half of everything paid for the Building, rounded down', () => {
  let g = newGame(1)
  Object.assign(g.stock, { gold: 500, wood: 500, stone: 0, food: 500, ore: 0 })
  g.plots[0]!.level = 2 // lets the House reach level 2
  g = upgrade(build(g, 3, 'house'), 3) // 30 Wood + 57 Wood
  const before = g.stock.wood
  g = demolish(g, 3)
  expect(g.stock.wood - before).toBe(43)
  expect(g.plots[3]).toBeNull()

  g.chapter = 1 // Quarry unlocked: 40 Wood + 30 Gold, then 76 Wood + 57 Gold to reach level 2
  g = upgrade(build(g, 4, 'quarry'), 4)
  const { wood, gold } = g.stock
  g = demolish(g, 4)
  expect([g.stock.wood - wood, g.stock.gold - gold]).toEqual([58, 43]) // floor(116 / 2), floor(87 / 2)
})

test('Villagers working in a demolished Building become idle and can be assigned elsewhere', () => {
  let g = assign(assign(newGame(1), 1, 1, 'fields'), 2, 1, 'fields') // both Farm Slots
  g = advance(demolish(g, 1), 30)
  expect(g.villagers.filter((v) => v.activity)).toHaveLength(0)
  expect(workers(assign(g, 1, 2, 'chop'), 2)).toHaveLength(1)
})

test('demolishing is refused for the Town Hall, an empty Plot, a Contract in progress, or Housing still needed', () => {
  let g = newGame(1)
  Object.assign(g.stock, { gold: 500, wood: 500, stone: 0, food: 500, ore: 0 })
  expect(() => demolish(g, 0)).toThrow("The Town Hall can't be demolished")
  expect(() => demolish(g, 4)).toThrow('That plot is empty')

  g.plots[0]!.level = 3
  g.plots[1]!.level = 3 // unlocks the Harvest Festival Contract at the Farm
  const busy = assign(g, 1, 1, 'festival')
  expect(() => demolish(busy, 1)).toThrow(`${g.villagers[0].name} is busy with a Contract`)

  g.plots[0]!.level = 1 // Town Hall houses 3; the House adds 2
  g = hire(advance(build(g, 3, 'house'), 1), 0) // 4 Villagers
  const snapshot = structuredClone(g)
  expect(() => demolish(g, 3)).toThrow('Not enough Housing for your Villagers')
  expect(g).toEqual(snapshot) // a refused demolish changes nothing
})

test('demolishing keeps completed Objectives, and a unique Building can be built again', () => {
  let g = newGame(1)
  Object.assign(g.stock, { gold: 500, wood: 500, stone: 0, food: 500, ore: 0 })
  g = advance(build(g, 3, 'house'), 1)
  expect(g.done).toContain('house')
  g = advance(demolish(g, 3), 1)
  expect(g.done).toContain('house')

  g.chapter = 1 // Tavern unlocked
  g = demolish(build(g, 4, 'tavern'), 4)
  expect(build(g, 5, 'tavern').plots[5]?.type).toBe('tavern')
})
