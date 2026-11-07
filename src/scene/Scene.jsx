import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import Building from './Building'
import Weather from './Weather'
import { FLOOR_H } from './layout'
import { botPositions, floorOffset, ridePositions, sceneSignals } from './registry'

const DAY_BG = new THREE.Color('#eceef2')
const NIGHT_BG = new THREE.Color('#0c1120')

const C = (h) => new THREE.Color(h)
const DUSK_SUN = C('#ffad6b'), MOON = C('#9fb4ff'), SUN = C('#fff8ef'), DUSK_BG = C('#f2d6c2'), GREY_BG = C('#d9dce2')
const tmpC = new THREE.Color()

/** nightness: 0 day … 1 night (fractions = dawn/dusk, warm tones). weather dims and greys the sky. */
function Lights({ nightness, weather, low }) {
  const { scene } = useThree()
  const hemi = useRef(), sun = useRef(), amb = useRef()
  const k = useRef(nightness)
  const wk = useRef(0)
  useEffect(() => {
    scene.background = DAY_BG.clone()
  }, [scene])
  useFrame((_, dt) => {
    k.current += (nightness - k.current) * Math.min(1, dt * 2.5)
    const overcast = weather === 'rain' || weather === 'storm' ? 1 : weather === 'cloudy' || weather === 'snow' ? 0.6 : 0
    wk.current += (overcast - wk.current) * Math.min(1, dt * 1.5)
    const n = k.current, w = wk.current
    const warm = Math.max(0, 1 - Math.abs(n * 2 - 1) * 1.6) // peaks at dawn/dusk
    scene.background.copy(DAY_BG).lerp(DUSK_BG, warm * 0.6).lerp(GREY_BG, w * 0.6 * (1 - n)).lerp(NIGHT_BG, n)
    scene.environmentIntensity = THREE.MathUtils.lerp(0.9, 0.18, n) * (1 - w * 0.25)
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(1.15, 0.25, n) * (1 - w * 0.15)
      hemi.current.color.set('#ffffff').lerp(tmpC.set('#ffd9bf'), warm * 0.5).lerp(tmpC.set('#7f8fc9'), n)
    }
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(2.1, 0.35, n) * (1 - w * 0.55)
      sun.current.color.copy(SUN).lerp(DUSK_SUN, warm * 0.8).lerp(MOON, n)
    }
    if (amb.current) amb.current.intensity = THREE.MathUtils.lerp(0.35, 0.12, n) + w * 0.08
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#d4d7de', 1.15]} />
      <ambientLight ref={amb} intensity={0.35} />
      <SunWithTarget sunRef={sun} low={low} />
    </>
  )
}

/** Directional light that follows the camera target so shadows stay crisp on the current floor. */
function SunWithTarget({ sunRef, low }) {
  const controls = useThree((s) => s.controls)
  const target = useRef()
  useEffect(() => {
    if (sunRef.current && target.current) sunRef.current.target = target.current
  }, [sunRef])
  const gl = useThree((s) => s.gl)
  const lastShadow = useRef(0)
  useEffect(() => {
    // shadows don't need the full frame rate: redraw the shadow map ~20 times per second
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => (gl.shadowMap.autoUpdate = true)
  }, [gl])
  useFrame(({ clock }) => {
    if (clock.elapsedTime - lastShadow.current > 0.05) {
      lastShadow.current = clock.elapsedTime
      gl.shadowMap.needsUpdate = true
    }
    if (!controls || !sunRef.current || !target.current) return
    const t = controls.target
    target.current.position.set(t.x, t.y - 0.8, t.z)
    sunRef.current.position.set(t.x + 7, t.y + 14, t.z + 5)
  })
  return (
    <>
      <directionalLight
        ref={sunRef}
        castShadow={!low}
        intensity={2.1}
        shadow-mapSize={[1536, 1536]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={4}
      />
      <object3D ref={target} />
    </>
  )
}

const keys = new Set()
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), delta = new THREE.Vector3()

const VIEW_DIR = new THREE.Vector3(1, 0.78, 1).normalize()

