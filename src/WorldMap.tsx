// The World Map view: a 2D chart of the Sites around the Settlement. Only reads state (ADR 0001).
import { SITE_KINDS, SITE_MAX_DISTANCE, SITE_REVEAL_DISTANCE } from './sim/data'
import type { Game } from './sim/game'
import type { Site } from './sim/world'

const RADIUS = 46 // % of the board from the centre to the farthest Site
const radiusOf = (distance: number) => Math.sqrt(distance / SITE_MAX_DISTANCE) * RADIUS // square root gives the revealed area more room
const at = (s: Site) => ({ left: `${50 + Math.cos(s.angle) * radiusOf(s.distance)}%`, top: `${50 + Math.sin(s.angle) * radiusOf(s.distance)}%` })

export function WorldMap({ game, selected, onSelect }: { game: Game; selected: number | null; onSelect: (id: number) => void }) {
  const visible = game.worldMap.filter((s) => s.discovery !== 'hidden')
  const hidden = game.worldMap.length - visible.length
  const clear = radiusOf(SITE_REVEAL_DISTANCE + 0.5) // where the fog begins
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
      <p className="fog-note muted small">{hidden} Sites hidden in the fog</p>
    </section>
  )
}

export function SitePanel({ site, onClose }: { site: Site; onClose: () => void }) {
  const kind = SITE_KINDS[site.kind]
  return (
    <aside className="panel side" aria-label={kind.name}>
      <div className="head"><h2>{kind.icon} {kind.name}</h2><button className="ghost" onClick={onClose} aria-label="Close">✕</button></div>
      <div className="card">
        <div className="row"><strong>Distance {site.distance}</strong><span className="badge">{site.discovery === 'reached' ? 'Reached' : 'Revealed'}</span></div>
        <p className="muted small">{kind.desc}</p>
      </div>
      <p className="muted small">Expeditions to reach Sites are coming next.</p>
    </aside>
  )
}
