// mulberry32: a tiny seeded PRNG. Callers keep the state in plain data so the sim stays deterministic (ADR 0001).
export function mulberry32(state: number): [value: number, next: number] {
  const next = (state + 0x6d2b79f5) | 0
  let t = Math.imul(next ^ (next >>> 15), next | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next]
}
