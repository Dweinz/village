// Shared setup for sim tests.
import { RESOURCES, type TalentId } from './data'
import { newGame, type Game } from './game'

/** Plenty of every good, so costs never get in the way of what a test is about. */
export const rich = (g: Game) => { for (const r of RESOURCES) g.stock[r] = 5000; return g }
/** Plenty of everything, and Villagers without Traits, so only Talents change the numbers. */
export const plain = (seed = 1) => { const g = rich(newGame(seed)); for (const v of g.villagers) v.traits = []; return g }
/** A copy of the game holding exactly these Talents. */
export const taking = (g: Game, ...talents: TalentId[]) => { const out = structuredClone(g); out.talents = talents; return out }
