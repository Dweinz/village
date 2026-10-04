import { expect, test } from 'vitest'
import { EXPEDITION_MAX_PARTY, INJURY_SECONDS, OUTPOST_JOB, TALENTS, TRADE_JOB, type Res, type TalentBonus, type TalentDef, type TalentId, type Workplace } from './data'
import {
  OFFLINE_CAP, advance, assign, assignOutpost, build, buildCost, buildOutpost, demolishRefund, findJob, foreignCity, hire, hireCost, housing, maxParty,
  newGame, offlineCap, openTradeRoute, planExpedition, recoveryLeft, reroll, sendExpedition, speed, upgrade, type Game, type GameEvent,
} from './game'
import { rich } from './test-helpers'

// One test per kind of Talent bonus, each with a Talent from the web that pulls that lever.
const ids = Object.keys(TALENTS) as TalentId[]
const def = (id: TalentId): TalentDef => TALENTS[id]
/** A Talent that pulls this lever: everywhere, or only at `where`. Fails the test if the web has none. */
function talentWith(key: keyof TalentBonus, where?: Workplace): TalentId {
  const id = ids.find((id) => def(id)[key] !== undefined && (where ? def(id).workplaces?.includes(where) : !def(id).workplaces))
  if (!id) throw new Error(`No Talent pulls ${key}${where ? ` at ${where}` : ''}`)
  return id
}
const taking = (g: Game, ...talents: TalentId[]) => { const out = structuredClone(g); out.talents = talents; return out }
// Plenty of everything, and Villagers without Traits, so only Talents change the numbers.
const plain = (seed = 1) => { const g = rich(newGame(seed)); for (const v of g.villagers) v.traits = []; return g }
const explore = { kind: 'explore' } as const

test('a work speed Talent speeds up every Workplace, or only the ones it names', () => {
  const g = plain()
  const v = g.villagers[0]
  const chop = findJob('lumbercamp', 'chop')
  const cut = findJob('quarry', 'cut')
  const everywhere = taking(g, talentWith('speed'))
  const camps = taking(g, talentWith('speed', 'lumbercamp'))
  expect(speed(everywhere, v, 'quarry', cut)).toBeGreaterThan(speed(g, v, 'quarry', cut))
  expect(speed(camps, v, 'lumbercamp', chop)).toBeGreaterThan(speed(g, v, 'lumbercamp', chop))
  expect(speed(camps, v, 'quarry', cut)).toBe(speed(g, v, 'quarry', cut))
  expect(speed(taking(g, talentWith('speed', 'outpost')), v, 'outpost', OUTPOST_JOB)).toBeGreaterThan(speed(g, v, 'outpost', OUTPOST_JOB))
})

test('a yield Talent brings more Materials from each cycle, but no more Gold', () => {
  const g = assign(assign(plain(), 1, 2, 'chop'), 2, 0, 'taxes')
  const t = talentWith('yield')
  const before = g.stock
  const [base, skilled] = [advance(g, 120).stock, advance(taking(g, t), 120).stock]
  expect(skilled.wood - before.wood).toBeCloseTo((base.wood - before.wood) * (1 + def(t).yield!))
  expect(skilled.gold).toBe(base.gold)
})

test('a yield Talent for one Workplace leaves the others alone', () => {
  const g = assign(assign(plain(), 1, 2, 'chop'), 2, 1, 'fields')
  const skilled = advance(taking(g, talentWith('yield', 'lumbercamp')), 120).stock
  const base = advance(g, 120).stock
  expect(skilled.wood).toBeGreaterThan(base.wood)
  expect(skilled.food).toBe(base.food)
})

test('a Gold Talent brings more Gold from every Job', () => {
  const g = assign(plain(), 1, 0, 'taxes')
  const t = talentWith('gold')
  const earned = (g: Game) => advance(g, 120).stock.gold - g.stock.gold
  expect(earned(taking(g, t))).toBeCloseTo(earned(g) * (1 + def(t).gold!))
})

test('an XP Talent makes Villagers learn faster', () => {
  const g = assign(plain(), 1, 2, 'chop')
  const t = talentWith('xp')
  const learned = (g: Game) => advance(g, 120).renown // every bit of XP adds the same Renown, across level-ups
  expect(learned(taking(g, t))).toBeCloseTo(learned(g) * (1 + def(t).xp!))
})

test('an Expedition success Talent adds to every Party\'s chance', () => {
  const g = plain()
  const t = talentWith('expedition')
  expect(planExpedition(taking(g, t), [1], explore).chance).toBeCloseTo(planExpedition(g, [1], explore).chance + def(t).expedition!)
})

