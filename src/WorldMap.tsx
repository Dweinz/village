// The World Map view: a 2D chart of the Sites around the Settlement. Only reads state and dispatches (ADR 0001).
import { useState } from 'react'
import { activityText, costText, dur, fmtTenths, type Act } from './format'
import {
  EXPEDITION_ATTRS, REPUTATION_TIERS, RES_ICON, RES_NAME, SITE_KINDS, SITE_MAX_DISTANCE, SITE_REVEAL_DISTANCE, SPECS,
  type Res,
} from './sim/data'
import {
  assignOutpost, buildOutpost, canAfford, canJoinExpedition, canTrade, closeTradeRoute, foreignCity, nextReputationTier, openTradeRoute, outpostCost, outpostMaxLevel, outpostSlots,
  injuryChance, maxParty, outpostWorkers, planExpedition, recallExpedition, ruinLevel, ruinReward, ruinXp, sendExpedition, siteById, tradeRoutes, tradeStalled, unassign, upgradeOutpost,
  type ExpeditionTarget, type Game,
} from './sim/game'
import type { Site } from './sim/world'

const RADIUS = 46 // % of the board from the centre to the farthest Site
const radiusOf = (distance: number) => Math.sqrt(distance / SITE_MAX_DISTANCE) * RADIUS // square root gives the revealed area more room
const at = (s: Site) => ({ left: `${50 + Math.cos(s.angle) * radiusOf(s.distance)}%`, top: `${50 + Math.sin(s.angle) * radiusOf(s.distance)}%` })

