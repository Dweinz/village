import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { advance, assign, assignOutpost, build, buildOutpost, foreignCity, newGame, nextReputationTier, openTradeRoute, ruinLevel, sendExpedition, type GameEvent } from './sim/game'
import { FOREIGN_CITIES, REPUTATION_TIERS, RES_NAME, SITE_KINDS } from './sim/data'
import { SAVE_KEY, toSave } from './sim/save'
import { costText } from './format'

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
  expect(screen.queryByLabelText(/^Crystal /)).toBeNull() // no Rare Materials in the top bar before the World Map
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

const mapGame = () => {
  const game = newGame(1)
  game.chapter = 4 // World Map unlocked
  Object.assign(game.stock, { gold: 500, wood: 500, stone: 0, food: 500, ore: 0 })
  return game
}

test('sending an Expedition from a Site: pick a party, see the odds, and hear back when it returns', () => {
  const game = mapGame()
  const [ada] = game.villagers
  const site = game.worldMap.find((s) => s.discovery === 'revealed')!
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: `${SITE_KINDS[site.kind].name}, distance ${site.distance}` }))

  const panel = screen.getByRole('complementary', { name: SITE_KINDS[site.kind].name })
  fireEvent.click(within(panel).getByRole('checkbox', { name: new RegExp(`^${ada.name}`) }))
  expect(within(panel).getByText(/% chance/)).toBeTruthy()
  fireEvent.click(within(panel).getByRole('button', { name: 'Send Expedition' }))

  expect(screen.getByRole('contentinfo').textContent).toContain('Away on an Expedition')
  const underway = screen.getByRole('list', { name: 'Expeditions' })
  expect(within(underway).getByText(new RegExp(ada.name))).toBeTruthy()

  passTime(site.distance * 90_000 + 1000)
  expect(screen.getByText(new RegExp(`${ada.name} (reached a ${SITE_KINDS[site.kind].name}|came home empty-handed)`))).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Expeditions' })).toBeNull()
  expect(screen.getByRole('contentinfo').textContent).not.toContain('Away on an Expedition')
})

test('exploring the fog from the map, then recalling the party before it gets there', () => {
  const game = mapGame()
  const [ada] = game.villagers
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: 'Explore the fog' }))

  const panel = screen.getByRole('complementary', { name: 'Explore the fog' })
  fireEvent.click(within(panel).getByRole('checkbox', { name: new RegExp(`^${ada.name}`) }))
  fireEvent.click(within(panel).getByRole('button', { name: 'Send Expedition' }))
  const gold = amount('Gold')

  fireEvent.click(within(screen.getByRole('list', { name: 'Expeditions' })).getByRole('button', { name: `Recall ${ada.name}` }))
  expect(screen.queryByRole('list', { name: 'Expeditions' })).toBeNull()
  expect(screen.getByRole('contentinfo').textContent).not.toContain('Away on an Expedition')
  expect(amount('Gold')).toBe(gold) // no refund
})

test('an Expedition that returned while the game was closed is in the Report', () => {
  const game = mapGame()
  const [ada] = game.villagers
  const twoHoursAgo = Date.now() - 2 * 3600_000
  localStorage.setItem(SAVE_KEY, toSave(sendExpedition(game, [ada.id], { kind: 'explore' }), twoHoursAgo))
  render(<App />)
  const report = screen.getByRole('dialog', { name: 'While you were away' })
  expect(within(report).getByText(new RegExp(`${ada.name} (found a|came home empty-handed)`))).toBeTruthy()
})

test('the party picker says what is missing when the Stockpile cannot pay for the Expedition', () => {
  const game = mapGame()
  game.stock.food = 0
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: 'Explore the fog' }))
  const panel = screen.getByRole('complementary', { name: 'Explore the fog' })
  fireEvent.click(within(panel).getByRole('checkbox', { name: new RegExp(`^${game.villagers[0].name}`) }))
  expect(within(panel).getByText('Not enough Food')).toBeTruthy()
  expect((within(panel).getByRole('button', { name: 'Send Expedition' }) as HTMLButtonElement).disabled).toBe(true)
})

test('an Injured Villager shows their recovery time in the Roster and cannot join a Party', () => {
  const game = mapGame()
  const [ada] = game.villagers
  ada.activity = { kind: 'injured', recoversAt: game.time + 250 }
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  expect(screen.getByRole('contentinfo').textContent).toContain('Injured · 4m 10s')

  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: 'Explore the fog' }))
  const pick = screen.getByRole('checkbox', { name: new RegExp(`^${ada.name}`) }) as HTMLInputElement
  expect(pick.disabled).toBe(true)
  expect(pick.closest('label')!.textContent).toContain('Injured · 4m 10s')
})