test('an Expedition cost Talent makes every Expedition cheaper', () => {
  const g = plain()
  const skilled = taking(g, talentWith('expeditionCost'))
  const [base, cheap] = [planExpedition(g, [1, 2], explore).cost, planExpedition(skilled, [1, 2], explore).cost]
  expect(cheap.food).toBeLessThan(base.food!)
  expect(cheap.gold).toBeLessThan(base.gold!)
  expect(g.stock.food - sendExpedition(skilled, [1, 2], explore).stock.food).toBeCloseTo(cheap.food!)
})

test('a Party size Talent lets one more Villager join an Expedition', () => {
  const g = plain()
  g.villagers.push({ ...structuredClone(g.villagers[0]), id: 99 })
  const four = [1, 2, 3, 99]
  expect(() => planExpedition(g, four, explore)).toThrow(`A party is at most ${EXPEDITION_MAX_PARTY} Villagers`)
  const skilled = taking(g, talentWith('party'))
  expect(maxParty(skilled)).toBe(EXPEDITION_MAX_PARTY + 1)
  expect(sendExpedition(skilled, four, explore).expeditions[0].party).toEqual(four)
})

// Sends all three Villagers on an Expedition that is sure to fail, and brings them home.
const failExpedition = (g: Game) => {
  const out = sendExpedition(g, [1, 2, 3], explore)
  out.expeditions[0].chance = 0
  return advance(out, out.expeditions[0].duration)
}
const injured = (g: Game) => g.villagers.filter((v) => v.activity?.kind === 'injured')

test('an Injury chance Talent leaves fewer of a failed Party Injured', () => {
  const t = talentWith('injuryChance')
  let [base, skilled] = [0, 0]
  for (let seed = 1; seed <= 60; seed++) {
    base += injured(failExpedition(plain(seed))).length
    skilled += injured(failExpedition(taking(plain(seed), t))).length
  }
  expect(base).toBeGreaterThan(30)
  expect(skilled).toBeLessThan(base * (1 - def(t).injuryChance! / 2)) // the same rolls, fewer of them under the lower chance
})

test('an Injury time Talent makes Injured Villagers recover sooner', () => {
  const t = talentWith('injuryTime')
  const seed = Array.from({ length: 50 }, (_, i) => i + 1).find((s) => injured(failExpedition(plain(s))).length)!
  const g = failExpedition(taking(plain(seed), t))
  expect(recoveryLeft(g, injured(g)[0])).toBeCloseTo(INJURY_SECONDS * (1 - def(t).injuryTime!))
})

test('an Upkeep Talent makes Villagers eat less', () => {
  const g = plain()
  const t = talentWith('upkeep')
  const eaten = (g: Game) => g.stock.food - advance(g, 100).stock.food
  expect(eaten(taking(g, t))).toBeCloseTo(eaten(g) * (1 - def(t).upkeep!))
})

test('a building cost Talent makes Buildings and their upgrades cheaper, and Demolishing refunds half of what was paid', () => {
  const g = plain()
  const skilled = taking(g, talentWith('buildCost'))
  expect(buildCost(skilled, 'house', 0).wood).toBeLessThan(buildCost(g, 'house', 0).wood!)
  expect(buildCost(skilled, 'townhall', 1).wood).toBeLessThan(buildCost(g, 'townhall', 1).wood!)
  const built = build(skilled, 3, 'house')
  expect(skilled.stock.wood - built.stock.wood).toBe(buildCost(skilled, 'house', 0).wood)
  expect(built.stock.wood - upgrade(built, 0).stock.wood).toBe(buildCost(skilled, 'townhall', 1).wood)
  expect(demolishRefund(built.plots[3]!).wood).toBe(Math.floor(buildCost(skilled, 'house', 0).wood! / 2))
})

test('Demolishing refunds half of what was paid, whatever building cost Talents are held by then', () => {
  const g = build(plain(), 3, 'house') // at list price
  expect(demolishRefund(taking(g, talentWith('buildCost')).plots[3]!)).toEqual({ wood: Math.floor(buildCost(g, 'house', 0).wood! / 2) })
})

test('no Talent makes the Rare Materials of a last upgrade cheaper', () => {
  const g = plain()
  const lastUpgrade = (g: Game) => buildCost(g, 'farm', 4)
  expect(lastUpgrade(taking(g, talentWith('buildCost'))).spice).toBe(lastUpgrade(g).spice)
})

test('a Housing Talent makes room for more Villagers', () => {
  const g = plain()
  const t = talentWith('housing')
  expect(housing(taking(g, t))).toBe(housing(g) + def(t).housing!)
})

// A Tavern pool to hire from, with Housing to spare.
const atTavern = (talents: TalentId[] = []) => {
  const g = taking(plain(), ...talents)
  g.plots[3] = { type: 'house', level: 1, paid: {} }
  return advance(g, 1)
}

