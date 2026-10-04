import { useEffect, useRef, useState } from 'react'
import { Scene } from './Scene'
import { ExplorePanel, SitePanel, WorldMap } from './WorldMap'
import { activityText, costText, dur, fmt, type Act } from './format'
import {
  ATTRS, ATTR_NAMES, BUILDINGS, REPUTATION_TIERS, RESOURCES, RES_ICON, RES_NAME, SITE_KINDS, SPECS, isRare, SPEC_IDS, SPEC_LEVEL, TRAITS,
  type Bag, type BuildingType, type Res,
} from './sim/data'
import {
  CHAPTERS, REROLL_COST, advance, assign, build, buildCost, canAfford, canSpecialize, currentJob, demolish, demolishRefund, jobOf, plotHousing, hire,
  hireCost, housing, jobsFor, maxLevel, newGame, offlineCap, raise, reroll, slots, specialize, unassign, upgrade, workers, worldMapUnlocked, xpToNext,
  type Game, type GameEvent, type Villager,
} from './sim/game'
import { SAVE_KEY, fromSave, toSave } from './sim/save'

interface Report { seconds: number; capped: boolean; before: Game['stock']; after: Game['stock']; events: GameEvent[] }

function boot(): { game: Game; report: Report | null } {
  let text = null
  try { text = localStorage.getItem(SAVE_KEY) } catch { /* storage blocked: start fresh */ }
  const saved = text === null ? null : fromSave(text)
  if (!saved) return { game: newGame(), report: null } // no save, or a corrupt one: start fresh
  const away = (Date.now() - saved.savedAt) / 1000
  const cap = offlineCap(saved.game)
  const seconds = Math.min(away, cap)
  if (seconds < 60) return { game: advance(saved.game, Math.max(0, seconds)), report: null }
  const events: GameEvent[] = []
  const game = advance(saved.game, seconds, events)
  return { game, report: { seconds, capped: away > cap, before: saved.game.stock, after: game.stock, events } }
}

const Cost = ({ bag, game }: { bag: Bag; game?: Game }) => (
  <span className="cost">
    {Object.entries(bag).map(([r, n]) => (
      <span key={r} className={game && game.stock[r as Res] < n ? 'short' : ''}>{RES_ICON[r as Res]} {fmt(n)}</span>
    ))}
  </span>
)

function describe(e: GameEvent) {
  switch (e.kind) {
    case 'level': return `⭐ ${e.name} reached level ${e.level}`
    case 'contract': return `📜 ${e.name} finished ${e.job}`
    case 'chapter': return CHAPTERS[e.chapter] ? `📖 Chapter ${e.chapter + 1}: ${CHAPTERS[e.chapter].name}` : '🏆 All Chapters complete: more is coming in v3'
    case 'starving': return '⚠️ Food ran out — everyone works at half speed'
    case 'worldMap': return '🗺️ The World Map is open: see what lies beyond the walls'
    case 'expeditionSucceeded': return `🧭 ${e.party.join(', ')} ${e.goal === 'reach' ? 'reached' : 'found'} a ${SITE_KINDS[e.site].name}`
    case 'expeditionFailed': return `🥀 ${e.party.join(', ')} came home empty-handed`
    case 'injured': return `🩹 ${e.name} came back Injured`
    case 'recovered': return `💪 ${e.name} has recovered`
    case 'ruinCleared': return `🏛️ ${e.party.join(', ')} cleared a Ruin and brought back ${costText(e.reward)}`
    case 'traded': return `🐪 ${e.name} traded at ${e.city}`
    case 'reputationTier': return `🤝 Reputation with ${e.city} rose to ${REPUTATION_TIERS[e.tier].name}`
    case 'siteRevealed': return `🌫️ ${e.party.join(', ')} found a ${SITE_KINDS[e.site].name} at distance ${e.distance}`
    case 'renownRank': return `👑 Renown rank ${e.rank}: you earned a Talent Point`
  }
}

