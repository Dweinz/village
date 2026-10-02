// Save format. Pure: the caller supplies the wall-clock time and does the storage I/O (ADR 0001).
import type { Game } from './game'
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
]

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
