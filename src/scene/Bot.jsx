import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getBotAsset } from './shapes'
import { isDark, resolveColor, STATUS } from '../lib/constants'
import { botPositions, poiKey, seatYaw, sitting } from './registry'
import { isSleepy, rnd, simBot, statusAt, syncNow } from './sim'
import { Clap, Heart, Laugh, Party, ThumbUp } from '../ui/Icons'
import { useStore } from '../lib/createStore'
import { dataStore } from '../lib/state'
import Confetti from './Confetti'

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
const bookGeo = new THREE.BoxGeometry(0.26, 0.2, 0.04)
const bookMat = new THREE.MeshStandardMaterial({ color: '#1E86FC', roughness: 0.6 })
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
  if (kind === 'headphones') {
    const w = asset.width / 2 + 0.02
    const y = asset.eyeY + 0.02
    return (
      <group>
        <mesh position={[0, y, -0.02]} rotation={[0, 0, 0]}>
          <torusGeometry args={[w, 0.022, 8, 28, Math.PI]} />
          <meshStandardMaterial color="#1c1c1f" roughness={0.4} />
        </mesh>
        {[-1, 1].map((sx) => (
          <mesh key={sx} position={[sx * w, y - 0.02, -0.02]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.075, 0.075, 0.07, 18]} />
            <meshStandardMaterial color={sx < 0 ? '#1c1c1f' : '#2b2d33'} roughness={0.4} />
          </mesh>
        ))}
      </group>
    )
  }
  if (kind === 'scarf')
    return (
      <group position={[0, Math.min(0.24, asset.top * 0.3), 0]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.8, 1]}>
          <torusGeometry args={[asset.width / 2 - 0.04, 0.05, 10, 28]} />
          <meshStandardMaterial color="#E5484D" roughness={0.9} />
        </mesh>
        <mesh position={[0.14, -0.1, asset.depth / 2 - 0.02]} rotation={[0.2, 0, 0.15]}>
          <boxGeometry args={[0.09, 0.2, 0.04]} />
          <meshStandardMaterial color="#E5484D" roughness={0.9} />
        </mesh>
      </group>
    )
  if (kind === 'cap')
    return (
      <group position={[0, top - 0.06, 0]}>
        <mesh scale={[1, 0.55, 1]}>
          <sphereGeometry args={[asset.width * 0.3, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color={color} roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.01, asset.width * 0.3]} scale={[1, 0.15, 0.7]}>
          <cylinderGeometry args={[asset.width * 0.22, asset.width * 0.22, 0.1, 20, 1, false, -Math.PI / 2, Math.PI]} />
          <meshStandardMaterial color="#1c1c1f" />
        </mesh>
      </group>
    )
  if (kind === 'crown')
    return (
      <group position={[0, top - 0.02, 0]}>
        <mesh position={[0, 0.05, 0]}>
          <cylinderGeometry args={[0.13, 0.12, 0.1, 16, 1, true]} />
          <meshStandardMaterial color="#f5b70a" metalness={0.6} roughness={0.3} side={THREE.DoubleSide} />
        </mesh>
        {[0, 1, 2, 3, 4].map((i) => (
          <mesh key={i} position={[Math.cos((i / 5) * Math.PI * 2) * 0.12, 0.13, Math.sin((i / 5) * Math.PI * 2) * 0.12]}>
            <coneGeometry args={[0.03, 0.07, 8]} />
            <meshStandardMaterial color="#f5b70a" metalness={0.6} roughness={0.3} />
          </mesh>
        ))}
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
        {!(asset.photoFace && bot.photo) && !bot.hidden && asset.blush.map((e, i) => (
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

const REACT_ICONS = { like: ThumbUp, heart: Heart, party: Party, clap: Clap, laugh: Laugh }
const REACT_COLORS = { like: '#1E86FC', heart: '#F93498', party: '#8F59F9', clap: '#F5A524', laugh: '#2FB36B' }
/** People's reactions float up over the bot for a few seconds (same on every screen). */
function ReactionFloat({ name }) {
  const all = useStore(dataStore, (s) => s.reactions)
  const [, tick] = useState(0)
  const now = syncNow()
  const mine = (all || []).filter((r) => r.bot === name && now - r.t < 4000)
  useEffect(() => {
    if (!mine.length) return
    const id = setTimeout(() => tick((x) => x + 1), 4100 - (now - mine[0].t))
    return () => clearTimeout(id)
  })
  if (!mine.length) return null
  return (
    <div className="reacts">
      {mine.slice(-5).map((r, i) => {
        const Ico = REACT_ICONS[r.kind]
        return (
          <span key={r.t + r.kind} className="react" style={{ '--c': REACT_COLORS[r.kind], '--dx': `${(i % 3) * 14 - 14}px`, animationDelay: `${-(now - r.t)}ms` }}>
            <Ico size={16} />
          </span>
        )
      })}
    </div>
  )
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
function Bot({ bot, status, layout, seat, role = 'home', names, data, floorKey = '', floorY, selected, spotlight, onSelect, night }) {
  const asset = useMemo(() => getBotAsset(bot.shape), [bot.shape])
  // hidden bots (hidden in the Grok app) are quieter: washed-out colour, translucent, a bit smaller
  const color = bot.hidden ? '#' + new THREE.Color(resolveColor(bot.color)).lerp(new THREE.Color('#c3c7cf'), 0.6).getHexString() : resolveColor(bot.color)
  const dark = isDark(color)
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0, transparent: !!bot.hidden, opacity: bot.hidden ? 0.55 : 1 }), [color, bot.hidden])
  useEffect(() => () => mat.dispose(), [mat])
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#fff', transparent: true, opacity: 0.5, depthWrite: false }), [])

  const root = useRef()
  const body = useRef()
  const eyesRef = useRef([])
  const hands = useRef([])
  const mug = useRef()
  const book = useRef()
  const ring = useRef()
  const phase = useMemo(() => rnd(bot.name, 'phase') * 10, [bot.name])

  const [hover, setHover] = useState(false)
  const [hidden, setHidden] = useState(true)
  const [gone, setGone] = useState(false)
  const [talkUi, setTalkUi] = useState(null) // { role, step, seed, turn, meeting }
  const [speech, setSpeech] = useState(false)
  const [confetti, setConfetti] = useState(0)
  const [focused, setFocused] = useState(false)

  const P = useRef({})
  P.current = { status, seat, layout, role, names, data, floorKey, hover, ts: bot.ts, name: bot.name }
  const V = useRef({ yaw: 0, ui: '', hidden: true, gone: false })

  // speech bubble + confetti follow the status change time, so every screen shows them together
  useEffect(() => {
    const age = syncNow() - (bot.ts || 0)
    if (status === 'done' && age < 3000) setConfetti(bot.ts)
    if (bot.step && age < 6500) {
      setSpeech(true)
      const id = setTimeout(() => setSpeech(false), 6500 - age)
      return () => clearTimeout(id)
    }
    setSpeech(false)
  }, [status, bot.step, bot.ts])

  useEffect(
    () => () => {
      botPositions.delete(bot.name)
      seatYaw.delete(bot.name)
    },
    [bot.name],
  )

  useFrame(({ camera }, rawDt) => {
    const dt = Math.min(rawDt, 0.05)
    const p = P.current
    const v = V.current
    if (!root.current) return
    const T = syncNow()
    const t = (T % 1e7) / 1000
    const sim = simBot({ name: p.name, role: p.role, floorKey: p.floorKey, layout: p.layout, seat: p.seat, names: p.names, data: p.data }, T)

    if (sim.hidden !== v.hidden) {
      v.hidden = sim.hidden
      setHidden(sim.hidden)
    }
    if (sim.gone !== v.gone) {
      v.gone = sim.gone
      setGone(sim.gone)
    }
    // conversation bubbles take turns on a clock every screen shares
    const turn = sim.talk ? Math.floor(Math.max(0, T - sim.talk.since - 1200) / 2800) : -1
    const uiKey = sim.talk ? `${sim.talk.role}|${sim.talk.step}|${turn}|${sim.talk.meeting}` : ''
    if (uiKey !== v.ui) {
      v.ui = uiKey
      setTalkUi(sim.talk ? { ...sim.talk, turn } : null)
    }
    const st = p.status
    const f = st === 'working' && T - (p.ts || 0) > 5 * 60e3
    if (f !== v.focused) {
      v.focused = f
      setFocused(f)
    }
    const moving = sim.moving
    const seated = sim.seated
    // only nap after a real status that has been quiet for an hour (a fresh roster isn't asleep)
    const lastSt = statusAt(p.data.history || [], p.name, T)
    const sleeping = seated && st === 'resting' && !!lastSt && isSleepy(lastSt, T)

    // ---- facing
    let targetYaw = v.yaw
    if (moving && sim.yaw != null) targetYaw = sim.yaw
    else if (seated) {
      const look = rnd(p.name, 'look', Math.floor(T / 6000))
      targetYaw = st === 'working' ? (look < 0.25 ? (look - 0.125) * 5 : 0) : (look - 0.5) * 1.1
      if (st === 'waiting_user') targetYaw = Math.max(-1.1, Math.min(1.1, Math.atan2(camera.position.x - sim.x, camera.position.z - sim.z)))
      targetYaw = Math.max(-0.55, Math.min(0.55, targetYaw))
    } else if (sim.at && sim.at.yaw != null) targetYaw = sim.at.yaw
    v.yaw = lerpAngle(v.yaw, targetYaw, 1 - Math.exp(-dt * 8))
    if (seated && sim.y > 0.3) seatYaw.set(p.name, v.yaw)
    else seatYaw.delete(p.name)

    root.current.position.set(sim.x, sim.y, sim.z)
    root.current.rotation.y = v.yaw
    if (sim.hidden) botPositions.delete(p.name)
    else {
      const bp = botPositions.get(p.name) || new THREE.Vector3()
      bp.set(sim.x, floorY + sim.y + 0.6, sim.z)
      botPositions.set(p.name, bp)
    }
    if (sim.sitting && sim.at) sitting.add(poiKey(sim.at))

    // ---- body animation (all driven by the shared clock)
    let by = 0, rx = 0, rz = 0, ry = 0, sy = 1, eyeY = 1, jx = 0
    let hl = 0, hr = 0, hz = 0
    const isTalking = !!sim.talk
    const act = sim.at && sim.at.poi ? sim.at.kind : null
    if (moving) {
      by = Math.abs(Math.sin(t * 11 + phase)) * 0.07
      rz = Math.sin(t * 11 + phase) * 0.09
      hl = Math.sin(t * 11) * 0.06
      hr = -hl
    } else if (isTalking) {
      const mine = (sim.talk.role === 'visitor') === (turn % 2 === 0)
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
    } else if (st === 'working' && seated) {
      // at the computer: bursts of typing, then reading the screen
      const typing = Math.sin(t * 0.45 + phase) + Math.sin(t * 0.17 + phase * 2) * 0.6 > -0.35
      rx = 0.13
      hz = 0.1
      if (typing) {
        by = Math.abs(Math.sin(t * 9 + phase)) * 0.018
        hl = Math.max(0, Math.sin(t * 17 + phase)) * 0.05
        hr = Math.max(0, Math.sin(t * 17 + phase + Math.PI)) * 0.05
      } else {
        rx = 0.16 + Math.sin(t * 1.3 + phase) * 0.02
        rz = Math.sin(t * 0.9 + phase) * 0.03
        hl = hr = 0.01
      }
    } else if (st === 'waiting_user') {
      const b = Math.abs(Math.sin(t * 4.5 + phase))
      by = b * 0.14
      sy = 1 + (b < 0.15 ? -0.08 : 0.03)
      hl = 0.38 + Math.sin(t * 9) * 0.08
      hr = 0.38 + Math.sin(t * 9 + Math.PI) * 0.08
    } else if (st === 'error') {
      sy = 1 + Math.sin(t * 2) * 0.015
      if (T - (p.ts || 0) < 1600 || (t + phase) % 5 < 0.45) {
        jx = Math.sin(t * 55) * 0.035
        rz = Math.sin(t * 48) * 0.07
      }
    } else if (st === 'done') {
      const ct = (T - (p.ts || 0)) / 1000
      if (ct >= 0 && ct < 1.8) {
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
      sy = 1 + Math.sin(t * 1.2 + phase) * 0.03
      rz = Math.sin(t * 0.6 + phase) * 0.04
      if (sleeping) {
        rx = 0.42
        by = -0.04
        sy = 1 + Math.sin(t * 0.8 + phase) * 0.04
        hl = hr = 0.12
        hz = 0.22
        rz = 0
        eyeY = 0.1
      } else if (seated) {
        rx = -0.05
        eyeY = 0.12
      }
    }
    // blink on a shared clock
    if ((t + phase) % 4.3 < 0.12) eyeY = Math.min(eyeY, 0.1)

    // ---- activities at points of interest
    if (act) {
      const cyc = (t + phase) % 4
      const sip = cyc < 1.1 ? Math.sin((cyc / 1.1) * Math.PI) : 0
      switch (act) {
        case 'coffee':
        case 'cooler':
          hr = 0.32 * sip + 0.06
          hz = 0.14 * sip + 0.04
          rx -= 0.08 * sip
          eyeY = Math.min(eyeY, 1 - 0.8 * sip)
          break
        case 'books':
          hl = hr = 0.16
          hz = 0.16
          rx = 0.12 + Math.sin(t * 0.7) * 0.03
          ry = Math.sin(t * 0.4 + phase) * 0.15
          break
        case 'sofa':
          rx = -0.18
          sy *= 1 + Math.sin(t * 1.1 + phase) * 0.025
          hl = hr = -0.04
          eyeY = Math.min(eyeY, 0.45)
          break
        case 'view':
          if (cyc < 1.6) {
            const k = Math.sin((cyc / 1.6) * Math.PI)
            hl = hr = 0.45 * k
            sy *= 1 + 0.07 * k
          } else rz = Math.sin(t * 1.3 + phase) * 0.05
          break
        case 'plant':
          hr = 0.18
          hz = 0.2
          rx = 0.12
          break
        case 'phone':
          // on a call: hand at the ear, pacing and nodding
          hr = 0.34
          hz = -0.02
          ry = Math.sin(t * 0.8 + phase) * 0.6
          by = Math.abs(Math.sin(t * 3 + phase)) * 0.02
          rx = Math.sin(t * 2.2) * 0.05
          break
        case 'vending': {
          // grab a snack, then nibble it
          const bite = (t + phase) % 3 < 0.5 ? Math.sin((((t + phase) % 3) / 0.5) * Math.PI) : 0
          hr = 0.24 + 0.1 * bite
          hz = 0.14
          by = bite * 0.02
          break
        }
        case 'printer':
          // waiting for the print, then reading the page
          rx = 0.2
          hl = hr = 0.1
          hz = 0.2
          ry = Math.sin(t * 0.6 + phase) * 0.1
          break
        case 'arcade':
          // button mashing
          rx = 0.1
          hl = 0.08 + Math.abs(Math.sin(t * 16)) * 0.05
          hr = 0.08 + Math.abs(Math.sin(t * 13 + 1)) * 0.05
          hz = 0.22
          by = Math.abs(Math.sin(t * 6 + phase)) * 0.03
          rz = Math.sin(t * 2.2) * 0.08
          break
        case 'armchair':
          rx = -0.2
          hl = hr = 0.14
          hz = 0.15
          eyeY = Math.min(eyeY, 0.6)
          sy *= 1 + Math.sin(t * 1.0 + phase) * 0.02
          break
        case 'stroll':
          // looking around at each stop
          ry = Math.sin(t * 0.9 + phase) * 0.45
          rz = Math.sin(t * 1.4 + phase) * 0.03
          break
        case 'chat':
          // dropped by a colleague's desk for a quick chat
          hl = 0.1 + Math.sin(t * 6) * 0.06
          rz = Math.sin(t * 2.5 + phase) * 0.06
          by = Math.abs(Math.sin(t * 5 + phase)) * 0.03
          break
      }
    }
    // ---- quirks: short gestures, picked from a shared clock
    const qslot = Math.floor(T / 13000)
    const qStart = qslot * 13000 + rnd(p.name, qslot, 'qs') * 6000
    const qt = (T - qStart) / 1000
    if (!moving && !isTalking && !act && !sleeping && qt > 0 && qt < 2.2 && rnd(p.name, qslot, 'q') < 0.55) {
      const k = Math.sin((qt / 2.2) * Math.PI)
      const opts = st === 'working' ? ['think', 'stretch', 'nod'] : st === 'resting' ? ['yawn', 'stretch', 'look'] : st === 'error' ? ['facepalm'] : st === 'done' ? ['cheer', 'look'] : ['stretch', 'look']
      switch (opts[Math.floor(rnd(p.name, qslot, 'qk') * opts.length)]) {
        case 'think': hr = 0.2 * k; hz = 0.12 * k; rz = 0.12 * k; hl *= 1 - k; break
        case 'stretch': hl = hr = 0.42 * k; sy *= 1 + 0.08 * k; rx -= 0.1 * k; break
        case 'yawn': sy *= 1 + 0.06 * k; hl = hr = 0.3 * k; eyeY = Math.min(eyeY, 0.15); break
        case 'nod': rx += Math.sin(qt * 9) * 0.08 * k; break
        case 'facepalm': hr = 0.38 * k; hz = 0.18 * k; rx += 0.15 * k; break
        case 'cheer': hl = hr = 0.45 * k; by += Math.abs(Math.sin(qt * 8)) * 0.12 * k; break
        case 'look': ry += Math.sin(qt * 3) * 0.5 * k; break
      }
    }
    if (p.hover && !moving) {
      hr = 0.4 + Math.sin(t * 12) * 0.07
      hz = 0.05
    }
    // landing squash when sitting down
    const lt = (T - sim.arrivedT) / 1000
    if (seated && lt >= 0 && lt < 0.45) sy *= 1 - Math.sin((lt / 0.45) * Math.PI) * 0.12

    const b = body.current
    b.position.set(jx, by, 0)
    b.rotation.set(rx, ry, rz)
    const sx = 1 / Math.sqrt(sy)
    b.scale.set(sx, sy, sx)
    for (const e of eyesRef.current) if (e) e.scale.y += (eyeY * 1.55 - e.scale.y) * Math.min(1, dt * 25)
    const hw = asset.width / 2 + 0.03
    if (hands.current[0]) hands.current[0].position.set(-hw, 0.22 + hl, 0.08 + hz)
    if (hands.current[1]) hands.current[1].position.set(hw, 0.22 + hr, 0.08 + hz)
    if (book.current) {
      book.current.visible = act === 'books' || act === 'armchair' || act === 'printer'
      book.current.position.set(0, 0.3 + hl, 0.2 + hz)
    }
    if (mug.current) {
      mug.current.visible = act === 'coffee' || act === 'cooler' || act === 'vending'
      mug.current.position.set(hw + 0.02, 0.3 + hr, 0.12 + hz)
    }
    if (st === 'error') mat.emissive.setRGB(0.6 * (0.5 + 0.5 * Math.sin(t * 6)), 0, 0)
    else mat.emissive.setRGB(0, 0, 0)
    if (ring.current) {
      ring.current.position.y = -sim.y + 0.015
      const pulse = st === 'waiting_user' || st === 'error' ? 0.5 + 0.5 * Math.sin(t * 5) : 0.6
      ringMat.opacity = (st === 'resting' ? 0 : 0.55) * pulse
      ring.current.scale.setScalar(st === 'waiting_user' ? 1 + 0.15 * Math.sin(t * 5) : 1)
    }
  })

  const statusColor = STATUS[status]?.color || '#999'
  useEffect(() => {
    ringMat.color.set(statusColor)
  }, [statusColor, ringMat])

  // after 5 minutes of continuous work a bot puts its headphones on; in the snow everyone wears a scarf
  const snowy = data.weather === 'snow'
  const iconY = asset.top + 0.42
  const talking = !!talkUi && !hidden
  let speechText = null
  if (talking) {
    const mine = (talkUi.role === 'visitor') === (talkUi.turn % 2 === 0)
    if (mine) speechText = talkUi.role === 'visitor' ? talkUi.step : REPLIES[(talkUi.seed + talkUi.turn) % REPLIES.length]
  } else if (speech || hover || selected || spotlight) {
    speechText = bot.step || STATUS[status]?.label
  }
  if (gone) return null

  return (
    <group ref={root} scale={bot.hidden ? 0.88 : 1}>
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
            {/* Grok-style eyes: short slanted ovals, no highlight */}
            <mesh ref={(m) => (eyesRef.current[i] = m)} geometry={eyeGeo} material={dark ? whiteMat : blackMat} scale={[0.62, 1.55, 0.4]} rotation={[0, 0, 0.42]}>
            </mesh>
          </group>
        ))}
        {asset.mouth && !(asset.photoFace && bot.photo) && (status === 'done' || talking || status === 'waiting_user') && (
          <group position={asset.mouth.position} quaternion={asset.mouth.quaternion}>
            <mesh geometry={mouthGeo} material={dark ? whiteMat : blackMat} rotation={[0, 0, Math.PI]} />
          </group>
        )}
        {[0, 1].map((i) => (
          <mesh key={i} ref={(m) => (hands.current[i] = m)} geometry={handGeo} material={mat} />
        ))}
        <mesh ref={mug} geometry={mugGeo} material={mugMat} visible={false} />
        <mesh ref={book} geometry={bookGeo} material={bookMat} visible={false} rotation={[-0.5, 0, 0]} />
        <Accessory kind={bot.accessory} asset={asset} color={color} />
        {focused && <Accessory kind="headphones" asset={asset} color={color} />}
        {snowy && bot.accessory !== 'scarf' && <Accessory kind="scarf" asset={asset} color={color} />}
      </group>
      {!hidden && (
        <Html position={[0, iconY, 0]} center distanceFactor={10} zIndexRange={[30, 0]} pointerEvents="none">
          <div className={`bot-tag${selected ? ' sel' : ''}${bot.hidden ? ' is-hidden' : ''}`}>
            {speechText && (
              <div className={`speech ${talking ? 'talk' : ''}`}>
                {!talking && <b>{bot.name}</b>}
                <span>{speechText}</span>
              </div>
            )}
            <ReactionFloat name={bot.name} />
            <StatusIcon status={status} talking={talking} />
            {bot.hidden && <div className="hidden-tag">oculto</div>}
            {(hover || selected) && !speechText && <div className="name-chip">{bot.name}</div>}
          </div>
        </Html>
      )}
      {confetti > 0 && !hidden && <Confetti key={confetti} y={asset.top + 0.2} />}
    </group>
  )
}

function same(a, b) {
  return (
    a.bot === b.bot && a.status === b.status && a.seat === b.seat && a.layout === b.layout && a.role === b.role &&
    a.data === b.data && a.names === b.names && a.floorY === b.floorY && a.floorKey === b.floorKey &&
    a.selected === b.selected && a.spotlight === b.spotlight && a.night === b.night
  )
}
export default memo(Bot, same)
