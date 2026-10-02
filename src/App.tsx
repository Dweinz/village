import { useEffect, useRef, useState } from 'react'
import { Scene } from './Scene'
import {
  ATTRS, ATTR_NAMES, BUILDINGS, RESOURCES, RES_ICON, SPECS, SPEC_IDS, SPEC_LEVEL, TRAITS,
  type Bag, type BuildingType, type Res,
} from './sim/data'
import {
  CHAPTERS, OFFLINE_CAP, REROLL_COST, advance, assign, build, buildCost, canAfford, canSpecialize, findJob, hire,
  hireCost, housing, jobsFor, maxLevel, newGame, raise, reroll, slots, specialize, unassign, upgrade, workers, xpToNext,
  type Game, type GameEvent, type Villager,
} from './sim/game'
import { fromSave, toSave } from './sim/save'

const SAVE_KEY = 'hearthhold-save'

interface Report { seconds: number; capped: boolean; before: Game['stock']; after: Game['stock']; events: GameEvent[] }

function boot(): { game: Game; report: Report | null } {
  let text = null
  try { text = localStorage.getItem(SAVE_KEY) } catch { /* storage blocked: start fresh */ }
  const saved = text === null ? null : fromSave(text)
  if (!saved) return { game: newGame(), report: null } // no save, or a corrupt one: start fresh
  const away = (Date.now() - saved.savedAt) / 1000
  const seconds = Math.min(away, OFFLINE_CAP)
  if (seconds < 60) return { game: advance(saved.game, Math.max(0, seconds)), report: null }
  const events: GameEvent[] = []
  const game = advance(saved.game, seconds, events)
  return { game, report: { seconds, capped: away > OFFLINE_CAP, before: saved.game.stock, after: game.stock, events } }
}

const fmt = (n: number) => (n < 1000 ? Math.floor(n).toString() : n < 1e6 ? (n / 1e3).toFixed(1) + 'k' : (n / 1e6).toFixed(1) + 'M')
const dur = (s: number) => (s < 60 ? `${Math.ceil(s)}s` : s < 3600 ? `${Math.floor(s / 60)}m ${Math.floor(s % 60)}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`)
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
    case 'chapter': return CHAPTERS[e.chapter] ? `📖 Chapter ${e.chapter + 1}: ${CHAPTERS[e.chapter].name}` : '🏆 All Chapters complete — more in v2!'
    case 'starving': return '⚠️ Food ran out — everyone works at half speed'
  }
}

export default function App() {
  const [initial] = useState(boot)
  const [game, setGame] = useState(initial.game)
  const [report, setReport] = useState(initial.report)
  const [selected, setSelected] = useState<number | null>(null)
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
      commit(advance(ref.current, Math.min((now - last) / 1000, OFFLINE_CAP), events))
      last = now
      events.forEach((e) => toast(describe(e)))
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
      <Scene game={game} selected={selected} onSelect={setSelected} />
      <TopBar game={game} onReset={reset} />
      <Objectives game={game} />
      {selected !== null && <PlotPanel game={game} plot={selected} act={act} onClose={() => setSelected(null)} />}
      <Roster game={game} act={act} />
      <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}</div>
      {report && <ReportModal report={report} onClose={() => setReport(null)} />}
    </>
  )
}

type Act = (fn: (g: Game) => Game) => void

function TopBar({ game, onReset }: { game: Game; onReset: () => void }) {
  return (
    <header className="panel topbar">
      <strong className="logo">Hearthhold</strong>
      {RESOURCES.map((r) => <span key={r} className="res" title={r}>{RES_ICON[r]} {fmt(game.stock[r])}</span>)}
      <span className="res" title="Villagers / Housing">👥 {game.villagers.length}/{housing(game)}</span>
      {game.starving && <span className="badge warn">Starving</span>}
      <button className="ghost" onClick={onReset} title="New game">↺</button>
    </header>
  )
}

