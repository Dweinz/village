import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, SoftShadows } from '@react-three/drei'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import type { Group } from 'three'
import type { BuildingType } from './sim/data'
import { currentJob, type Game, type Villager } from './sim/game'

export const PLOT_POS: [number, number][] = [
  [0, 0],
  ...Array.from({ length: 8 }, (_, i): [number, number] => {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    return [Math.cos(a) * 6, Math.sin(a) * 6]
  }),
]

// Flat-shaded material shorthand: the whole low-poly look is this plus soft shadows.
const M = ({ c, e }: { c: string; e?: string }) => <meshStandardMaterial color={c} flatShading emissive={e ?? '#000'} emissiveIntensity={e ? 1.2 : 0} />

function Part({ p = [0, 0, 0], r = [0, 0, 0], children }: { p?: [number, number, number]; r?: [number, number, number]; children: ReactNode }) {
  return <mesh position={p} rotation={r} castShadow receiveShadow>{children}</mesh>
}

function Hut({ w, d, h, body, roof, x = 0, z = 0 }: { w: number; d: number; h: number; body: string; roof: string; x?: number; z?: number }) {
  return (
    <group position={[x, 0, z]}>
      <Part p={[0, h / 2, 0]}><boxGeometry args={[w, h, d]} /><M c={body} /></Part>
      <Part p={[0, h + h * 0.3, 0]} r={[0, Math.PI / 4, 0]}><coneGeometry args={[Math.max(w, d) * 0.78, h * 0.6, 4]} /><M c={roof} /></Part>
    </group>
  )
}

function Tree({ x, z, s = 1 }: { x: number; z: number; s?: number }) {
  return (
    <group position={[x, 0, z]} scale={s}>
      <Part p={[0, 0.3, 0]}><cylinderGeometry args={[0.08, 0.12, 0.6, 5]} /><M c="#7a5233" /></Part>
      <Part p={[0, 1, 0]}><coneGeometry args={[0.5, 1.2, 6]} /><M c="#3f8f4f" /></Part>
    </group>
  )
}

function Building({ type, level }: { type: BuildingType; level: number }) {
  const h = 0.7 + 0.25 * level
  switch (type) {
    case 'townhall':
      return (
        <>
          <Hut w={2} d={1.8} h={h} body="#f2e6d0" roof="#c4553b" />
          <Part p={[0.9, h * 0.9, 0.8]}><cylinderGeometry args={[0.35, 0.35, h * 1.8, 8]} /><M c="#e6d6b8" /></Part>
          <Part p={[0.9, h * 1.8 + 0.4, 0.8]}><coneGeometry args={[0.45, 0.8, 8]} /><M c="#c4553b" /></Part>
        </>
      )
    case 'farm':
      return (
        <>
          <Hut w={1} d={1.2} h={0.8} body="#b5473a" roof="#5b3a2a" x={-0.7} />
          {Array.from({ length: 2 + level }, (_, i) => (
            <Part key={i} p={[0.6, 0.08, -1 + i * 0.45]}><boxGeometry args={[1, 0.16, 0.3]} /><M c={i % 2 ? '#e2c044' : '#9cbf4a'} /></Part>
          ))}
        </>
      )
    case 'lumbercamp':
      return (
        <>
          <Hut w={1.1} d={1} h={0.8} body="#8a5a36" roof="#4e6b3a" x={-0.4} />
          {Array.from({ length: level }, (_, i) => (
            <Part key={i} p={[0.8, 0.12 + (i % 2) * 0.22, -0.4 + Math.floor(i / 2) * 0.3]} r={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[0.12, 0.12, 0.9, 6]} /><M c="#a4703f" /></Part>
          ))}
          <Tree x={0.6} z={0.9} s={0.8} />
        </>
      )
    case 'house':
      return (
        <>
          <Hut w={1} d={1} h={0.8} body="#f4efe6" roof="#4a76a8" />
          {level >= 3 && <Hut w={0.8} d={0.8} h={0.6} body="#efe6d6" roof="#4a76a8" x={1} z={0.6} />}
        </>
      )
    case 'tavern':
      return (
        <>
          <Hut w={1.8} d={1.3} h={h} body="#d9a066" roof="#7a3b2e" />
          <Part p={[0, h * 0.5, 0.66]}><boxGeometry args={[1.2, 0.3, 0.02]} /><M c="#ffb347" e="#ff9a2e" /></Part>
        </>
      )
    case 'quarry':
      return (
        <>
          {Array.from({ length: 2 + level }, (_, i) => (
            <Part key={i} p={[(i % 3) * 0.6 - 0.6, 0.25 + Math.floor(i / 3) * 0.5, (i % 2) * 0.4 - 0.2]}><boxGeometry args={[0.55, 0.5, 0.55]} /><M c={i % 2 ? '#9a9a9a' : '#b8b8b0'} /></Part>
          ))}
        </>
      )
    case 'mine':
      return (
        <>
          <Part p={[0, 0.6, -0.2]}><dodecahedronGeometry args={[1.1, 0]} /><M c="#76706a" /></Part>
          <Part p={[0, 0.35, 0.8]}><boxGeometry args={[0.6, 0.7, 0.2]} /><M c="#2a2522" /></Part>
          <Part p={[0.7, 0.2, 1]}><boxGeometry args={[0.4, 0.25, 0.3]} /><M c="#c27b3f" /></Part>
        </>
      )
    case 'guildhall':
      return (
        <>
          <Hut w={1.6} d={1.4} h={h} body="#e8e2f0" roof="#6b4fa0" />
          <Part p={[-0.8, h, -0.7]}><cylinderGeometry args={[0.3, 0.3, h * 2, 8]} /><M c="#d8d0e6" /></Part>
          <Part p={[-0.8, h * 2 + 0.35, -0.7]}><coneGeometry args={[0.4, 0.7, 8]} /><M c="#6b4fa0" /></Part>
        </>
      )
  }
}

