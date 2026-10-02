import { expect, test } from 'vitest'
import { rich } from './test-helpers'
import { INJURY_SECONDS } from './data'
import { advance, assign, newGame, sendExpedition, unassign, type Game, type GameEvent } from './game'


// Sends all three Villagers to explore and plays until they are back. Returns the game and what happened.
const failedExpedition = (seed: number) => {
  let g = sendExpedition(rich(newGame(seed)), [1, 2, 3], { kind: 'explore' })
  const ev: GameEvent[] = []
  g = advance(g, g.expeditions[0].duration, ev)
  return ev.some((e) => e.kind === 'expeditionFailed') ? { g, ev } : null
}
const failures = Array.from({ length: 400 }, (_, i) => failedExpedition(i + 1)).filter((f) => f !== null).slice(0, 25)

test('a failed Expedition can leave each of its Party Injured, but never loses a Villager', () => {
  expect(failures.length).toBeGreaterThan(5)
  const seen = new Set<string>()
  for (const { g, ev } of failures) {
    expect(g.villagers).toHaveLength(3)
    for (const v of g.villagers) {
      const injured = v.activity?.kind === 'injured'
      seen.add(injured ? 'injured' : 'fine')
      expect(ev.some((e) => e.kind === 'injured' && e.name === v.name)).toBe(injured)
    }
  }
  expect(seen).toEqual(new Set(['injured', 'fine']))
})

test('an Injured Villager can be called on for nothing until they recover on their own, offline too', () => {
  const { g: hurt } = failures.find(({ g }) => g.villagers.some((v) => v.activity?.kind === 'injured'))!
  const v = hurt.villagers.find((x) => x.activity?.kind === 'injured')!
  expect(() => assign(hurt, v.id, 1, 'fields')).toThrow(`${v.name} is Injured`)
  expect(() => unassign(hurt, v.id)).toThrow(`${v.name} is Injured`)
  expect(() => sendExpedition(hurt, [v.id], { kind: 'explore' })).toThrow(`${v.name} is Injured`)

  const left = v.activity!.kind === 'injured' ? v.activity!.recoversAt - hurt.time : 0
  expect(advance(hurt, left - 1).villagers.find((x) => x.id === v.id)!.activity?.kind).toBe('injured') // not a moment early
  const ev: GameEvent[] = []
  const later = advance(hurt, INJURY_SECONDS, ev)
  expect(later.villagers.find((x) => x.id === v.id)!.activity).toBeUndefined()
  expect(ev).toContainEqual({ kind: 'recovered', name: v.name })
  expect(() => assign(later, v.id, 1, 'fields')).not.toThrow()
})

test('Offline Progress matches live play through a failed Expedition, the injuries and the recovery', () => {
  const seed = Array.from({ length: 400 }, (_, i) => i + 1).find((n) =>
    failedExpedition(n)?.g.villagers.some((v) => v.activity?.kind === 'injured'))!
  const start = sendExpedition(rich(newGame(seed)), [1, 2, 3], { kind: 'explore' })
  const span = start.expeditions[0].duration + INJURY_SECONDS + 5
  let live = start
  for (let i = 0; i < span; i++) live = advance(live, 1)
  expect(advance(start, span)).toEqual(live)
  expect(live.villagers.every((v) => v.activity === undefined)).toBe(true) // everyone home and recovered
})