export default function App() {
  const [initial] = useState(boot)
  const [game, setGame] = useState(initial.game)
  const [report, setReport] = useState(initial.report)
  const [selected, setSelected] = useState<number | null>(null)
  const [view, setView] = useState<View>('settlement')
  const [site, setSite] = useState<number | 'explore' | null>(null)
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([])
  const ref = useRef(game)
  const resetting = useRef(false)

  const toast = (text: string) => {
    const id = Math.random()
    setToasts((t) => [...t.slice(-3), { id, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000)
  }
  const commit = (g: Game) => { ref.current = g; setGame(g) }
  const act = (fn: (g: Game) => Game) => { try { commit(fn(ref.current)) } catch (e) { toast((e as Error).message) } }

  useEffect(() => {
    let last = performance.now()
    const save = () => { if (!resetting.current) localStorage.setItem(SAVE_KEY, toSave(ref.current, Date.now())) }
    const tick = setInterval(() => {
      const now = performance.now()
      const events: GameEvent[] = []
      commit(advance(ref.current, Math.min((now - last) / 1000, offlineCap(ref.current)), events))
      last = now
      events.filter((e) => e.kind !== 'traded').forEach((e) => toast(describe(e))) // every Trade Route cycle would be noise
    }, 250)
    const autosave = setInterval(save, 5000)
    window.addEventListener('pagehide', save)
    return () => { clearInterval(tick); clearInterval(autosave); window.removeEventListener('pagehide', save) }
  }, [])

  const reset = () => {
    if (!confirm('Start a new town? Your current progress will be lost.')) return
    resetting.current = true
    localStorage.removeItem(SAVE_KEY)
    location.reload()
  }

  return (
    <>
      {view === 'map'
        ? <WorldMap game={game} selected={site} onSelect={setSite} onExplore={() => setSite('explore')} act={act} />
        : <Scene game={game} selected={selected} onSelect={setSelected} />}
      <TopBar game={game} onReset={reset} view={view} onView={(v) => { setView(v); setSite(null) }} />
      <Objectives game={game} />
      {view === 'settlement' && selected !== null && <PlotPanel game={game} plot={selected} act={act} onClose={() => setSelected(null)} />}
      {view === 'map' && site === 'explore' && <ExplorePanel game={game} act={act} onClose={() => setSite(null)} />}
      {view === 'map' && typeof site === 'number' && <SitePanel game={game} site={game.worldMap.find((s) => s.id === site)!} act={act} onClose={() => setSite(null)} />}
      <Roster game={game} act={act} />
      <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
      {report && <ReportModal report={report} onClose={() => setReport(null)} />}
    </>
  )
}

type View = 'settlement' | 'map'

function TopBar({ game, onReset, view, onView }: { game: Game; onReset: () => void; view: View; onView: (v: View) => void }) {
  return (
    <header className="panel topbar">
      <strong className="logo">Hearthhold</strong>
      {worldMapUnlocked(game) && (view === 'map'
        ? <button className="view" onClick={() => onView('settlement')}>Settlement</button>
        : <button className="view" onClick={() => onView('map')}>World Map</button>)}
      {RESOURCES.filter((r) => !isRare(r) || worldMapUnlocked(game) || game.stock[r] > 0) /* Rare Materials once there's a World Map */.map((r) => <span key={r} className="res" title={RES_NAME[r]} aria-label={`${RES_NAME[r]} ${fmt(game.stock[r])}`}>{RES_ICON[r]} {fmt(game.stock[r])}</span>)}
      <span className="res" title="Villagers / Housing">👥 {game.villagers.length}/{housing(game)}</span>
      {game.starving && <span className="badge warn">Starving</span>}
      <button className="ghost" onClick={onReset} title="New game">↺</button>
    </header>
  )
}

function Objectives({ game }: { game: Game }) {
  const ch = CHAPTERS[game.chapter]
  return (
    <aside className="panel objectives" aria-label="Objectives">
      {ch ? (
        <>
          <div className="eyebrow">Chapter {game.chapter + 1}</div>
          <h2>{ch.name}</h2>
          <ul>{ch.objectives.map((o) => <li key={o.id} className={game.done.includes(o.id) ? 'done' : ''}>{o.text}</li>)}</ul>
        </>
      ) : <><div className="eyebrow">All Chapters complete</div><h2>Your town thrives</h2><p className="muted">You have seen everything for now: more is coming in v3.</p></>}
    </aside>
  )
}

function PlotPanel({ game, plot, act, onClose }: { game: Game; plot: number; act: Act; onClose: () => void }) {
  const p = game.plots[plot]
  if (!p) {
    const options = (Object.keys(BUILDINGS) as BuildingType[]).filter((t) => t !== 'townhall' && !(BUILDINGS[t].unique && game.plots.some((q) => q?.type === t)))
    return (
      <aside className="panel side">
        <div className="head"><h2>Empty Plot</h2><button className="ghost" onClick={onClose}>✕</button></div>
        {options.map((t) => {
          const locked = BUILDINGS[t].chapter > game.chapter
          return (
            <div key={t} className={`card row ${locked ? 'locked' : ''}`}>
              <div>
                <strong>{BUILDINGS[t].name}</strong>
                <div className="muted small">{locked ? `Unlocks in Chapter ${BUILDINGS[t].chapter + 1}` : <Cost bag={buildCost(game, t, 0)} game={game} />}</div>
              </div>
              <button disabled={locked || !canAfford(game, buildCost(game, t, 0))} onClick={() => act((g) => build(g, plot, t))}>Build</button>
            </div>
          )
        })}
      </aside>
    )
  }

  const def = BUILDINGS[p.type]
  const here = workers(game, plot)
  const idle = game.villagers.filter((v) => !v.activity)
  const atMax = p.level >= maxLevel(game, p.type)
  const refund = demolishRefund(p)
  return (
    <aside className="panel side">
      <div className="head"><h2>{def.name} <span className="lvl">Lv {p.level}</span></h2><button className="ghost" onClick={onClose}>✕</button></div>
      <div className="card row">
        <div className="small">
          {atMax ? <span className="muted">{p.type === 'townhall' ? 'Max level' : 'Upgrade the Town Hall to go higher'}</span> : <>Upgrade: <Cost bag={buildCost(game, p.type, p.level)} game={game} /></>}
        </div>
        <button disabled={atMax || !canAfford(game, buildCost(game, p.type, p.level))} onClick={() => act((g) => upgrade(g, plot))}>Upgrade</button>
      </div>
      {p.type !== 'townhall' && (
        <div className="card row">
          <div className="small">{Object.keys(refund).length ? <>Demolish and get back <Cost bag={refund} /></> : 'Demolish (no refund)'}</div>
          <button className="ghost" onClick={() => confirm(`Demolish this ${def.name}? This can't be undone.`) && act((g) => demolish(g, plot))}>Demolish</button>
        </div>
      )}
      {def.housing && <p className="muted small">Houses {plotHousing(p)} Villagers.</p>}
      {def.slots > 0 && <div className="eyebrow">Slots {here.length}/{slots(p)}</div>}

      {jobsFor(p).map((j) => (
        <div key={j.id} className="card">
          <div className="row">
            <strong>{j.name}</strong>
            <span className={`badge ${j.kind}`}>{j.kind === 'production' ? 'Production' : 'Contract'}</span>
          </div>
          <div className="muted small">
            {dur(j.duration)} · <Cost bag={j.yields} /> {j.xp} XP{j.cost && <> · costs <Cost bag={j.cost} game={game} /></>}
            {' · '}{Object.keys(j.attrs).map((a) => ATTR_NAMES[a as keyof typeof ATTR_NAMES]).join(', ')}
          </div>
          {here.filter((v) => currentJob(v)!.job === j.id).map((v) => (
            <div key={v.id} className="worker">
              <span>{v.name}</span>
              <div className="bar"><i style={{ width: `${(currentJob(v)!.progress / j.duration) * 100}%` }} /></div>
              <button className="ghost small" onClick={() => act((g) => unassign(g, v.id))} title="Unassign" aria-label={`Unassign ${v.name}`}>✕</button>
            </div>
          ))}
          {here.length < slots(p) && idle.length > 0 && (
            <select value="" aria-label={`Assign a Villager to ${j.name}`} onChange={(e) => act((g) => assign(g, Number(e.target.value), plot, j.id))}>
              <option value="">+ Assign a Villager…</option>
              {idle.map((v) => <option key={v.id} value={v.id}>{v.name} (Lv {v.level})</option>)}
            </select>
          )}
        </div>
      ))}

      {p.type === 'tavern' && <Tavern game={game} act={act} />}
      {p.type === 'guildhall' && <p className="muted small">Villagers at level {SPEC_LEVEL}+ can choose a Specialization from the roster below.</p>}
    </aside>
  )
}

function Tavern({ game, act }: { game: Game; act: Act }) {
  const full = game.villagers.length >= housing(game)
  return (
    <>
      <div className="row eyebrow">
        <span>Recruits · new in {dur(game.tavernRefreshAt - game.time)}</span>
        <button className="ghost small" disabled={!canAfford(game, { gold: REROLL_COST })} onClick={() => act(reroll)}>Reroll 🪙{REROLL_COST}</button>
      </div>
      {game.recruits.map((r, i) => (
        <div key={r.id} className="card">
          <div className="row"><strong>{r.name}</strong><button disabled={full || game.stock.gold < hireCost(game)} onClick={() => act((g) => hire(g, i))}>Hire 🪙{hireCost(game)}</button></div>
          <Attrs v={r} />
          <Traits v={r} />
        </div>
      ))}
      {full && <p className="muted small">Not enough Housing — build or upgrade a House.</p>}
    </>
  )
}

const Attrs = ({ v, onRaise }: { v: Villager; onRaise?: (a: (typeof ATTRS)[number]) => void }) => (
  <div className="attrs">
    {ATTRS.map((a) => (
      <span key={a} title={ATTR_NAMES[a]}>
        {a.toUpperCase()} <b>{v.attrs[a]}</b>
        {onRaise && v.points > 0 && <button className="plus" onClick={() => onRaise(a)}>+</button>}
      </span>
    ))}
  </div>
)

const Traits = ({ v }: { v: Villager }) => (
  <div className="chips">
    {v.traits.map((t) => <span key={t} className="chip" title={TRAITS[t].desc}>{TRAITS[t].name}</span>)}
    {v.spec && <span className="chip spec" title={SPECS[v.spec].desc}>{SPECS[v.spec].name}</span>}
  </div>
)

function Roster({ game, act }: { game: Game; act: Act }) {
  return (
    <footer className="roster">
      {game.villagers.map((v) => {
        const options = SPEC_IDS.filter((s) => canSpecialize(game, v, s))
        const job = jobOf(game, v)
        return (
          <div key={v.id} className="panel villager">
            <div className="row"><strong>{v.name}</strong><span className="lvl">Lv {v.level}</span></div>
            <div className="bar xp"><i style={{ width: `${(v.xp / xpToNext(v.level)) * 100}%` }} /></div>
            <div className="muted small">{activityText(game, v)}{v.points > 0 && <b className="points"> · {v.points} pts</b>}</div>
            <Attrs v={v} onRaise={(a) => act((g) => raise(g, v.id, a))} />
            <Traits v={v} />
            {options.length > 0 && (
              <select value="" onChange={(e) => act((g) => specialize(g, v.id, e.target.value as (typeof SPEC_IDS)[number]))}>
                <option value="">✨ Specialize…</option>
                {options.map((s) => <option key={s} value={s}>{SPECS[s].name}: {SPECS[s].desc}</option>)}
              </select>
            )}
          </div>
        )
      })}
    </footer>
  )
}

/** Everything sent and received on Trade Routes, summed over the cycles, or null if there was no trade. */
function tradeTotals(events: GameEvent[]) {
  const gave: Bag = {}
  const got: Bag = {}
  const add = (to: Bag, from: Bag) => { for (const [r, n] of Object.entries(from)) to[r as Res] = (to[r as Res] ?? 0) + n }
  for (const e of events) if (e.kind === 'traded') { add(gave, e.gave); add(got, e.got) }
  return Object.keys(got).length ? { gave, got } : null
}

function ReportModal({ report, onClose }: { report: Report; onClose: () => void }) {
  const gained = RESOURCES.map((r) => [r, report.after[r] - report.before[r]] as const).filter(([, n]) => Math.abs(n) >= 1)
  const lines = [...new Set(report.events.filter((e) => e.kind !== 'traded').map(describe))]
  const trade = tradeTotals(report.events)
  if (trade) lines.push(`🐪 Trade Routes sent ${costText(trade.gave)}, received ${costText(trade.got)}`)
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="panel modal" role="dialog" aria-modal="true" aria-labelledby="report-title" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow" id="report-title">While you were away</div>
        <h2>{dur(report.seconds)}{report.capped && <span className="muted small"> (capped)</span>}</h2>
        <div className="gains">
          {gained.length ? gained.map(([r, n]) => <div key={r} className={n < 0 ? 'neg' : ''} aria-label={`${RES_NAME[r]} ${n > 0 ? '+' : ''}${fmt(n)}`}>{RES_ICON[r]} {n > 0 ? '+' : ''}{fmt(n)}</div>) : <span className="muted">Nothing was produced. Assign Villagers to Jobs!</span>}
        </div>
        {lines.length > 0 && <ul className="events">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
        <button onClick={onClose}>Continue</button>
      </div>
    </div>
  )
}
