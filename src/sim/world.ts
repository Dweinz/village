// The World Map: Sites around the Settlement, generated once from the seed.
import { RARE_MATERIALS, SITE_COUNTS, SITE_MAX_DISTANCE, SITE_NEAR_COUNT, SITE_REVEAL_DISTANCE, type RareMaterial, type SiteKind } from './data'
import { mulberry32 } from './random'

export type Discovery = 'hidden' | 'revealed' | 'reached'

export interface Site {
  id: number
  kind: SiteKind
  distance: number // from the Settlement; nearer Sites will be quicker and safer to reach by Expedition
  angle: number // radians, where the Site sits around the Settlement on the map
  discovery: Discovery
  material?: RareMaterial // what a Resource Deposit yields
  outpost?: { level: number } // built on a reached Resource Deposit
}

/**
 * Pure: the same seed always gives the same World Map. Salted, so its random stream differs from the game's.
 * Save v4 migrates old games with this function: before changing what it outputs, copy this version into
 * that migration (save.test.ts pins its output for the fixture save).
 */
export function generateWorldMap(seed: number): Site[] {
  let state = seed ^ 0x5eed5eed
  const rand = () => { const [value, next] = mulberry32(state); state = next; return value }

  const shuffle = <T,>(xs: T[]) => {
    for (let i = xs.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[xs[i], xs[j]] = [xs[j], xs[i]]
    }
    return xs
  }
  const kinds = shuffle((Object.entries(SITE_COUNTS) as [SiteKind, number][]).flatMap(([kind, n]) => Array<SiteKind>(n).fill(kind)))
  const sectors = shuffle(kinds.map((_, i) => i)) // each Site gets its own slice of the compass, so nearby ones don't bunch up
  return kinds.map((kind, i) => {
    const [lo, hi] = i < SITE_NEAR_COUNT ? [1, SITE_REVEAL_DISTANCE] : [SITE_REVEAL_DISTANCE + 1, SITE_MAX_DISTANCE]
    const distance = lo + Math.floor(rand() * (hi - lo + 1))
    const angle = Math.round((((sectors[i] + rand() * 0.6) / kinds.length) * 2 * Math.PI) * 100) / 100
    return { id: i + 1, kind, distance, angle, discovery: distance <= SITE_REVEAL_DISTANCE ? 'revealed' : 'hidden' }
  })
}

/** Gives each Resource Deposit its Rare Material, in turn by id, so every Rare Material is somewhere on the map. */
export const withMaterials = (map: Site[]): Site[] => {
  let n = 0
  return map.map((s) => (s.kind === 'deposit' ? { ...s, material: RARE_MATERIALS[n++ % RARE_MATERIALS.length] } : s))
}
