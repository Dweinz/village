// Save format. Pure: the caller supplies the wall-clock time and does the storage I/O (ADR 0001).
import type { Game } from './game'

export interface Save { game: Game; savedAt: number }

export const SAVE_KEY = 'hearthhold-save' // where the app keeps the save in localStorage

type Migration = (game: any) => any // old save shapes aren't typed

/** MIGRATIONS[i] turns a version i+1 game into version i+2. Append one whenever the shape of Game changes. */
export const MIGRATIONS: Migration[] = [
  (game) => game, // v1 → v2: v1 saves had no version number; the game shape is unchanged
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
