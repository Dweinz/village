# Hearthhold

A real-time idle town-builder in the browser. Assign Villagers to Jobs, grow your Settlement through Chapters of Objectives, and come back to see what happened while you were away.

```bash
npm install
npm run dev     # play at http://localhost:5173
npm test        # simulation tests
```

- `CONTEXT.md` — the game's domain language. Use these terms in code and design.
- `docs/adr/` — architectural decisions.
- `src/sim/` — the headless simulation (all game rules). `data.ts` holds content and balance numbers.
- `src/Scene.tsx` — the three.js diorama (React Three Fiber). `src/App.tsx` — UI, game loop, saves.

Roadmap: **v1** town loop (this) → **v2** World Map, Expeditions, trade → **v3** multiple Settlements, Prestige.