/** Pops in on mount; keyed on level so upgrades pop too. */
function PopIn({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null)
  useFrame((_, dt) => {
    const s = ref.current!.scale.x
    if (s < 1) ref.current!.scale.setScalar(Math.min(1, s + (1.05 - s) * dt * 8))
  })
  return <group ref={ref} scale={0.01}>{children}</group>
}

function PlotView({ i, game, selected, onSelect }: { i: number; game: Game; selected: boolean; onSelect: (i: number) => void }) {
  const [hover, setHover] = useState(false)
  const plot = game.plots[i]
  const [x, z] = PLOT_POS[i]
  return (
    <group
      position={[x, 0, z]}
      onClick={(e) => { e.stopPropagation(); onSelect(i) }}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = '' }}
    >
      <mesh position={[0, 0.03, 0]} receiveShadow>
        <cylinderGeometry args={[1.8, 1.8, 0.06, 24]} />
        <meshStandardMaterial color={plot ? '#cdb98e' : hover ? '#d9caa2' : '#bfae84'} transparent opacity={plot ? 1 : 0.7} />
      </mesh>
      {(selected || hover) && (
        <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.85, 2.05, 48]} />
          <meshBasicMaterial color={selected ? '#ffffff' : '#fff5d6'} transparent opacity={selected ? 0.95 : 0.5} />
        </mesh>
      )}
      {plot && <PopIn key={plot.type + plot.level}><Building type={plot.type} level={plot.level} /></PopIn>}
    </group>
  )
}

const VILLAGER_COLORS = ['#e07a5f', '#3d85c6', '#81b29a', '#f2cc8f', '#9b5de5', '#f15bb5', '#00bbf9', '#ee964b']

function VillagerView({ v, index }: { v: Villager; index: number }) {
  const ref = useRef<Group>(null)
  // Workers stand at their plot's edge, idle Villagers mill around the Town Hall plaza.
  const work = currentJob(v)
  const [bx, bz] = work ? PLOT_POS[work.plot] : [0, 0]
  const a = index * 2.4
  const r = work ? 1.6 : 2.4
  useFrame(({ clock }) => {
    const t = clock.elapsedTime + v.id
    const g = ref.current!
    const wander = work ? 0 : Math.sin(t * 0.3) * 0.6
    g.position.set(bx + Math.cos(a + wander) * r, Math.abs(Math.sin(t * (work ? 6 : 2))) * (work ? 0.12 : 0.05), bz + Math.sin(a + wander) * r)
  })
  const c = VILLAGER_COLORS[v.id % VILLAGER_COLORS.length]
  return (
    <group ref={ref}>
      <Part p={[0, 0.3, 0]}><capsuleGeometry args={[0.14, 0.26, 4, 8]} /><M c={c} /></Part>
      <Part p={[0, 0.62, 0]}><sphereGeometry args={[0.13, 8, 6]} /><M c="#f1c7a3" /></Part>
    </group>
  )
}

function Island() {
  const trees = useMemo(() => Array.from({ length: 36 }, (_, i) => {
    const a = i * 2.4 + Math.sin(i) * 0.3
    const r = 9 + ((i * 37) % 17) / 10
    return { x: Math.cos(a) * r, z: Math.sin(a) * r, s: 0.7 + ((i * 13) % 7) / 10 }
  }), [])
  return (
    <>
      <mesh position={[0, -0.4, 0]} receiveShadow>
        <cylinderGeometry args={[11, 11.4, 0.8, 32]} />
        <meshStandardMaterial color="#7cb85c" flatShading />
      </mesh>
      <mesh position={[0, -1.6, 0]}>
        <cylinderGeometry args={[11.4, 7, 1.6, 32]} />
        <meshStandardMaterial color="#8b6a4a" flatShading />
      </mesh>
      <mesh position={[0, -1.2, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[80, 64]} />
        <meshStandardMaterial color="#5fb3c9" />
      </mesh>
      {trees.map((t, i) => <Tree key={i} {...t} />)}
    </>
  )
}

export function Scene({ game, selected, onSelect }: { game: Game; selected: number | null; onSelect: (i: number | null) => void }) {
  return (
    <Canvas shadows camera={{ position: [18, 17, 18], fov: 32 }} gl={{ alpha: true }} onPointerMissed={() => onSelect(null)}>
      <SoftShadows size={20} samples={12} />
      <fog attach="fog" args={['#cfe6ee', 40, 90]} />
      <hemisphereLight args={['#fff4e0', '#4f7a5a', 1.1]} />
      <directionalLight
        position={[12, 20, 8]} intensity={2} castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14} shadow-camera-right={14} shadow-camera-top={14} shadow-camera-bottom={-14}
      />
      <Island />
      {PLOT_POS.map((_, i) => <PlotView key={i} i={i} game={game} selected={selected === i} onSelect={onSelect} />)}
      {game.villagers.map((v, i) => <VillagerView key={v.id} v={v} index={i} />)}
      <OrbitControls makeDefault enablePan={false} minDistance={16} maxDistance={45} minPolarAngle={0.45} maxPolarAngle={1.15} />
    </Canvas>
  )
}
