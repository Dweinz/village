// The World Map view: a 2D chart of the Sites around the Settlement. Only reads state and dispatches (ADR 0001).
import { useState } from 'react'
import { dur, type Act } from './format'
import { EXPEDITION_ATTRS, EXPEDITION_MAX_PARTY, RES_ICON, RES_NAME, SITE_KINDS, SITE_MAX_DISTANCE, SITE_REVEAL_DISTANCE, SPECS, type Res } from './sim/data'
import {
  activityName, canJoinExpedition, planExpedition, recallExpedition, sendExpedition, siteById, type ExpeditionTarget, type Game,
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
            aria-label={`${SITE_KINDS[s.kind].name}, distance ${s.distance}`}
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
                  <span>{names(x.party)} → {x.goal === 'explore' ? 'into the fog' : SITE_KINDS[s.kind].name} · {dur(x.duration - x.progress)} left</span>
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
        <div className="row"><strong>Distance {site.distance}</strong><span className="badge">{site.discovery === 'reached' ? 'Reached' : 'Revealed'}</span></div>
        <p className="muted small">{kind.desc}</p>
      </div>
      {site.discovery === 'revealed' && <PartyPicker key={site.id} game={game} target={{ kind: 'reach', site: site.id }} act={act} />}
    </aside>
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
      <div className="eyebrow">Party · up to {EXPEDITION_MAX_PARTY}</div>
      <div role="group" aria-label="Party">
        {game.villagers.map((v) => {
          const locked = !canJoinExpedition(game, v)
          return (
            <label key={v.id} className={`card pick ${locked ? 'locked' : ''}`}>
              <input type="checkbox" checked={chosen.includes(v.id)} disabled={locked} onChange={() => toggle(v.id)} />
              <span>
                <strong>{v.name}</strong> <span className="muted small">Lv {v.level}{v.spec && ` · ${SPECS[v.spec].name}`}</span>
                <span className="muted small"> · {EXPEDITION_ATTRS.map((a) => `${a.toUpperCase()} ${v.attrs[a]}`).join(' ')}</span>
                <span className="muted small"> · {activityName(game, v)}</span>
              </span>
            </label>
          )
        })}
      </div>
      {plan ? (
        <div className="card">
          <div className="row small">
            <span>{dur(plan.duration)} · {Object.entries(plan.cost).map(([r, n]) => `${RES_ICON[r as Res]} ${n}`).join(' ')}</span>
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
