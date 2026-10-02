// Shared setup for sim tests.
import { RESOURCES } from './data'
import type { Game } from './game'

/** Plenty of every good, so costs never get in the way of what a test is about. */
export const rich = (g: Game) => { for (const r of RESOURCES) g.stock[r] = 5000; return g }
