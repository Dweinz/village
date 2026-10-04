// Save format. Pure: the caller supplies the wall-clock time and does the storage I/O (ADR 0001).
import type { Game } from './game'
import { BUILDINGS, UPGRADE_SCALE, isRare, type Bag, type BuildingType, type Res } from './data'
import { generateWorldMap, withMaterials, withReputation } from './world'

export interface Save { game: Game; savedAt: number }

export const SAVE_KEY = 'hearthhold-save' // where the app keeps the save in localStorage

type Migration = (game: any) => any // old save shapes aren't typed

/** MIGRATIONS[i] turns a version i+1 game into version i+2. Append one whenever the shape of Game changes. */
export const MIGRATIONS: Migration[] = [
  (game) => game, // v1 → v2: v1 saves had no version number; the game shape is unchanged
  (game) => ({ // v2 → v3: a Villager's optional `job` became their one `activity`
    ...game,
    villagers: game.villagers.map(({ job, ...v }: { job?: object }) => (job ? { ...v, activity: { kind: 'job', ...job } } : v)),
  }),
  (game) => ({ ...game, worldMap: generateWorldMap(game.seed) }), // v3 → v4: the World Map, from the save's current seed
  (game) => ({ ...game, expeditions: [] }), // v4 → v5: Expeditions (none under way in older saves)
  (game) => ({ // v5 → v6: Rare Materials in the Stockpile and on each Resource Deposit
    ...game,
    stock: { crystal: 0, spice: 0, silk: 0, ...game.stock },
    worldMap: withMaterials(game.worldMap),
  }),
  (game) => ({ ...game, worldMap: withReputation(game.worldMap) }), // v6 → v7: every Foreign City's Reputation, from zero
  (game) => ({ // v7 → v8: the starting Farm and Lumber Camp came free. A Farm on Plot 1 and a Lumber Camp on Plot 2,
    // at any level, are taken to be the starting ones: a save can't tell them from a same-type rebuild on the same Plot.
    // The layout is written out here rather than read from newGame, so this migration stays as it was if newGame changes.
    ...game,
    plots: game.plots.map((p: { type: string } | null, i: number) => (p && ((i === 1 && p.type === 'farm') || (i === 2 && p.type === 'lumbercamp')) ? { ...p, free: true } : p)),
  }),
  (game) => ({ ...game, renown: 0, renownRank: 0, talentPoints: 0, talents: [] }), // v8 → v9: Renown and the Talent Tree, from nothing
  (game) => ({ // v9 → v10: each Building remembers what was paid for it. Until now every level cost its list price, but a
    // `free` level 1 cost nothing, nor did the Town Hall's (Plot 0, placed by newGame like the starting Farm and Lumber Camp).
    ...game,
    plots: game.plots.map((p: { type: BuildingType; level: number; free?: true } | null, i: number) =>
      p && { type: p.type, level: p.level, paid: listPricePaid(p.type, p.level, !!p.free || i === 0) }),
  }),
]

// The Gold and Materials paid for a Building before any Talent changed its costs (v9 → v10).
function listPricePaid(type: BuildingType, level: number, free: boolean) {
  const paid: Bag = {}
  for (let l = free ? 1 : 0; l < level; l++) {
    for (const [r, n] of Object.entries(BUILDINGS[type].cost)) if (!isRare(r as Res)) paid[r as Res] = (paid[r as Res] ?? 0) + Math.round(n * UPGRADE_SCALE ** l)
  }
  return paid
}

export const SAVE_VERSION = MIGRATIONS.length + 1

export const toSave = (game: Game, savedAt: number) => JSON.stringify({ version: SAVE_VERSION, savedAt, game })

/** Parses and migrates a save to the current version. Returns null for a corrupt, unknown or newer save. */
export function fromSave(text: string, migrations = MIGRATIONS): Save | null {
  try {
    const { version = 1, savedAt, game } = JSON.parse(text) ?? {}
    const known = Number.isInteger(version) && version >= 1 && version <= migrations.length + 1
    if (!game || !known || typeof savedAt !== 'number') return null
    return { game: migrations.slice(version - 1).reduce((g, migrate) => migrate(g), game), savedAt }
  } catch {
    return null
  }
}
