import { expect, test } from 'vitest'
import { BUILDINGS, KEYSTONE_SLOTS, TALENT_LINKS, TALENTS, WORLD_MAP_CHAPTER, webPosition, type TalentDef, type TalentId, type TalentRegion } from './data'

// The shape of the whole Talent Tree web, read from data.
const ids = Object.keys(TALENTS) as TalentId[]
const def = (id: TalentId): TalentDef => TALENTS[id]
const neighbours = (id: string) => TALENT_LINKS.flatMap(([a, b]) => (a === id ? [b] : b === id ? [a] : []))
const REGIONS: TalentRegion[] = ['wayfinding', 'industry', 'stewardship']
const TYPICAL_RUN_POINTS = 28 // a typical run earns about 25–30 Talent Points (#15)

test('the web holds about 50–60 Minor and Notable Talents across the three regions', () => {
  expect(ids.length).toBeGreaterThanOrEqual(50)
  expect(ids.length).toBeLessThanOrEqual(60)
  for (const id of ids) expect(['minor', 'notable'], id).toContain(def(id).kind) // Keystones come later (#20)
  for (const r of REGIONS) expect(ids.filter((id) => def(id).region === r).length, r).toBeGreaterThanOrEqual(15)
  expect(ids.filter((id) => def(id).kind === 'notable').length).toBeGreaterThanOrEqual(10)
})

test('every link joins two known Talents (or the centre), once', () => {
  const seen = new Set<string>()
  for (const [a, b] of TALENT_LINKS) {
    expect(a === 'centre' || a in TALENTS, a).toBe(true)
    expect(b in TALENTS, b).toBe(true)
    const key = [a, b].sort().join('-')
    expect(seen.has(key), key).toBe(false)
    seen.add(key)
  }
})

test('every Talent can be reached from the centre', () => {
  const reached = new Set<string>(['centre'])
  for (let frontier = ['centre']; frontier.length;) frontier = frontier.flatMap(neighbours).filter((n) => !reached.has(n) && reached.add(n))
  expect(ids.filter((id) => !reached.has(id))).toEqual([])
})

test('a few paths link neighbouring regions', () => {
  const crossings = TALENT_LINKS.flatMap(([a, b]) => (a !== 'centre' && def(a).region !== def(b).region ? [[a, b] as const] : []))
  const pairs = new Set(crossings.map(([a, b]) => [def(a).region, def(b).region].sort().join('-')))
  expect(pairs.size).toBe(3) // every pair of regions
  expect(crossings.length).toBeLessThanOrEqual(6)
})

test('every Talent, and every Keystone slot, has its own spot on the web', () => {
  const spots = [
    { name: 'centre', x: 0, y: 0 },
    ...ids.map((id) => ({ name: id, ...webPosition(def(id).region, def(id).at) })),
    ...REGIONS.map((r) => ({ name: `${r} keystone`, ...webPosition(r, KEYSTONE_SLOTS[r].at) })),
  ]
  for (const [i, a] of spots.entries()) {
    for (const b of spots.slice(i + 1)) expect(Math.hypot(a.x - b.x, a.y - b.y), `${a.name} and ${b.name}`).toBeGreaterThan(0.5)
  }
  for (const r of REGIONS) for (const id of KEYSTONE_SLOTS[r].from) expect(def(id).region, id).toBe(r)
})

test('a typical run fills about half the web, and most of it goes on finishing any one region', () => {
  const share = TYPICAL_RUN_POINTS / ids.length
  expect(share).toBeGreaterThan(0.45)
  expect(share).toBeLessThan(0.6)
  for (const r of REGIONS) expect(ids.filter((id) => def(id).region === r).length, r).toBeGreaterThan(0.6 * TYPICAL_RUN_POINTS)
})

// Levers whose features open with the World Map: Expeditions (and the Injuries they cause), Outposts, Trade Routes, Ruins.
const WORLD_KEYS: (keyof TalentDef)[] = ['expedition', 'expeditionSpeed', 'expeditionCost', 'party', 'injuryChance', 'injuryTime', 'trade', 'tradeRate', 'reputation', 'rareYield']
const TAVERN_KEYS: (keyof TalentDef)[] = ['hireCost', 'recruits', 'traitChance']

test('Talents for later features declare the Chapter that opens them', () => {
  for (const id of ids) {
    const t = def(id)
    if (WORLD_KEYS.some((k) => t[k] !== undefined)) expect(t.chapter, id).toBeGreaterThanOrEqual(WORLD_MAP_CHAPTER)
    if (TAVERN_KEYS.some((k) => t[k] !== undefined)) expect(t.chapter, id).toBeGreaterThanOrEqual(BUILDINGS.tavern.chapter)
    const opens = (t.workplaces ?? []).map((w) => (w === 'outpost' || w === 'trade' ? WORLD_MAP_CHAPTER : BUILDINGS[w].chapter))
    if (opens.length) expect(t.chapter, id).toBeGreaterThanOrEqual(Math.min(...opens)) // useful once its first Workplace opens
  }
})
