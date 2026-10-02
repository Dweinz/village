// Shared setup for sim tests.
import type { Game } from './game'

/** Plenty of every good, so costs never get in the way of what a test is about. */
export const rich = (g: Game) => { g.stock = { gold: 5000, wood: 5000, stone: 0, food: 5000, ore: 0 }; return g }