function Objectives({ game }: { game: Game }) {
  const ch = CHAPTERS[game.chapter]
  return (
    <aside className="panel objectives">
      {ch ? (
        <>
          <div className="eyebrow">Chapter {game.chapter + 1}</div>
          <h2>{ch.name}</h2>
          <ul>{ch.objectives.map((o) => <li key={o.id} className={game.done.includes(o.id) ? 'done' : ''}>{o.text}</li>)}</ul>
        </>
      ) : <><div className="eyebrow">v1 complete</div><h2>Your town thrives</h2><p className="muted">Expeditions arrive in v2.</p></>}
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
                <div className="muted small">{locked ? `Unlocks in Chapter ${BUILDINGS[t].chapter + 1}` : <Cost bag={buildCost(t, 0)} game={game} />}</div>
              </div>
              <button disabled={locked || !canAfford(game, buildCost(t, 0))} onClick={() => act((g) => build(g, plot, t))}>Build</button>
            </div>
          )
        })}
      </aside>
    )
  }

  const def = BUILDINGS[p.type]
  const here = workers(game, plot)
  const idle = game.villagers.filter((v) => !v.job)
  const atMax = p.level >= maxLevel(game, p.type)
  return (
    <aside className="panel side">
      <div className="head"><h2>{def.name} <span className="lvl">Lv {p.level}</span></h2><button className="ghost" onClick={onClose}>✕</button></div>
      <div className="card row">
        <div className="small">
          {atMax ? <span className="muted">{p.type === 'townhall' ? 'Max level' : 'Upgrade the Town Hall to go higher'}</span> : <>Upgrade: <Cost bag={buildCost(p.type, p.level)} game={game} /></>}
        </div>
        <button disabled={atMax || !canAfford(game, buildCost(p.type, p.level))} onClick={() => act((g) => upgrade(g, plot))}>Upgrade</button>
      </div>
      {def.housing && <p className="muted small">Houses {def.housing * p.level} Villagers.</p>}
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
          {here.filter((v) => v.job!.job === j.id).map((v) => (
            <div key={v.id} className="worker">
              <span>{v.name}</span>
              <div className="bar"><i style={{ width: `${(v.job!.progress / j.duration) * 100}%` }} /></div>
              <button className="ghost small" onClick={() => act((g) => unassign(g, v.id))} title="Unassign">✕</button>
            </div>
          ))}
          {here.length < slots(p) && idle.length > 0 && (
            <select value="" onChange={(e) => act((g) => assign(g, Number(e.target.value), plot, j.id))}>
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
        const job = v.job && findJob(game.plots[v.job.plot]!.type, v.job.job)
        return (
          <div key={v.id} className="panel villager">
            <div className="row"><strong>{v.name}</strong><span className="lvl">Lv {v.level}</span></div>
            <div className="bar xp"><i style={{ width: `${(v.xp / xpToNext(v.level)) * 100}%` }} /></div>
            <div className="muted small">{job ? job.name : 'Idle'}{v.points > 0 && <b className="points"> · {v.points} pts</b>}</div>
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

function ReportModal({ report, onClose }: { report: Report; onClose: () => void }) {
  const gained = RESOURCES.map((r) => [r, report.after[r] - report.before[r]] as const).filter(([, n]) => Math.abs(n) >= 1)
  const lines = [...new Set(report.events.map(describe))]
  return (
    <div className="backdrop" onClick={onClose}>
      <div className="panel modal" onClick={(e) => e.stopPropagation()}>
        <div className="eyebrow">While you were away</div>
        <h2>{dur(report.seconds)}{report.capped && <span className="muted small"> (capped)</span>}</h2>
        <div className="gains">
          {gained.length ? gained.map(([r, n]) => <div key={r} className={n < 0 ? 'neg' : ''}>{RES_ICON[r]} {n > 0 ? '+' : ''}{fmt(n)}</div>) : <span className="muted">Nothing was produced. Assign Villagers to Jobs!</span>}
        </div>
        {lines.length > 0 && <ul className="events">{lines.map((l) => <li key={l}>{l}</li>)}</ul>}
        <button onClick={onClose}>Continue</button>
      </div>
    </div>
  )
}
