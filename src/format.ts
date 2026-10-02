// Number and time formatting for the UI.
import type { Game } from './sim/game'

export const fmt = (n: number) => (n < 1000 ? Math.floor(n).toString() : n < 1e6 ? (n / 1e3).toFixed(1) + 'k' : (n / 1e6).toFixed(1) + 'M')
export const dur = (s: number) => (s < 60 ? `${Math.ceil(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`)

// How UI components run a player action: the App applies it and shows any Error as a toast.
export type Act = (fn: (g: Game) => Game) => void
