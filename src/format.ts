// Text formatting for the UI: numbers, durations, and what a Villager is doing.
import { RES_ICON, type Bag, type Res } from './sim/data'
import { activityName, recoveryLeft, type Game, type Villager } from './sim/game'

export const fmt = (n: number) => (n < 1000 ? Math.floor(n).toString() : n < 1e6 ? (n / 1e3).toFixed(1) + 'k' : (n / 1e6).toFixed(1) + 'M')
/** Like fmt, but keeps one decimal on small fractional amounts (Talents can make a load or Reputation 1.5). */
export const fmtTenths = (n: number) => (n < 1000 && !Number.isInteger(n) ? n.toFixed(1).replace(/\.0$/, '') : fmt(n))
export const dur = (s: number) => (s < 60 ? `${Math.ceil(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`)

/** What a Villager is doing, with the time left to recover if they're Injured, e.g. "Injured · 4m 10s". */
export function activityText(g: Game, v: Villager) {
  const left = recoveryLeft(g, v)
  return left === undefined ? activityName(g, v) : `${activityName(g, v)} · ${dur(left)}`
}

/** A cost as text, e.g. "🪵 60 🪨 30". */
export const costText = (bag: Bag) => Object.entries(bag).map(([r, n]) => `${RES_ICON[r as Res]} ${fmtTenths(n)}`).join(' ')

// How UI components run a player action: the App applies it and shows any Error as a toast.
export type Act = (fn: (g: Game) => Game) => void
