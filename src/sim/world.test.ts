import { expect, test } from 'vitest'
import { SITE_REVEAL_DISTANCE } from './data'
import { CHAPTERS, advance, newGame, worldMapUnlocked, type GameEvent } from './game'

test('the World Map is generated from the seed: same seed, same map; another seed, another map', () => {
  expect(newGame(7).worldMap).toEqual(newGame(7).worldMap)
  expect(newGame(7).worldMap).not.toEqual(newGame(8).worldMap)
  expect(newGame(7).worldMap.length).toBeGreaterThan(0)
})

test('a new World Map has every kind of Site, with only the nearby ones revealed and none reached yet', () => {
  for (const seed of [1, 2, 3, 42, 1790000000000]) {
    const map = newGame(seed).worldMap
    expect(new Set(map.map((s) => s.kind))).toEqual(new Set(['deposit', 'ruin', 'land', 'city']))
    const revealed = map.filter((s) => s.discovery === 'revealed')
    expect(revealed.length).toBeGreaterThan(0)
    expect(revealed.length).toBeLessThan(map.length / 2) // mostly fog
    for (const s of map) {
      expect(s.discovery).not.toBe('reached')
      expect(s.discovery === 'revealed').toBe(s.distance <= SITE_REVEAL_DISTANCE)
      expect(s.distance).toBeGreaterThanOrEqual(1)
    }
  }
})

test('the World Map stays locked until the Beyond the Walls Chapter is complete, then opens with an event', () => {
  let g = newGame(1)
  g.chapter = 3 // Founding, New Faces and Mastery done
  g.plots[0]!.level = 4 // Objective: Town Hall level 4
  g.stock.ore = 49
  g.plots[3] = { type: 'mine', level: 1 } // Objective: build a Mine
  expect(CHAPTERS[3].name).toBe('Beyond the Walls')
  g = advance(g, 1)
  expect(worldMapUnlocked(g)).toBe(false) // still short of 50 Ore

  g.stock.ore = 50
  const ev: GameEvent[] = []
  g = advance(g, 1, ev)
  expect(worldMapUnlocked(g)).toBe(true)
  expect(ev).toContainEqual({ kind: 'worldMap' })
})
