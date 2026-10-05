// The Talent Tree overlay: a pannable, zoomable web of Talents. Only reads state and dispatches (ADR 0001).
import { useRef, useState, type PointerEvent, type WheelEvent } from 'react'
import type { Act } from './format'
import { TALENT_LINKS, TALENTS, webPosition, type TalentDef, type TalentId, type TalentKind } from './sim/data'
import { renownToNext, takeTalent, talentBlocker, type Game } from './sim/game'

// Icons from game-icons.net (CC BY 3.0), one per lever (the bonus key: speed.svg, xp.svg, …), plus centre.svg.
// A Talent shows the icon of its first lever, so new Talents get one for free.
const ICONS = import.meta.glob<string>('./talent-icons/*.svg', { eager: true, query: '?url', import: 'default' })
const icon = (key: string) => ICONS[`./talent-icons/${key}.svg`]
const talentIcon = (t: TalentDef) => Object.keys(t).map(icon).find(Boolean)

const KIND_NAME: Record<TalentKind, string> = { minor: 'Minor', notable: 'Notable', keystone: 'Keystone' }
const UNIT = 90 // px per grid unit of the web

// Screen positions from the sim's web grid (y up there, down on screen).
const at = (t: TalentDef) => { const p = webPosition(t.region, t.at); return { x: p.x * UNIT, y: -p.y * UNIT } }
const POS: Record<string, { x: number; y: number }> = { centre: { x: 0, y: 0 } }
for (const [id, t] of Object.entries(TALENTS)) POS[id] = at(t)
const IDS = Object.keys(TALENTS) as TalentId[]

export function TalentTree({ game, act, onClose }: { game: Game; act: Act; onClose: () => void }) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 })
  const [shown, setShown] = useState<TalentId | null>(null)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const moved = useRef(0) // how far the current drag has gone, so a pan doesn't count as a click

  const has = (id: string) => id === 'centre' || game.talents.includes(id as TalentId)
  const state = (id: TalentId) => (has(id) ? 'taken' : talentBlocker(game, id) ? 'locked' : 'can take')

  // Zoom by `f` about a point given relative to the centre of the viewport.
  const zoomAt = (sx: number, sy: number, f: number) => setView((v) => {
    const k = Math.min(2.5, Math.max(0.4, v.k * f))
    return { k, x: sx - ((sx - v.x) * k) / v.k, y: sy - ((sy - v.y) * k) / v.k }
  })
  const fromCentre = (el: Element, x: number, y: number) => {
    const r = el.getBoundingClientRect()
    return [x - r.left - r.width / 2, y - r.top - r.height / 2] as const
  }
  const onPointerDown = (e: PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 1) moved.current = 0
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const last = pointers.current.get(e.pointerId)
    if (!last) return
    const others = [...pointers.current].filter(([id]) => id !== e.pointerId).map(([, p]) => p)
    moved.current += Math.abs(e.clientX - last.x) + Math.abs(e.clientY - last.y)
    if (others.length === 1) { // pinch: zoom about the midpoint by how much the fingers spread
      const o = others[0]
      const f = Math.hypot(e.clientX - o.x, e.clientY - o.y) / (Math.hypot(last.x - o.x, last.y - o.y) || 1)
      const [sx, sy] = fromCentre(e.currentTarget, (e.clientX + o.x) / 2, (e.clientY + o.y) / 2)
      zoomAt(sx, sy, f)
    } else if (!others.length) {
      setView((v) => ({ ...v, x: v.x + e.clientX - last.x, y: v.y + e.clientY - last.y }))
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
  }
  const onPointerUp = (e: PointerEvent) => { pointers.current.delete(e.pointerId) }
  const onWheel = (e: WheelEvent<HTMLDivElement>) => zoomAt(...fromCentre(e.currentTarget, e.clientX, e.clientY), Math.exp(-e.deltaY * 0.0015))

  const click = (id: TalentId) => {
    setShown(id)
    const dragged = moved.current > 6
    moved.current = 0 // so a later keyboard click isn't mistaken for the end of this drag
    if (dragged || state(id) !== 'can take') return
    act((g) => takeTalent(g, id))
  }

  const points = game.talentPoints
  const toNext = renownToNext(game.renownRank)
  const tip: TalentDef | null = shown && TALENTS[shown]
  const blocker = shown && !has(shown) ? talentBlocker(game, shown) : undefined
  return (
    <div className="talents" role="dialog" aria-modal="true" aria-label="Talent Tree" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <header className="talents-head">
        <h2>Talent Tree</h2>
        <span className="tt-points">{points} Talent Point{points === 1 ? '' : 's'}</span>
        <span className="muted small">Renown rank {game.renownRank}</span>
        <div className="bar xp" title={`Renown ${Math.floor(game.renown)} / ${toNext}`}><i style={{ width: `${(game.renown / toNext) * 100}%` }} /></div>
        <button className="ghost" onClick={onClose} aria-label="Close" autoFocus>✕</button>
      </header>
      <div className="tt-view" onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={onPointerUp} onWheel={onWheel}>
        <div className="tt-world" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}>
          <svg className="tt-paths" aria-hidden="true">
            {TALENT_LINKS.map(([a, b]) => (
              <line key={`${a}-${b}`} x1={POS[a].x} y1={POS[a].y} x2={POS[b].x} y2={POS[b].y} className={has(a) && has(b) ? 'lit' : ''} />
            ))}
          </svg>
          <span className="tt-node centre" style={{ left: 0, top: 0 }}><i style={{ maskImage: `url("${icon('centre')}")` }} /></span>
          {IDS.map((id) => {
            const t: TalentDef = TALENTS[id]
            const s = state(id)
            return (
              <button
                key={id}
                className={`tt-node ${t.kind} ${t.region} ${s.replace(' ', '-')}`}
                style={{ left: POS[id].x, top: POS[id].y }}
                aria-label={`${t.name}, ${s}`}
                onMouseEnter={() => setShown(id)}
                onFocus={() => setShown(id)}
                onClick={() => click(id)}
              >
                <i style={{ maskImage: `url("${talentIcon(t)}")` }} />
              </button>
            )
          })}
        </div>
      </div>
      <div className="tt-tip" role="tooltip">
        {tip ? (
          <>
            <strong>{tip.name}</strong> <span className="muted small">{KIND_NAME[tip.kind]}</span>
            <p>{tip.desc}</p>
            {tip.drawback && <p className="tt-drawback">Downside: {tip.drawback}</p>}
            {blocker ? <p className="tt-req">{blocker}</p> : <p className="tt-ok">{has(shown!) ? 'Taken' : 'Click to take'}</p>}
          </>
        ) : <span className="muted">Hover or tap a Talent. Drag to pan, scroll or pinch to zoom.</span>}
      </div>
      <footer className="tt-credits small">
        Icons by Lorc and Delapouite from <a href="https://game-icons.net" target="_blank" rel="noreferrer">game-icons.net</a>, under <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noreferrer">CC BY 3.0</a>
      </footer>
    </div>
  )
}
