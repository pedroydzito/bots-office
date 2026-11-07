import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getBotAsset } from './shapes'
import { isDark, resolveColor, STATUS } from '../lib/constants'
import { planPath, SEAT_Y } from './layout'
import { botPositions, poiKey, poiTaken, seatYaw } from './registry'
import Confetti from './Confetti'

const rand = (a, b) => a + Math.random() * (b - a)
const pick = (a) => a[Math.floor(Math.random() * a.length)]
const REPLIES = ['Fechado, já vejo', 'Faz sentido!', 'Manda pra mim', 'Hmm, deixa eu ver', 'Adorei', 'Me dá 5 min', 'Combinado', 'Bora!']

function lerpAngle(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * t
}

const eyeGeo = new THREE.SphereGeometry(0.05, 20, 14)
const glintGeo = new THREE.SphereGeometry(0.014, 10, 8)
const handGeo = new THREE.SphereGeometry(0.068, 20, 14)
const ringGeo = new THREE.RingGeometry(0.42, 0.5, 48)
const mouthGeo = new THREE.TorusGeometry(0.035, 0.009, 8, 20, Math.PI)
const blackMat = new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.25 })
const whiteMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2 })
const glintMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const blushGeo = new THREE.CircleGeometry(0.045, 20)
const blushMat = new THREE.MeshBasicMaterial({ color: '#ff8fb1', transparent: true, opacity: 0.55, depthWrite: false })
const mugGeo = new THREE.CylinderGeometry(0.05, 0.045, 0.1, 14)
const mugMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 })
const photoRimMat = new THREE.MeshBasicMaterial({ color: '#ffffff' })
const photoCache = new Map()
function photoTexture(url) {
  if (!photoCache.has(url)) {
    const t = new THREE.TextureLoader().load(url)
    t.colorSpace = THREE.SRGBColorSpace
    photoCache.set(url, t)
  }
  return photoCache.get(url)
}