test('injuries and recoveries while the game was closed are in the Report', () => {
  const game = mapGame()
  const [ada, bo] = game.villagers
  ada.activity = { kind: 'injured', recoversAt: game.time + 60 }
  bo.activity = { kind: 'injured', recoversAt: game.time + 60 }
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now() - 3600_000))
  render(<App />)
  const report = screen.getByRole('dialog', { name: 'While you were away' })
  expect(within(report).getByText(`💪 ${ada.name} has recovered`)).toBeTruthy()
  expect(within(report).getByText(`💪 ${bo.name} has recovered`)).toBeTruthy()
})

test('a Villager hurt on a failed Expedition while the game was closed shows up Injured in the Report', () => {
  for (let seed = 1; seed < 400; seed++) {
    const game = mapGame()
    game.seed = seed
    const sent = sendExpedition(game, [1, 2, 3], { kind: 'explore' })
    const back = advance(sent, sent.expeditions[0].duration)
    const hurt = back.villagers.find((v) => v.activity?.kind === 'injured')
    if (!hurt) continue // this seed's Party came home unhurt
    localStorage.setItem(SAVE_KEY, toSave(sent, Date.now() - (sent.expeditions[0].duration + 5) * 1000))
    render(<App />)
    const report = screen.getByRole('dialog', { name: 'While you were away' })
    expect(within(report).getByText(`🩹 ${hurt.name} came back Injured`)).toBeTruthy()
    expect(screen.getByRole('contentinfo').textContent).toContain('Injured · ')
    return
  }
  throw new Error('no seed produced an injury')
})

