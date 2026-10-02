// Setup for *.test.tsx (the rendered App in jsdom).
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import type { Scene as RealScene } from '../Scene'

// WebGL isn't available in jsdom: stand in for the diorama with one button per Plot, same onSelect contract.
vi.mock('../Scene', (): { Scene: typeof RealScene } => ({
  Scene: ({ game, onSelect }) => (
    <nav aria-label="Settlement">{game.plots.map((_, i) => <button key={i} onClick={() => onSelect(i)}>Plot {i + 1}</button>)}</nav>
  ),
}))

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  localStorage.clear()
})