export function WorldMap({ game, selected, onSelect, onExplore, act }: {
  game: Game; selected: number | 'explore' | null; onSelect: (id: number) => void; onExplore: () => void; act: Act
}) {
  const visible = game.worldMap.filter((s) => s.discovery !== 'hidden')
  const hidden = game.worldMap.length - visible.length
  const clear = radiusOf(SITE_REVEAL_DISTANCE + 0.5) // where the fog begins
  const names = (ids: number[]) => ids.map((id) => game.villagers.find((v) => v.id === id)!.name).join(', ')
  return (
    <section className="worldmap" aria-label="World Map">
      <div className="board">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <radialGradient id="fog">
              <stop offset={`${clear * 2}%`} stopColor="#eef3f1" stopOpacity="0" />
              <stop offset={`${clear * 2 + 8}%`} stopColor="#eef3f1" stopOpacity="0.92" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="49" className="land" />
          {[2.5, 5, 7.5, 10].map((d) => <circle key={d} cx="50" cy="50" r={radiusOf(d)} className="ring" />)}
          <circle cx="50" cy="50" r="49" fill="url(#fog)" />
          {game.expeditions.filter((x) => x.goal === 'reach').map((x) => {
            const s = siteById(game, x.site)
            const r = radiusOf(s.distance)
            return <line key={x.id} x1="50" y1="50" x2={50 + Math.cos(s.angle) * r} y2={50 + Math.sin(s.angle) * r} className="trail" />
          })}
        </svg>
        <span className="home" style={{ left: '50%', top: '50%' }} role="img" aria-label="Your Settlement">🏘️</span>
        {visible.map((s) => (
          <button
            key={s.id}
            className={`site ${selected === s.id ? 'selected' : ''}`}
            style={at(s)}
            aria-label={`${SITE_KINDS[s.kind].name}, distance ${s.distance}${s.outpost ? `, Outpost level ${s.outpost.level}` : ''}${s.cleared ? ', cleared' : ''}`}
            aria-pressed={selected === s.id}
            onClick={() => onSelect(s.id)}
          >
            {SITE_KINDS[s.kind].icon}
          </button>
        ))}
      </div>
      <div className="map-foot">
        <span className="muted small">{hidden} Sites hidden in the fog</span>
        {hidden > 0 && <button className="small" aria-pressed={selected === 'explore'} onClick={onExplore}>Explore the fog</button>}
      </div>
      {game.expeditions.length > 0 && (
        <ul className="panel underway" aria-label="Expeditions">
          {game.expeditions.map((x) => {
            const s = siteById(game, x.site)
            return (
              <li key={x.id}>
                <div className="row small">
                  <span>{names(x.party)} → {x.goal === 'explore' ? 'into the fog' : x.goal === 'ruin' ? 'into the Ruin' : SITE_KINDS[s.kind].name} · {dur(x.duration - x.progress)} left</span>
                  <button className="ghost small" aria-label={`Recall ${names(x.party)}`} onClick={() => act((g) => recallExpedition(g, x.id))}>Recall</button>
                </div>
                <div className="bar"><i style={{ width: `${(x.progress / x.duration) * 100}%` }} /></div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

export function SitePanel({ game, site, act, onClose }: { game: Game; site: Site; act: Act; onClose: () => void }) {
  const kind = SITE_KINDS[site.kind]
  return (
    <aside className="panel side" aria-label={kind.name}>
      <div className="head"><h2>{kind.icon} {kind.name}</h2><button className="ghost" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="card">
        <div className="row">
          <strong>Distance {site.distance}</strong>
          <span className="badge">{site.cleared ? 'Cleared' : site.discovery === 'reached' ? 'Reached' : 'Revealed'}</span>
        </div>
        {site.kind === 'city' && site.discovery === 'reached' && <strong>{foreignCity(game, site.id).name}</strong>}
        <p className="muted small">{kind.desc}</p>
        {site.material && <p className="small">Yields {RES_ICON[site.material]} {RES_NAME[site.material]}</p>}
      </div>
      {site.kind === 'deposit' && site.discovery === 'reached' && <OutpostCard game={game} site={site} act={act} />}
      {site.kind === 'ruin' && <RuinCard game={game} site={site} />}
      {site.kind === 'city' && site.discovery === 'reached' && <ReputationCard game={game} site={site} />}
      {site.kind === 'city' && site.discovery === 'reached' && <TradeCard key={site.id} game={game} site={site} act={act} />}
      {site.discovery === 'revealed' && <PartyPicker key={site.id} game={game} target={{ kind: 'reach', site: site.id }} act={act} />}
      {site.kind === 'ruin' && site.discovery === 'reached' && !site.cleared && (
        <PartyPicker key={`ruin-${site.id}`} game={game} target={{ kind: 'ruin', site: site.id }} act={act} />
      )}
    </aside>
  )
}

function RuinCard({ game, site }: { game: Game; site: Site }) {
  if (site.cleared) return <p className="card muted small">This Ruin has been cleared. Nothing is left inside.</p>
  return (
    <div className="card small">
      <div className="row"><strong>Every Party member level {ruinLevel(site)}+</strong><span className="badge warn">High risk</span></div>
      <p className="muted">Worse odds than a normal Expedition; on failure each member has a {Math.round(injuryChance(game, 'ruin') * 100)}% Injury chance. You can try again.</p>
      <p>Reward: {costText(ruinReward(game, site))} · {ruinXp(site)} XP each</p>
    </div>
  )
}

function ReputationCard({ game, site }: { game: Game; site: Site }) {
  const { reputation, tier } = foreignCity(game, site.id)
  const next = nextReputationTier(game, site.id)
  const names = (goods: Res[]) => goods.map((r) => `${RES_ICON[r]} ${RES_NAME[r]}`).join(', ')
  return (
    <section className="card small" aria-label="Reputation">
      <div className="row"><strong>Reputation {fmtTenths(reputation)} · {REPUTATION_TIERS[tier].name}</strong></div>
      {next ? (
        <>
          <p className="muted">Next: {next.name} at {next.reputation}</p>
          <p className="muted">Then sells {costText(next.sells)}{next.newSells.length > 0 && ` (new: ${names(next.newSells)})`}</p>
          {next.newBuys.length > 0 && <p className="muted">Then also buys {names(next.newBuys)}</p>}
        </>
      ) : <p className="muted">The highest tier: its best rates and every good it deals in.</p>}
    </section>
  )
}

function TradeCard({ game, site, act }: { game: Game; site: Site; act: Act }) {
  const city = foreignCity(game, site.id)
  const [trader, setTrader] = useState('')
  const [give, setGive] = useState('')
  const [get, setGet] = useState('')
  const goods = (bag: typeof city.buys) => Object.keys(bag) as Res[]
  return (
    <div className="card">
      <div className="eyebrow">Rates · per load</div>
      <p className="small">Buys {costText(city.buys)}</p>
      <p className="small">Sells {costText(city.sells)}</p>
      {tradeRoutes(game, site.id).map((v) => v.activity?.kind === 'trade' && (
        <div key={v.id} className="row small">
          <span>
            {v.name}: {RES_ICON[v.activity.give]} {fmtTenths(city.buys[v.activity.give]!)} → {RES_ICON[v.activity.get]} {fmtTenths(city.sells[v.activity.get]!)}
            {tradeStalled(game, v) && <span className="muted"> · waiting for {RES_NAME[v.activity.give]}</span>}
          </span>
          <button className="ghost small" aria-label={`Close ${v.name}'s Trade Route`} onClick={() => act((g) => closeTradeRoute(g, v.id))}>Close</button>
        </div>
      ))}
      <div className="eyebrow">New Trade Route</div>
      <select value={trader} aria-label="Trader" onChange={(e) => setTrader(e.target.value)}>
        <option value="">Villager…</option>
        {game.villagers.filter((v) => canTrade(game, v)).map((v) => <option key={v.id} value={v.id}>{v.name} (Lv {v.level}, CHA {v.attrs.cha})</option>)}
      </select>
      <select value={give} aria-label="Send" onChange={(e) => setGive(e.target.value)}>
        <option value="">Send…</option>
        {goods(city.buys).map((r) => <option key={r} value={r}>{RES_ICON[r]} {fmtTenths(city.buys[r]!)} {RES_NAME[r]}</option>)}
      </select>
      <select value={get} aria-label="Receive" onChange={(e) => setGet(e.target.value)}>
        <option value="">Receive…</option>
        {goods(city.sells).map((r) => <option key={r} value={r}>{RES_ICON[r]} {fmtTenths(city.sells[r]!)} {RES_NAME[r]}</option>)}
      </select>
      <button
        className="wide"
        disabled={!trader || !give || !get}
        onClick={() => { act((g) => openTradeRoute(g, Number(trader), site.id, give as Res, get as Res)); setTrader('') }}
      >
        Open Trade Route
      </button>
    </div>
  )
}

function OutpostCard({ game, site, act }: { game: Game; site: Site; act: Act }) {
  const outpost = site.outpost
  if (!outpost) {
    return (
      <div className="card row">
        <span className="small">Outpost: {costText(outpostCost(0))}</span>
        <button disabled={!canAfford(game, outpostCost(0))} onClick={() => act((g) => buildOutpost(g, site.id))}>Build Outpost</button>
      </div>
    )
  }
  const staff = outpostWorkers(game, site.id)
  const atMax = outpost.level >= outpostMaxLevel(game)
  return (
    <div className="card">
      <div className="row"><strong>Outpost <span className="lvl">Lv {outpost.level}</span></strong><span className="muted small">Slots {staff.length}/{outpostSlots(site)}</span></div>
      <div className="row small">
        {atMax ? <span className="muted">Upgrade the Town Hall to go higher</span> : <span>Upgrade: {costText(outpostCost(outpost.level))}</span>}
        <button className="ghost" disabled={atMax || !canAfford(game, outpostCost(outpost.level))} onClick={() => act((g) => upgradeOutpost(g, site.id))}>Upgrade</button>
      </div>
      {staff.map((v) => (
        <div key={v.id} className="row small">
          <span>{v.name}</span>
          <button className="ghost small" aria-label={`Unassign ${v.name}`} onClick={() => act((g) => unassign(g, v.id))}>✕</button>
        </div>
      ))}
      {staff.length < outpostSlots(site) && (
        <select value="" aria-label="Assign a Villager to the Outpost" onChange={(e) => act((g) => assignOutpost(g, Number(e.target.value), site.id))}>
          <option value="">+ Assign a Villager…</option>
          {game.villagers.filter((v) => !v.activity).map((v) => <option key={v.id} value={v.id}>{v.name} (Lv {v.level})</option>)}
        </select>
      )}
    </div>
  )
}

export function ExplorePanel({ game, act, onClose }: { game: Game; act: Act; onClose: () => void }) {
  return (
    <aside className="panel side" aria-label="Explore the fog">
      <div className="head"><h2>🌫️ Explore the fog</h2><button className="ghost" onClick={onClose} aria-label="Close">✕</button></div>
      <p className="muted small">The party heads for the nearest Site still hidden, and reveals it if they make it back.</p>
      <PartyPicker game={game} target={{ kind: 'explore' }} act={act} />
    </aside>
  )
}

function PartyPicker({ game, target, act }: { game: Game; target: ExpeditionTarget; act: Act }) {
  const [party, setParty] = useState<number[]>([])
  const chosen = party.filter((id) => game.villagers.some((v) => v.id === id && canJoinExpedition(game, v))) // drop anyone who has since left
  let plan: ReturnType<typeof planExpedition> | null = null
  let problem = ''
  try { plan = planExpedition(game, chosen, target) } catch (e) { problem = (e as Error).message }
  const short = plan ? Object.entries(plan.cost).filter(([r, n]) => game.stock[r as Res] < n).map(([r]) => RES_NAME[r as Res]) : []
  const toggle = (id: number) => setParty(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id])

  return (
    <>
      <div className="eyebrow">Party · up to {maxParty(game)}</div>
      <div role="group" aria-label="Party">
        {game.villagers.map((v) => {
          const locked = !canJoinExpedition(game, v)
          return (
            <label key={v.id} className={`card pick ${locked ? 'locked' : ''}`}>
              <input type="checkbox" checked={chosen.includes(v.id)} disabled={locked} onChange={() => toggle(v.id)} />
              <span>
                <strong>{v.name}</strong> <span className="muted small">Lv {v.level}{v.spec && ` · ${SPECS[v.spec].name}`}</span>
                <span className="muted small"> · {EXPEDITION_ATTRS.map((a) => `${a.toUpperCase()} ${v.attrs[a]}`).join(' ')}</span>
                <span className="muted small"> · {activityText(game, v)}</span>
              </span>
            </label>
          )
        })}
      </div>
      {plan ? (
        <div className="card">
          <div className="row small">
            <span>{dur(plan.duration)} · {Object.entries(plan.cost).map(([r, n]) => `${RES_ICON[r as Res]} ${fmtTenths(n)}`).join(' ')}</span>
            <strong>{Math.round(plan.chance * 100)}% chance</strong>
          </div>
          {short.length > 0 && <p className="muted small">Not enough {short.join(' or ')}</p>}
          <button
            className="wide"
            disabled={short.length > 0}
            onClick={() => { act((g) => sendExpedition(g, chosen, target)); setParty([]) }}
          >
            Send Expedition
          </button>
        </div>
      ) : <p className="muted small">{problem}</p>}
    </>
  )
}
