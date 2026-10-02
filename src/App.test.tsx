import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { assign, build, newGame } from './sim/game'
import { SITE_KINDS } from './sim/data'
import { SAVE_KEY, toSave } from './sim/save'

beforeEach(() => { vi.useFakeTimers({ now: new Date('2026-10-02T12:00:00Z') }) })

const passTime = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
// The amount in a good's accessible name, e.g. "Wood 20" → "20"
const amount = (good: string, scope: Pick<typeof screen, 'getByLabelText'> = screen) =>
  scope.getByLabelText(new RegExp(`^${good} `)).getAttribute('aria-label')!.slice(good.length + 1)

test('assigning a Villager to a Production Job grows the Stockpile on screen', () => {
  const game = newGame(1)
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  expect(amount('Wood')).toBe('20')

  fireEvent.click(screen.getByRole('button', { name: 'Plot 3' })) // the starting Lumber Camp
  const picker = screen.getByRole('combobox', { name: 'Assign a Villager to Chop Wood' })
  const villager = within(picker).getByRole('option', { name: `${game.villagers[0].name} (Lv 1)` }) as HTMLOptionElement
  fireEvent.change(picker, { target: { value: villager.value } })

  passTime(60_000)
  expect(Number(amount('Wood'))).toBeGreaterThan(20)
})

test('returning after two hours shows the Report of Offline Progress, and Continue dismisses it', () => {
  const twoHoursAgo = Date.now() - 2 * 3600_000
  localStorage.setItem(SAVE_KEY, toSave(assign(newGame(1), 1, 2, 'chop'), twoHoursAgo))
  render(<App />)

  const report = screen.getByRole('dialog', { name: 'While you were away' })
  expect(within(report).getByRole('heading', { name: '2h 0m' })).toBeTruthy()
  expect(amount('Wood', within(report))).toMatch(/^\+/) // Wood gained while away

  fireEvent.click(within(report).getByRole('button', { name: 'Continue' }))
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('a corrupt save starts a new game instead of crashing', () => {
  localStorage.setItem(SAVE_KEY, '{"game": {"stock"')
  render(<App />)
  expect(screen.getByRole('heading', { name: 'Founding' })).toBeTruthy()
  expect(amount('Gold')).toBe('30')
})

test('trying to unassign a Villager mid-Contract shows why, and they keep working it', () => {
  const game = newGame(1)
  game.plots[0]!.level = 2 // unlocks Settle a Dispute at the Town Hall
  const name = game.villagers[0].name
  localStorage.setItem(SAVE_KEY, toSave(assign(game, game.villagers[0].id, 0, 'dispute'), Date.now()))
  render(<App />)

  fireEvent.click(screen.getByRole('button', { name: 'Plot 1' }))
  fireEvent.click(screen.getByRole('button', { name: `Unassign ${name}` }))

  expect(screen.getByText(`${name} is busy with a Contract`)).toBeTruthy()
  expect(screen.getByRole('button', { name: `Unassign ${name}` })).toBeTruthy() // still on the Plot panel
  expect(screen.getByRole('contentinfo').textContent).toContain('Settle a Dispute') // Roster shows the Contract
})

test('demolishing a House asks first, then empties the Plot and refunds half its cost', () => {
  const game = newGame(1)
  game.stock.wood = 100
  localStorage.setItem(SAVE_KEY, toSave(build(game, 3, 'house'), Date.now())) // House on Plot 4, 70 Wood left
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'Plot 4' }))
  expect(screen.getByText(/get back/).textContent).toContain('15') // half of 30 Wood

  const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
  fireEvent.click(screen.getByRole('button', { name: 'Demolish' }))
  expect(screen.getByRole('heading', { name: /House/ })).toBeTruthy() // said no: still standing

  fireEvent.click(screen.getByRole('button', { name: 'Demolish' }))
  expect(confirm).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('heading', { name: 'Empty Plot' })).toBeTruthy()
  expect(amount('Wood')).toBe('85')
})

test('the World Map opens once unlocked: revealed Sites can be inspected, the rest is fog', () => {
  const locked = newGame(1)
  locked.chapter = 3
  localStorage.setItem(SAVE_KEY, toSave(locked, Date.now()))
  const { unmount } = render(<App />)
  expect(screen.queryByRole('button', { name: 'World Map' })).toBeNull()
  unmount()

  const game = newGame(1)
  game.chapter = 4 // Beyond the Walls complete
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))

  const map = screen.getByRole('region', { name: 'World Map' })
  const revealed = game.worldMap.filter((s) => s.discovery === 'revealed')
  const sites = within(map).getAllByRole('button', { name: /distance/ })
  expect(sites).toHaveLength(revealed.length) // hidden Sites stay under the fog
  expect(within(map).getByText(`${game.worldMap.length - revealed.length} Sites hidden in the fog`)).toBeTruthy()

  fireEvent.click(sites[0])
  const site = revealed[0]
  const panel = screen.getByRole('complementary', { name: SITE_KINDS[site.kind].name })
  expect(within(panel).getByText(`Distance ${site.distance}`)).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Settlement' }))
  expect(screen.queryByRole('region', { name: 'World Map' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Plot 1' })).toBeTruthy()
})

test('completing Beyond the Walls announces the World Map and shows the button to open it', () => {
  const game = newGame(1)
  Object.assign(game, { chapter: 3 })
  game.plots[0]!.level = 4
  game.plots[3] = { type: 'mine', level: 1 }
  game.stock.ore = 50 // every Objective of Beyond the Walls is met
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  expect(screen.queryByRole('button', { name: 'World Map' })).toBeNull()

  passTime(1000)
  expect(screen.getByText(/The World Map is open/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'World Map' })).toBeTruthy()
})