test('building and staffing an Outpost on a reached deposit fills the Stockpile with its Rare Material', () => {
  const game = mapGame()
  Object.assign(game.stock, { stone: 200 })
  const site = game.worldMap.find((s) => s.kind === 'deposit')!
  site.discovery = 'reached'
  const material = RES_NAME[site.material!]
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  expect(amount(material)).toBe('0') // Rare Materials show in the top bar once the World Map is open

  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^Resource Deposit, distance ${site.distance}`) }))
  const panel = screen.getByRole('complementary', { name: 'Resource Deposit' })
  expect(within(panel).getByText(new RegExp(`Yields .*${material}`))).toBeTruthy()
  fireEvent.click(within(panel).getByRole('button', { name: 'Build Outpost' }))

  const picker = within(panel).getByRole('combobox', { name: 'Assign a Villager to the Outpost' })
  fireEvent.change(picker, { target: { value: String(game.villagers[0].id) } })
  expect(screen.getByRole('contentinfo').textContent).toContain(`Work the ${material} Deposit`)

  passTime(200_000)
  expect(Number(amount(material))).toBeGreaterThan(0)
})

test('Rare Materials gathered at an Outpost while the game was closed are in the Report', () => {
  const game = mapGame()
  Object.assign(game.stock, { stone: 200 })
  const site = game.worldMap.find((s) => s.kind === 'deposit')!
  site.discovery = 'reached'
  const staffed = assignOutpost(buildOutpost(game, site.id), game.villagers[0].id, site.id)
  localStorage.setItem(SAVE_KEY, toSave(staffed, Date.now() - 3600_000))
  render(<App />)
  const report = screen.getByRole('dialog', { name: 'While you were away' })
  expect(amount(RES_NAME[site.material!], within(report))).toMatch(/^\+/)
})

const ruinGame = () => {
  const game = mapGame()
  const ruin = game.worldMap.find((s) => s.kind === 'ruin')!
  ruin.discovery = 'reached'
  for (const v of game.villagers) v.level = 20
  return { game, ruin }
}

test("a reached Ruin's panel shows its level requirement, risk and reward, and sends a Party in", () => {
  const { game, ruin } = ruinGame()
  game.villagers[1].level = 1
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: `Ruin, distance ${ruin.distance}` }))

  const panel = screen.getByRole('complementary', { name: 'Ruin' })
  expect(within(panel).getByText(`Every Party member level ${ruinLevel(ruin)}+`)).toBeTruthy()
  expect(within(panel).getByText(/Injury/)).toBeTruthy()
  expect(within(panel).getByText(/Reward/).textContent).toMatch(/🪙 \d+ .*🔮/)

  fireEvent.click(within(panel).getByRole('checkbox', { name: new RegExp(`^${game.villagers[1].name}`) }))
  expect(within(panel).getByText(`Every member of the Party must be level ${ruinLevel(ruin)} or higher`)).toBeTruthy()
  fireEvent.click(within(panel).getByRole('checkbox', { name: new RegExp(`^${game.villagers[1].name}`) }))
  fireEvent.click(within(panel).getByRole('checkbox', { name: new RegExp(`^${game.villagers[0].name}`) }))
  fireEvent.click(within(panel).getByRole('button', { name: 'Send Expedition' }))
  expect(within(screen.getByRole('list', { name: 'Expeditions' })).getByText(/into the Ruin/)).toBeTruthy()
})

test('a Ruin cleared while the game was closed is in the Report, and its panel shows it cleared', () => {
  for (let seed = 1; seed < 200; seed++) {
    const { game, ruin } = ruinGame()
    game.seed = seed
    const sent = sendExpedition(game, [1, 2, 3], { kind: 'ruin', site: ruin.id })
    const ev: GameEvent[] = []
    advance(sent, sent.expeditions[0].duration, ev)
    if (!ev.some((e) => e.kind === 'ruinCleared')) continue // this seed's Party failed
    localStorage.setItem(SAVE_KEY, toSave(sent, Date.now() - (sent.expeditions[0].duration + 5) * 1000))
    render(<App />)
    const report = screen.getByRole('dialog', { name: 'While you were away' })
    expect(within(report).getByText(/cleared a Ruin/)).toBeTruthy()
    fireEvent.click(within(report).getByRole('button', { name: 'Continue' }))

    fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
    fireEvent.click(screen.getByRole('button', { name: `Ruin, distance ${ruin.distance}, cleared` }))
    const panel = screen.getByRole('complementary', { name: 'Ruin' })
    expect(within(panel).getByText('Cleared')).toBeTruthy()
    expect(within(panel).queryByRole('button', { name: 'Send Expedition' })).toBeNull()
    return
  }
  throw new Error('no seed cleared the Ruin')
})

const cityGame = () => {
  const game = mapGame()
  const city = game.worldMap.find((s) => s.kind === 'city')!
  city.discovery = 'reached'
  return { game, city, rates: foreignCity(game, city.id) }
}

test("a Foreign City's rates show only once it is reached", () => {
  const { game, city, rates } = cityGame()
  city.discovery = 'revealed'
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: `Foreign City, distance ${city.distance}` }))
  const panel = screen.getByRole('complementary', { name: 'Foreign City' })
  expect(within(panel).queryByText(rates.name)).toBeNull()
  expect(within(panel).queryByText(/Buys/)).toBeNull()
})

test('opening a Trade Route with a reached Foreign City swaps goods each cycle until it is closed', () => {
  const { game, city, rates } = cityGame()
  const [ada] = game.villagers
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: `Foreign City, distance ${city.distance}` }))
  const panel = screen.getByRole('complementary', { name: 'Foreign City' })
  expect(within(panel).getByText(rates.name)).toBeTruthy()
  expect(within(panel).getByText(/Buys/).textContent).toContain(`🪵 ${rates.buys.wood}`)
  expect(within(panel).getByText(/Sells/).textContent).toContain(`🔮 ${rates.sells.crystal}`)

  fireEvent.change(within(panel).getByRole('combobox', { name: 'Trader' }), { target: { value: String(ada.id) } })
  fireEvent.change(within(panel).getByRole('combobox', { name: 'Send' }), { target: { value: 'wood' } })
  fireEvent.change(within(panel).getByRole('combobox', { name: 'Receive' }), { target: { value: 'crystal' } })
  fireEvent.click(within(panel).getByRole('button', { name: 'Open Trade Route' }))
  expect(screen.getByRole('contentinfo').textContent).toContain(`Trade Route to ${rates.name}`)

  passTime(120_000)
  expect(Number(amount('Crystal'))).toBeGreaterThan(0)
  expect(Number(amount('Wood'))).toBeLessThan(500)

  fireEvent.click(within(panel).getByRole('button', { name: `Close ${ada.name}'s Trade Route` }))
  expect(screen.getByRole('contentinfo').textContent).not.toContain('Trade Route')
  const crystal = amount('Crystal')
  passTime(120_000)
  expect(amount('Crystal')).toBe(crystal)
})

