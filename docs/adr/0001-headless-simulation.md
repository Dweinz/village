# Game logic is a headless, time-stepped simulation

All game rules live in a pure TypeScript simulation with no rendering or DOM dependencies, advanced by elapsed time (`advance(state, seconds)`). React and React Three Fiber only read the state and dispatch player actions. We chose this so that Offline Progress is literally "advance by the time away" (capped) instead of a separate approximation, and so the economy can be unit-tested and balance-simulated without a browser. The consequence: no gameplay logic in components, scene code, or `useFrame` loops.