function Accessory({ kind, asset, color }) {
  const top = asset.top
  if (kind === 'antenna')
    return (
      <group position={[0, top - 0.02, 0]}>
        <mesh position={[0, 0.1, 0]} castShadow>
          <cylinderGeometry args={[0.012, 0.012, 0.2, 8]} />
          <meshStandardMaterial color="#2a2a2e" />
        </mesh>
        <mesh position={[0, 0.22, 0]} castShadow>
          <sphereGeometry args={[0.045, 16, 12]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.4} />
        </mesh>
      </group>
    )
  if (kind === 'stem')
    return (
      <group position={[0, top - 0.03, 0]}>
        <mesh position={[0, 0.07, 0]} rotation={[0, 0, 0.2]} castShadow>
          <cylinderGeometry args={[0.018, 0.022, 0.14, 8]} />
          <meshStandardMaterial color="#6b4423" />
        </mesh>
        <mesh position={[0.07, 0.12, 0]} rotation={[0, 0, -0.6]} scale={[1, 0.45, 0.25]} castShadow>
          <sphereGeometry args={[0.08, 16, 12]} />
          <meshStandardMaterial color="#3fb15d" />
        </mesh>
      </group>
    )
  if (kind === 'bow')
    return (
      <group position={[0.16, top - 0.06, 0.05]} rotation={[0, 0, -0.35]}>
        {[-1, 1].map((s) => (
          <mesh key={s} position={[s * 0.06, 0, 0]} rotation={[0, 0, (s * Math.PI) / 2]} castShadow>
            <coneGeometry args={[0.055, 0.11, 16]} />
            <meshStandardMaterial color="#ff5fa2" roughness={0.4} />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.03, 12, 10]} />
          <meshStandardMaterial color="#ff5fa2" />
        </mesh>
      </group>
    )
  if (kind === 'glasses')
    return (
      <group>
        {asset.photoFace && (
          <group position={[0, asset.photoFace.y, asset.photoFace.z]}>
            <mesh material={photoRimMat}>
              <circleGeometry args={[asset.photoFace.r * 1.08, 48]} />
            </mesh>
            <mesh position={[0, 0, 0.002]}>
              <circleGeometry args={[asset.photoFace.r, 48]} />
              {bot.photo ? <meshBasicMaterial map={photoTexture(bot.photo)} toneMapped={false} /> : <meshBasicMaterial color={color} />}
            </mesh>
          </group>
        )}
        {!(asset.photoFace && bot.photo) && asset.blush.map((e, i) => (
          <group key={'b' + i} position={e.position} quaternion={e.quaternion}>
            <mesh geometry={blushGeo} material={blushMat} scale={[1.3, 0.8, 1]} />
          </group>
        ))}
        {!(asset.photoFace && bot.photo) && asset.eyes.map((e, i) => (
          <mesh key={i} position={e.position} quaternion={e.quaternion}>
            <torusGeometry args={[0.072, 0.012, 8, 28]} />
            <meshStandardMaterial color="#111" roughness={0.3} />
          </mesh>
        ))}
        <mesh position={[0, asset.eyes[0].position[1] + 0.01, (asset.eyes[0].position[2] + asset.eyes[1].position[2]) / 2 + 0.01]}>
          <boxGeometry args={[Math.abs(asset.eyes[1].position[0] - asset.eyes[0].position[0]) - 0.13, 0.014, 0.014]} />
          <meshStandardMaterial color="#111" />
        </mesh>
      </group>
    )
  return null
}

function StatusIcon({ status, talking }) {
  if (talking)
    return (
      <div className="sb sb-talk">
        <svg viewBox="0 0 24 24" width="15" height="15"><path d="M4 5h16v10H9l-5 4z" fill="currentColor" /></svg>
      </div>
    )
  switch (status) {
    case 'working':
      return (
        <div className="sb sb-working">
          <i /><i /><i />
        </div>
      )
    case 'done':
      return (
        <div className="sb sb-done">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
      )
    case 'waiting_user':
      return <div className="sb sb-waiting">!</div>
    case 'error':
      return (
        <div className="sb sb-error">
          <svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" /></svg>
        </div>
      )
    default:
      return <div className="sb sb-resting">z<i>z</i><i>z</i><i>z</i></div>
  }
}

/**
 * A bot character. Movement is goal-driven:
 *  - `goal` prop (talk spot / elevator) overrides everything,
 *  - otherwise resting/finished bots occasionally wander to a point of interest,
 *  - otherwise the bot sits at its seat.
 */
function Bot({
  bot, status, layout, seat, goal, talkView, floorY, selected, spotlight,
  onSelect, onGone, spawnAtGoal, night,
}) {
  const asset = useMemo(() => getBotAsset(bot.shape), [bot.shape])
  const color = resolveColor(bot.color)
  const dark = isDark(color)
  const mat = useMemo(
    () => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0 }),
    [color],
  )
  useEffect(() => () => mat.dispose(), [mat])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.5, depthWrite: false }), [])

  const root = useRef()
  const body = useRef()
  const eyesRef = useRef([])
  const hands = useRef([])
  const mug = useRef()
  const ring = useRef()
  const phase = useMemo(() => Math.random() * 10, [])

  const [hover, setHover] = useState(false)
  const [hidden, setHidden] = useState(() => !!(goal && spawnAtGoal && goal.hideOnArrive))
  const [arrivedKind, setArrivedKind] = useState(null)
  const [speech, setSpeech] = useState(false)
  const [confetti, setConfetti] = useState(0)
  const [turn, setTurn] = useState(0)
  const [partnerNear, setPartnerNear] = useState(false)

  const P = useRef({})
  P.current = { status, goal, seat, layout, onGone, talkView, hover }

  const S = useRef(null)
  if (!S.current) {
    let start = seat ? { x: seat.x, z: seat.z } : layout.elevator
    let atKind = seat ? 'seat' : 'elevator'
    if (goal && spawnAtGoal) {
      start = goal
      atKind = goal.kind
    }
    S.current = {
      pos: new THREE.Vector3(start.x, 0, start.z),
      y: atKind === 'seat' ? SEAT_Y : 0,
      yaw: goal && spawnAtGoal ? goal.yaw || 0 : 0,
      targetYaw: 0,
      key: goal && spawnAtGoal ? `${goal.kind}:${goal.x.toFixed(2)},${goal.z.toFixed(2)}` : atKind === 'seat' ? 'seat' : '',
      atKind,
      arrived: true,
      path: null,
      idx: 0,
      wander: null,
      nextWander: rand(6, 40),
      lookYaw: 0,
      nextLook: rand(2, 6),
      blinkAt: rand(1, 4),
      blinkUntil: 0,
      celebrate: -1,
      shake: -1,
      pendingCelebrate: false,
      pendingShake: false,
      hiddenFlag: !!(goal && spawnAtGoal && goal.hideOnArrive),
      gone: false,
      nextQuirk: rand(6, 16),
      quirk: null,
      quirkT: 0,
      landT: -1,
      holding: false,
    }
  }

  // Status transitions -> one-shot animations + speech bubble
  const prev = useRef({ status, step: bot.step, mounted: false })
  useEffect(() => {
    const p = prev.current
    if (p.mounted && (p.status !== status || p.step !== bot.step)) {
      if (status === 'done' && p.status !== 'done') {
        S.current.pendingCelebrate = true
        setConfetti((c) => c + 1)
      }
      if (status === 'error' && p.status !== 'error') S.current.pendingShake = true
      if (bot.step) {
        setSpeech(true)
        const id = setTimeout(() => setSpeech(false), 6500)
        prev.current = { status, step: bot.step, mounted: true }
        return () => clearTimeout(id)
      }
    }
    prev.current = { status, step: bot.step, mounted: true }
  }, [status, bot.step])

  // Alternate speech turns while talking
  const talking = !!talkView && arrivedKind === 'spot' && partnerNear && !hidden
  useEffect(() => {
    if (!talking) return
    const id = setInterval(() => setTurn((t) => t + 1), 2800)
    return () => clearInterval(id)
  }, [talking])

  useEffect(
    () => () => {
      botPositions.delete(bot.name)
      seatYaw.delete(bot.name)
      if (S.current?.wander) poiTaken.delete(poiKey(S.current.wander))
    },
    [bot.name],
  )

  useFrame(({ clock, camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const t = clock.elapsedTime
    const s = S.current
    const p = P.current
    if (!root.current || s.gone) return
    if (s.pendingCelebrate) {
      s.pendingCelebrate = false
      s.celebrate = t
    }
    if (s.pendingShake) {
      s.pendingShake = false
      s.shake = t
    }

    // ---- goal selection
    let g = p.goal
    if (!g) {
      const idleish = p.status === 'resting' || p.status === 'done'
      if (s.wander && (!idleish || (s.wander.until && t > s.wander.until))) {
        poiTaken.delete(poiKey(s.wander))
        s.wander = null
      }
      if (!s.wander && idleish && p.seat && t > s.nextWander) {
        s.nextWander = t + rand(30, 80)
        const free = p.layout.pois.filter((q) => !poiTaken.has(poiKey(q)))
        if (free.length) {
          s.wander = { ...pick(free), until: null }
          poiTaken.add(poiKey(s.wander))
        }
      }
      g = s.wander || (p.seat ? { kind: 'seat', x: p.seat.x, z: p.seat.z, az: p.seat.az, ex: p.seat.ex, yaw: 0 } : p.layout.elevator)
    }
    const key = g.kind === 'seat' ? 'seat' : `${g.kind}:${g.x.toFixed(2)},${g.z.toFixed(2)}`
    if (key !== s.key) {
      s.key = key
      const from = s.atKind === 'seat' && p.seat ? p.seat : { x: s.pos.x, z: s.pos.z, az: s.pos.z }
      s.path = planPath(from, g, p.layout)
      s.idx = 1
      s.arrived = s.path.length < 2
      s.atKind = 'walk'
      s.goal = g
      if (s.hiddenFlag) {
        s.hiddenFlag = false
        setHidden(false)
      }
      setArrivedKind(null)
      if (s.arrived) arrive()
    }
    s.goal = g

    function arrive() {
      s.arrived = true
      s.atKind = g.kind
      setArrivedKind(g.kind)
      if (g.kind === 'seat') s.landT = t
      if (g.kind === 'coffee') s.holding = true
      if (g.kind === 'seat') s.holding = false
      if (s.wander && g === s.wander) s.wander.until = t + rand(6, 14)
      if (g.hideOnArrive && !s.hiddenFlag) {
        s.hiddenFlag = true
        setHidden(true)
      }
      if (g.goneOnArrive) {
        s.gone = true
        p.onGone && p.onGone()
      }
    }

    // ---- locomotion (stand up first, then walk)
    let moving = false
    if (!s.arrived && s.y < 0.08) {
      const tgt = s.path[s.idx]
      const dx = tgt[0] - s.pos.x, dz = tgt[1] - s.pos.z
      const d = Math.hypot(dx, dz)
      const step = 1.55 * dt
      if (d <= step) {
        s.pos.x = tgt[0]
        s.pos.z = tgt[1]
        s.idx++
        if (s.idx >= s.path.length) arrive()
      } else {
        s.pos.x += (dx / d) * step
        s.pos.z += (dz / d) * step
        s.targetYaw = Math.atan2(dx, dz)
        moving = true
      }
    }

    // ---- facing
    if (s.arrived) {
      if (g.kind === 'seat') {
        if (t > s.nextLook) {
          s.nextLook = t + rand(3, 8)
          s.lookYaw = p.status === 'working' ? (Math.random() < 0.3 ? rand(-0.8, 0.8) : 0) : rand(-0.7, 0.7)
          if (p.status === 'working') setTimeout(() => (s.lookYaw = 0), 1600)
        }
        if (p.status === 'waiting_user') {
          const ang = Math.atan2(camera.position.x - s.pos.x, camera.position.z - s.pos.z)
          s.targetYaw = Math.max(-1.2, Math.min(1.2, ang))
        } else s.targetYaw = s.lookYaw
      } else if (g.yaw != null) s.targetYaw = g.yaw
    }
    // seated bots swivel less, and the chair turns with them
    const seated = s.arrived && g.kind === 'seat'
    if (seated) s.targetYaw = Math.max(-0.55, Math.min(0.55, s.targetYaw))
    s.yaw = lerpAngle(s.yaw, s.targetYaw, 1 - Math.exp(-dt * 7))
    if (seated && s.y > 0.3) seatYaw.set(bot.name, s.yaw)
    else seatYaw.delete(bot.name)

    // soft collisions: standing/walking bots never overlap each other
    if (!seated && !s.hiddenFlag) {
      for (const [other, q] of botPositions) {
        if (other === bot.name) continue
        const dx = s.pos.x - q.x, dz = s.pos.z - q.z
        const d = Math.hypot(dx, dz)
        const minD = 0.82
        if (d < minD) {
          const k = ((minD - d) / minD) * Math.min(1, dt * 12) * 0.55
          const nx = d > 1e-4 ? dx / d : Math.cos(phase), nz = d > 1e-4 ? dz / d : Math.sin(phase)
          s.pos.x += nx * k * minD
          s.pos.z += nz * k * minD
        }
      }
      // stay inside the room
      s.pos.x = Math.max(-p.layout.W / 2 + 0.45, Math.min(p.layout.W / 2 - 0.45, s.pos.x))
      s.pos.z = Math.max(-p.layout.D / 2 + 0.45, Math.min(p.layout.D / 2 - 0.45, s.pos.z))
    }

    const wantY = s.arrived && g.kind === 'seat' ? SEAT_Y : 0
    s.y += (wantY - s.y) * (1 - Math.exp(-dt * 9))
    root.current.position.set(s.pos.x, s.y, s.pos.z)
    root.current.rotation.y = s.yaw
    if (s.hiddenFlag) botPositions.delete(bot.name)
    else {
      const bp = botPositions.get(bot.name) || new THREE.Vector3()
      bp.set(s.pos.x, floorY + s.y + 0.6, s.pos.z)
      botPositions.set(bot.name, bp)
    }

    // ---- body animation
    let by = 0, rx = 0, rz = 0, ry = 0, sy = 1, eyeY = 1, jx = 0
    let hl = 0, hr = 0, hz = 0
    const st = p.status
    let isTalking = false
    if (p.talkView && s.arrived && g.kind === 'spot') {
      const q = botPositions.get(p.talkView.partner)
      const near = !!q && Math.hypot(q.x - s.pos.x, q.z - s.pos.z) < 1.9 && Math.abs(q.y - (floorY + s.y + 0.6)) < 1
      if (near !== s.partnerNear) {
        s.partnerNear = near
        setPartnerNear(near)
      }
      isTalking = near
    } else if (s.partnerNear) {
      s.partnerNear = false
      setPartnerNear(false)
    }
    if (moving) {
      by = Math.abs(Math.sin(t * 11 + phase)) * 0.07
      rz = Math.sin(t * 11 + phase) * 0.09
      hl = Math.sin(t * 11) * 0.06
      hr = -hl
    } else if (isTalking) {
      const mine = (p.talkView.role === 'visitor') === (Math.floor(t / 2.8) % 2 === 0)
      if (mine) {
        by = Math.abs(Math.sin(t * 7 + phase)) * 0.05
        rz = Math.sin(t * 3.5) * 0.07
        hl = 0.12 + Math.sin(t * 8) * 0.08
        hr = 0.06 + Math.sin(t * 6 + 1) * 0.06
        hz = 0.06
      } else {
        rx = Math.sin(t * 2.4) * 0.07
        sy = 1 + Math.sin(t * 2) * 0.02
      }
    } else if (st === 'working' && s.atKind === 'seat') {
      by = Math.abs(Math.sin(t * 9 + phase)) * 0.018
      rx = 0.12
      hl = Math.max(0, Math.sin(t * 17 + phase)) * 0.05
      hr = Math.max(0, Math.sin(t * 17 + phase + Math.PI)) * 0.05
      hz = 0.1
    } else if (st === 'waiting_user') {
      const b = Math.abs(Math.sin(t * 4.5 + phase))
      by = b * 0.14
      sy = 1 + (b < 0.15 ? -0.08 : 0.03)
      hl = b * 0.18
    } else if (st === 'error') {
      sy = 1 + Math.sin(t * 2) * 0.015
      if (t - s.shake < 1.6 || (t + phase) % 5 < 0.45) {
        jx = Math.sin(t * 55) * 0.035
        rz = Math.sin(t * 48) * 0.07
      }
    } else if (st === 'done') {
      const ct = t - s.celebrate
      if (s.celebrate >= 0 && ct < 1.8) {
        by = Math.abs(Math.sin(ct * 7)) * 0.42
        ry = Math.min(1, ct / 1.4) * Math.PI * 2
        hl = hr = 0.25
        sy = 1 + Math.sin(ct * 14) * 0.06
      } else {
        rz = Math.sin(t * 1.6 + phase) * 0.05
        sy = 1 + Math.sin(t * 2 + phase) * 0.02
        if ((t + phase) % 9 < 0.6) by = Math.abs(Math.sin((t + phase) * 10)) * 0.08
      }
    } else {
      // resting
      sy = 1 + Math.sin(t * 1.2 + phase) * 0.03
      if (s.atKind === 'seat') {
        rx = -0.05
        eyeY = 0.12
      }
      rz = Math.sin(t * 0.6 + phase) * 0.04
    }
    if (t > s.blinkAt) {
      s.blinkUntil = t + 0.12
      s.blinkAt = t + rand(2.5, 6)
    }
    if (t < s.blinkUntil) eyeY = Math.min(eyeY, 0.1)

    // ---- quirks: short one-off gestures that keep the office alive
    if (!moving && !isTalking && t > s.nextQuirk) {
      s.nextQuirk = t + rand(9, 22)
      s.quirkT = t
      s.quirk = st === 'working' ? pick(['think', 'stretch', 'nod']) : st === 'resting' ? pick(['yawn', 'stretch']) : st === 'error' ? 'facepalm' : st === 'done' ? 'cheer' : pick(['stretch', 'look'])
    }
    const qt = t - s.quirkT
    if (s.quirk && qt < 2.2) {
      const k = Math.sin(Math.min(1, qt / 2.2) * Math.PI)
      switch (s.quirk) {
        case 'think': hr = 0.2 * k; hz = 0.12 * k; rz = 0.12 * k; hl *= 1 - k; break
        case 'stretch': hl = hr = 0.42 * k; sy *= 1 + 0.08 * k; rx -= 0.1 * k; break
        case 'yawn': sy *= 1 + 0.06 * k; hl = hr = 0.3 * k; eyeY = Math.min(eyeY, 0.15); break
        case 'nod': rx += Math.sin(qt * 9) * 0.08 * k; break
        case 'facepalm': hr = 0.38 * k; hz = 0.18 * k; rx += 0.15 * k; break
        case 'cheer': hl = hr = 0.45 * k; by += Math.abs(Math.sin(qt * 8)) * 0.12 * k; break
        case 'look': ry += Math.sin(qt * 3) * 0.5 * k; break
      }
    } else s.quirk = null
    // waiting: wave both arms; hover: wave hello
    if (st === 'waiting_user' && !moving && !isTalking) {
      hl = 0.38 + Math.sin(t * 9) * 0.08
      hr = 0.38 + Math.sin(t * 9 + Math.PI) * 0.08
    }
    if (p.hover && !moving) {
      hr = 0.4 + Math.sin(t * 12) * 0.07
      hz = 0.05
    }
    // landing squash when sitting down
    const lt = t - s.landT
    if (s.landT >= 0 && lt < 0.45) sy *= 1 - Math.sin((lt / 0.45) * Math.PI) * 0.12
    const b = body.current
    b.position.set(jx, by, 0)
    b.rotation.set(rx, ry, rz)
    const sx = 1 / Math.sqrt(sy)
    b.scale.set(sx, sy, sx)
    for (const e of eyesRef.current) if (e) e.scale.y += (eyeY - e.scale.y) * Math.min(1, dt * 25)
    const hw = asset.width / 2 + 0.03
    if (hands.current[0]) hands.current[0].position.set(-hw, 0.22 + hl, 0.08 + hz)
    if (hands.current[1]) hands.current[1].position.set(hw, 0.22 + hr, 0.08 + hz)
    if (mug.current) {
      mug.current.visible = s.holding
      mug.current.position.set(hw + 0.02, 0.3 + hr, 0.12 + hz)
    }

    if (st === 'error') mat.emissive.setRGB(0.6 * (0.5 + 0.5 * Math.sin(t * 6)), 0, 0)
    else mat.emissive.setRGB(0, 0, 0)

    if (ring.current) {
      ring.current.position.y = -s.y + 0.015
      const pulse = st === 'waiting_user' || st === 'error' ? 0.5 + 0.5 * Math.sin(t * 5) : 0.6
      ringMat.opacity = (st === 'resting' ? 0 : 0.55) * pulse
      const sc = st === 'waiting_user' ? 1 + 0.15 * Math.sin(t * 5) : 1
      ring.current.scale.setScalar(sc)
    }
  })

  const statusColor = STATUS[status]?.color || '#999'
  useEffect(() => {
    ringMat.color.set(statusColor)
  }, [statusColor, ringMat])

  const iconY = asset.top + 0.42
  let speechText = null
  if (talking) {
    const visitorTurn = turn % 2 === 0
    const mine = (talkView.role === 'visitor') === visitorTurn
    if (mine) speechText = talkView.role === 'visitor' ? talkView.step : REPLIES[(talkView.seed + turn) % REPLIES.length]
  } else if (speech || hover || selected || spotlight) {
    speechText = bot.step || STATUS[status]?.label
  }

  return (
    <group ref={root}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} geometry={ringGeo} material={ringMat} visible={!hidden} />
      <group ref={body} visible={!hidden}>
        <mesh
          geometry={asset.geometry}
          material={mat}
          castShadow
          receiveShadow
          onPointerOver={(e) => {
            e.stopPropagation()
            setHover(true)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => {
            setHover(false)
            document.body.style.cursor = ''
          }}
          onClick={(e) => {
            e.stopPropagation()
            onSelect && onSelect(bot.name)
          }}
        />
        {asset.eyes.map((e, i) => (
          <group key={i} position={e.position} quaternion={e.quaternion}>
            <mesh ref={(m) => (eyesRef.current[i] = m)} geometry={eyeGeo} material={dark ? whiteMat : blackMat} scale={[0.85, 1.25, 0.45]}>
              {!dark && <mesh geometry={glintGeo} material={glintMat} position={[0.018, 0.022, 0.045]} />}
            </mesh>
          </group>
        ))}
        {asset.mouth && !(asset.photoFace && bot.photo) && (status === 'done' || talking || status === 'waiting_user') && (
          <group position={asset.mouth.position} quaternion={asset.mouth.quaternion}>
            <mesh geometry={mouthGeo} material={dark ? whiteMat : blackMat} rotation={[0, 0, Math.PI]} />
          </group>
        )}
        {[0, 1].map((i) => (
          <mesh key={i} ref={(m) => (hands.current[i] = m)} geometry={handGeo} material={mat} castShadow />
        ))}
        <mesh ref={mug} geometry={mugGeo} material={mugMat} visible={false} castShadow />
        <Accessory kind={bot.accessory} asset={asset} color={color} />
      </group>
      {!hidden && (
        <Html position={[0, iconY, 0]} center distanceFactor={10} zIndexRange={[30, 0]} pointerEvents="none">
          <div className={`bot-tag${selected ? ' sel' : ''}`}>
            {speechText && (
              <div className={`speech ${talking ? 'talk' : ''}`}>
                {!talking && <b>{bot.name}</b>}
                <span>{speechText}</span>
              </div>
            )}
            <StatusIcon status={status} talking={talking} />
            {(hover || selected) && !speechText && <div className="name-chip">{bot.name}</div>}
          </div>
        </Html>
      )}
      {confetti > 0 && !hidden && <Confetti key={confetti} y={asset.top + 0.2} />}
    </group>
  )
}

const goalKey = (g) => (g ? `${g.kind}:${g.x.toFixed(2)},${g.z.toFixed(2)}:${g.hideOnArrive ? 1 : 0}${g.goneOnArrive ? 1 : 0}` : '')
const talkKey = (t) => (t ? `${t.role}|${t.partner}|${t.step}` : '')
function same(a, b) {
  return (
    a.bot === b.bot && a.status === b.status && a.seat === b.seat && a.layout === b.layout &&
    a.floorY === b.floorY && a.selected === b.selected && a.spotlight === b.spotlight && a.night === b.night &&
    goalKey(a.goal) === goalKey(b.goal) && talkKey(a.talkView) === talkKey(b.talkView)
  )
}
export default memo(Bot, same)