test('a Trade Route that cannot pay stalls and says so, and Villagers who are away are not offered as traders', () => {
  const { game, city } = cityGame()
  const [ada, bo] = game.villagers
  game.stock.wood = 0
  const away = sendExpedition(game, [bo.id], { kind: 'explore' })
  localStorage.setItem(SAVE_KEY, toSave(openTradeRoute(away, ada.id, city.id, 'wood', 'crystal'), Date.now()))
  render(<App />)
  passTime(120_000)
  expect(amount('Crystal')).toBe('0')
  expect(amount('Wood')).toBe('0')

  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: `Foreign City, distance ${city.distance}` }))
  const panel = screen.getByRole('complementary', { name: 'Foreign City' })
  expect(within(panel).getByText(/waiting for Wood/)).toBeTruthy()
  const traders = within(within(panel).getByRole('combobox', { name: 'Trader' })).getAllByRole('option').map((o) => o.textContent)
  expect(traders.some((t) => t!.startsWith(bo.name))).toBe(false) // away on an Expedition
  expect(traders.some((t) => t!.startsWith(ada.name))).toBe(false) // already trading
})

test('goods traded while the game was closed are totalled in the Report', () => {
  const { game, city, rates } = cityGame()
  const [ada] = game.villagers
  localStorage.setItem(SAVE_KEY, toSave(openTradeRoute(game, ada.id, city.id, 'wood', 'crystal'), Date.now() - 600_000))
  render(<App />)
  const report = screen.getByRole('dialog', { name: 'While you were away' })
  const line = within(report).getByText(/Trade Routes sent/)
  expect(line.textContent).toMatch(/sent 🪵 \d+, received 🔮 \d+/)
  expect(within(report).queryByText(new RegExp(`traded at ${rates.name}`))).toBeNull() // totalled, not one line per cycle
})

test("a reached Foreign City's panel shows its Reputation, its tier and what the next tier unlocks", () => {
  const { game, city, rates } = cityGame()
  city.reputation = 5
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: `Foreign City, distance ${city.distance}` }))
  const panel = screen.getByRole('complementary', { name: 'Foreign City' })
  const card = within(panel).getByRole('region', { name: 'Reputation' })
  expect(card.textContent).toContain(`Reputation 5 · ${REPUTATION_TIERS[0].name}`)
  expect(within(card).getByText(/Next/).textContent).toBe(`Next: ${REPUTATION_TIERS[1].name} at ${REPUTATION_TIERS[1].reputation}`)
  const next = nextReputationTier(game, city.id)!
  expect(within(card).getByText(/^Then sells/).textContent).toContain(costText(next.sells))
  const def = FOREIGN_CITIES.find((c) => c.name === rates.name)!
  expect(within(card).getByText(/Then also buys/).textContent).toContain(Object.keys(def.unlocks[1].buys!).map((r) => RES_NAME[r as keyof typeof RES_NAME]).join(', '))
})

test('a Foreign City at the top tier says so', () => {
  const { game, city } = cityGame()
  city.reputation = REPUTATION_TIERS[REPUTATION_TIERS.length - 1].reputation
  localStorage.setItem(SAVE_KEY, toSave(game, Date.now()))
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'World Map' }))
  fireEvent.click(screen.getByRole('button', { name: `Foreign City, distance ${city.distance}` }))
  const card = screen.getByRole('region', { name: 'Reputation' })
  expect(card.textContent).toContain(REPUTATION_TIERS[REPUTATION_TIERS.length - 1].name)
  expect(card.textContent).toContain('highest tier')
})

test('reaching a Reputation Tier shows a notification', () => {
  const { game, city, rates } = cityGame()
  city.reputation = REPUTATION_TIERS[1].reputation - 1
  localStorage.setItem(SAVE_KEY, toSave(openTradeRoute(game, game.villagers[0].id, city.id, 'wood', 'crystal'), Date.now()))
  render(<App />)
  const text = `🤝 Reputation with ${rates.name} rose to ${REPUTATION_TIERS[1].name}`
  for (let s = 0; s < 60 && !screen.queryByText(text); s++) passTime(1000) // a toast only stays up a few seconds
  expect(screen.getByText(text)).toBeTruthy()
})

test('a Reputation Tier reached while the game was closed is in the Report', () => {
  const { game, city, rates } = cityGame()
  city.reputation = REPUTATION_TIERS[1].reputation - 1
  localStorage.setItem(SAVE_KEY, toSave(openTradeRoute(game, game.villagers[0].id, city.id, 'wood', 'crystal'), Date.now() - 600_000))
  render(<App />)
  const report = screen.getByRole('dialog', { name: 'While you were away' })
  expect(within(report).getByText(`🤝 Reputation with ${rates.name} rose to ${REPUTATION_TIERS[1].name}`)).toBeTruthy()
})