function CameraRig({ floorIdx, focus, selectedBot, tour, onUserMove }) {
  const { camera, controls, gl, size } = useThree()
  const desired = useRef(new THREE.Vector3(0, 0.6, 0))
  const zoomGoal = useRef(null)
  const placed = useRef(false)
  const fy = focus.y ?? floorIdx * FLOOR_H + 1.2
  // narrow screens (phones) need to back off so the whole room fits
  const fit = Math.max(1, Math.pow(1.25 / Math.max(0.3, size.width / size.height), 0.7))
  const goalDist = focus.dist * fit

  // smooth wheel zoom: wheel moves a goal distance, the camera eases toward it
  useEffect(() => {
    const el = gl.domElement
    const onWheel = (e) => {
      e.preventDefault()
      if (!controls) return
      const cur = zoomGoal.current ?? camera.position.distanceTo(controls.target)
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomGoal.current = THREE.MathUtils.clamp(cur * Math.exp(d * 0.0012), controls.minDistance, controls.maxDistance)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [gl, controls, camera])

  useEffect(() => {
    desired.current.set(focus.x, fy, focus.z)
    zoomGoal.current = goalDist
    if (!placed.current && controls) {
      // first frame: put the camera right at the room, no fly-in
      placed.current = true
      controls.target.copy(desired.current)
      camera.position.copy(desired.current).addScaledVector(VIEW_DIR, goalDist)
      controls.update()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [floorIdx, focus.x, focus.z, focus.dist, fy, controls, camera])

  useEffect(() => {
    const down = (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return
      const k = e.key.toLowerCase()
      if ('wasd'.includes(k) && k.length === 1) {
        keys.add(k)
        onUserMove && onUserMove(true)
      }
    }
    const up = (e) => keys.delete(e.key.toLowerCase())
    const blur = () => keys.clear()
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [onUserMove])

  useEffect(() => {
    if (controls) {
      controls.autoRotate = !!tour
      controls.autoRotateSpeed = 0.6
    }
  }, [tour, controls])

  useFrame((_, rawDt) => {
    if (!controls) return
    const dt = Math.min(rawDt, 0.05)
    const target = controls.target
    // WASD
    if (keys.size) {
      camera.getWorldDirection(fwd)
      fwd.y = 0
      fwd.normalize()
      right.crossVectors(fwd, camera.up).normalize()
      const sp = 9 * dt
      if (keys.has('w')) desired.current.addScaledVector(fwd, sp)
      if (keys.has('s')) desired.current.addScaledVector(fwd, -sp)
      if (keys.has('d')) desired.current.addScaledVector(right, sp)
      if (keys.has('a')) desired.current.addScaledVector(right, -sp)
      desired.current.x = THREE.MathUtils.clamp(desired.current.x, -12, 12)
      desired.current.z = THREE.MathUtils.clamp(desired.current.z, -12, 12)
    }
    // follow selected bot
    if (selectedBot) {
      const r = ridePositions.get(selectedBot)
      const p = botPositions.get(selectedBot)
      if (r) desired.current.copy(r)
      else if (p) desired.current.set(p.x + floorOffset.x, p.y, p.z + floorOffset.z)
    }
    delta.copy(desired.current).sub(target).multiplyScalar(Math.min(1, dt * 4))
    if (delta.lengthSq() > 1e-8) {
      target.add(delta)
      camera.position.add(delta)
    }
    // zoom buttons
    if (sceneSignals.zoom !== 0) {
      const f = sceneSignals.zoom > 0 ? 0.78 : 1.28
      sceneSignals.zoom = 0
      const cur = zoomGoal.current ?? camera.position.distanceTo(target)
      zoomGoal.current = THREE.MathUtils.clamp(cur * f, controls.minDistance, controls.maxDistance)
    }
    // focus request zooms in on the bot
    if (sceneSignals.focusRequest) {
      sceneSignals.focusRequest = null
      zoomGoal.current = 11.5
    }
    if (zoomGoal.current != null) {
      const off = camera.position.clone().sub(target)
      const len = off.length()
      const next = len + (zoomGoal.current - len) * Math.min(1, dt * 6)
      camera.position.copy(target).add(off.setLength(next))
      if (Math.abs(next - zoomGoal.current) < 0.01) zoomGoal.current = null
    }
    controls.update()
  })
  return null
}

/** Phones: render at most ~30 frames per second (half the GPU work and heat); desktop runs free. */
function FrameLimiter({ fps = 30 }) {
  const invalidate = useThree((st) => st.invalidate)
  useEffect(() => {
    let raf, last = 0
    const loop = (t) => {
      raf = requestAnimationFrame(loop)
      if (document.visibilityState !== 'visible') return
      if (t - last >= 1000 / fps - 2) {
        last = t
        invalidate()
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [invalidate, fps])
  return null
}

const MOBILE = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 820)

export default function Scene(props) {
  const { night, nightness, weather, tour, floorIdx, focus, selectedBot, onPointerMissed, onUserMove } = props
  // Adaptive quality: phones start light; any device drops resolution and shadows if FPS falls.
  const [low, setLow] = useState(MOBILE)
  const [dpr, setDpr] = useState(MOBILE ? Math.min(1.25, window.devicePixelRatio || 1) : Math.min(1.75, window.devicePixelRatio || 1))
  return (
    <Canvas
      shadows={!MOBILE}
      dpr={dpr}
      gl={{ antialias: !MOBILE, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 30, position: [12, 10 + floorIdx * FLOOR_H, 12], near: 0.5, far: 200 }}
      onPointerMissed={onPointerMissed}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <PerformanceMonitor
        flipflops={3}
        // phones are capped at 30 fps on purpose: judge them against that, not 60
        // aim at the screen's own refresh rate (120 Hz phone, 75 Hz monitor...)
        bounds={(refresh) => [refresh * 0.72, refresh * 0.92]}
        onDecline={() => {
          setDpr((d) => Math.max(1, d - 0.25))
          setLow(true)
        }}
        onIncline={() => {
          if (!MOBILE) setLow(false)
          setDpr((d) => Math.min(MOBILE ? Math.min(1.25, window.devicePixelRatio || 1) : Math.min(2, window.devicePixelRatio || 1), d + 0.25))
        }}
      />
      <Lights nightness={nightness ?? (night ? 1 : 0)} weather={weather} low={low} />
      <Weather kind={weather} low={low} />
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2.5} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[8, 3, 4]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-6, 2, 6]} rotation-y={Math.PI / 3} scale={[6, 3, 1]} color="#ffeedd" />
      </Environment>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={45}
        minPolarAngle={0.3}
        maxPolarAngle={1.3}
        enableZoom={MOBILE}
        onStart={onUserMove}
      />
      <CameraRig floorIdx={floorIdx} focus={focus} selectedBot={selectedBot} tour={tour} onUserMove={onUserMove} />
      <Building {...props} low={low} />
    </Canvas>
  )
}