test('a hire cost Talent makes hiring cheaper', () => {
  const [g, skilled] = [atTavern(), atTavern([talentWith('hireCost')])]
  expect(hireCost(skilled)).toBeLessThan(hireCost(g))
  expect(skilled.stock.gold - hire(skilled, 0).stock.gold).toBe(hireCost(skilled))
})

test('a Recruit pool Talent puts more Recruits in the Tavern', () => {
  const t = talentWith('recruits')
  expect(atTavern([t]).recruits).toHaveLength(atTavern().recruits.length + def(t).recruits!)
  expect(reroll(atTavern([t])).recruits).toHaveLength(atTavern().recruits.length + def(t).recruits!)
})

test('a Trait chance Talent brings more Recruits with Traits', () => {
  const withTraits = (g: Game) => {
    let n = 0
    for (let i = 0; i < 100; i++) n += (g = reroll(g)).recruits.filter((r) => r.traits.length).length
    return n
  }
  expect(withTraits(atTavern([talentWith('traitChance')]))).toBeGreaterThan(withTraits(atTavern()) + 20)
})

// A reached Foreign City, and goods it trades that don't touch Food.
const tradeSetup = (g: Game) => {
  const city = g.worldMap.find((s) => s.kind === 'city')!
  city.discovery = 'reached'
  const { buys, sells } = foreignCity(g, city.id)
  const give = (Object.keys(buys) as Res[]).find((r) => r !== 'food')!
  const get = (Object.keys(sells) as Res[]).find((r) => r !== give && r !== 'food')!
  return { city: city.id, give, get }
}
const tradeOnce = (g: Game) => {
  const { city, give, get } = tradeSetup(g)
  const ev: GameEvent[] = []
  const after = advance(openTradeRoute(g, 1, city, give, get), TRADE_JOB.duration, ev)
  const traded = ev.find((e): e is Extract<GameEvent, { kind: 'traded' }> => e.kind === 'traded')!
  return { after, got: traded.got[get]! }
}

test('a trade rate Talent makes Foreign Cities sell more per load', () => {
  const g = plain()
  const t = talentWith('tradeRate')
  const { city, get } = tradeSetup(g)
  expect(foreignCity(taking(g, t), city).sells[get]).toBeCloseTo(foreignCity(g, city).sells[get]! * (1 + def(t).tradeRate!))
  expect(tradeOnce(taking(g, t)).got).toBeGreaterThan(tradeOnce(g).got)
})

test('a Reputation Talent earns more Reputation from each Trade Route cycle', () => {
  const g = plain()
  const t = talentWith('reputation')
  const { city } = tradeSetup(g)
  const reputation = (g: Game) => tradeOnce(g).after.worldMap.find((s) => s.id === city)!.reputation
  expect(reputation(taking(g, t))).toBeCloseTo(reputation(g)! * (1 + def(t).reputation!))
})

test('a Rare Material Talent brings more from each Outpost cycle and each cleared Ruin', () => {
  const t = talentWith('rareYield')
  const outpost = (g: Game) => {
    const deposit = g.worldMap.find((s) => s.kind === 'deposit')!
    deposit.discovery = 'reached'
    const after = advance(assignOutpost(buildOutpost(g, deposit.id), 1, deposit.id), OUTPOST_JOB.duration)
    return after.stock[deposit.material!] - g.stock[deposit.material!]
  }
  expect(outpost(taking(plain(), t))).toBeCloseTo(outpost(plain()) * (1 + def(t).rareYield!))

  const ruin = (g: Game) => {
    for (const v of g.villagers) v.level = 20
    const site = g.worldMap.find((s) => s.kind === 'ruin')!
    site.discovery = 'reached'
    const out = sendExpedition(g, [1, 2, 3], { kind: 'ruin', site: site.id })
    out.expeditions[0].chance = 1
    const after = advance(out, out.expeditions[0].duration)
    return { crystal: after.stock.crystal - g.stock.crystal, gold: after.stock.gold - g.stock.gold }
  }
  const [base, skilled] = [ruin(plain()), ruin(taking(plain(), t))]
  expect(skilled.crystal).toBeCloseTo(base.crystal * (1 + def(t).rareYield!))
  expect(skilled.gold).toBe(base.gold)
})

test('an Offline Progress Talent raises the cap on time away', () => {
  const g = plain()
  const t = talentWith('offlineCap')
  expect(offlineCap(g)).toBe(OFFLINE_CAP)
  expect(offlineCap(taking(g, t))).toBe(OFFLINE_CAP + def(t).offlineCap!)
})
