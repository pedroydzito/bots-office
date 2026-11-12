import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import Sky from './Sky'
import { shadowDirty } from './Floor'
import { LabelLayer } from './Labels'
import { useStore } from '../lib/createStore'
import { prefs, prefStore } from '../lib/notify'
import { pipGrabFrame, pipStore } from '../lib/pip'
import { resetTextureCaches } from './textures'
import { Environment, Lightformer, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import * as THREE from 'three'
import Campus from './Campus'
import Weather from './Weather'
import { botWorld, ridePositions, sceneSignals } from './registry'

const DAY_BG = new THREE.Color('#f3f6f9')
const NIGHT_BG = new THREE.Color('#0c1120')

const C = (h) => new THREE.Color(h)
const CEIL = C('#ffe0b8'), DUSK_SUN = C('#ffad6b'), MOON = C('#9fb4ff'), SUN = C('#ffedd2'), DUSK_BG = C('#f2d6c2'), GREY_BG = C('#d9dce2')
const tmpC = new THREE.Color()

/** nightness: 0 day … 1 night (fractions = dawn/dusk, warm tones). weather dims and greys the sky. */
function Lights({ nightness, weather, low, span }) {
  const { scene } = useThree()
  const hemi = useRef(), sun = useRef(), amb = useRef(), fill = useRef()
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
    scene.environmentIntensity = THREE.MathUtils.lerp(0.6, 0.42, n) * (1 - w * 0.25)
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(0.7, 0.72, n) * (1 - w * 0.15)
      hemi.current.color.set('#e3ecff').lerp(tmpC.set('#ffd9bf'), warm * 0.5).lerp(tmpC.set('#c9b8a0'), n)
    }
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(2.6, 0.75, n) // at night: the ceiling lights, casting the shadows * (1 - w * 0.55)
      sun.current.color.copy(SUN).lerp(DUSK_SUN, warm * 0.8).lerp(CEIL, n)
    }
    if (fill.current) fill.current.intensity = THREE.MathUtils.lerp(0.55, 0.28, n)
    if (amb.current) amb.current.intensity = THREE.MathUtils.lerp(0.2, 0.1, n) + w * 0.08
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#e3ecff', '#e6d9c6', 1.15]} />
      <ambientLight ref={amb} intensity={0.35} />
      <SunWithTarget sunRef={sun} low={low} span={span} />
      {/* cool fill from the other side: shape and depth without a second shadow pass */}
      <directionalLight ref={fill} position={[-9, 7, -6]} intensity={0.55} color="#c4d8ff" />
    </>
  )
}

/** Directional light that follows the camera target so shadows stay crisp on the current floor. */
function SunWithTarget({ sunRef, low, span = 11 }) {
  useEffect(() => {
    const c = sunRef.current?.shadow?.camera
    if (!c) return
    c.left = -span
    c.right = span
    c.top = span
    c.bottom = -span
    c.far = 45 + span
    c.updateProjectionMatrix()
    // the whole office in view needs a bigger shadow map to stay sharp
    const sh = sunRef.current.shadow
    const size = MOBILE ? 1024 : 2048 // crisp, soft-edged shadows on desktop
    if (sh.mapSize.x !== size) {
      sh.mapSize.set(size, size)
      sh.map?.dispose()
      sh.map = null
    }
  }, [span, sunRef])
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
    // shadows don't need every frame: ~16/s with one room open, ~7/s for the whole office (tiny moving
    // bots far away), ~4/s when idle
    if (shadowDirty.v) {
      shadowDirty.v = false
      gl.shadowMap.needsUpdate = true
    } else if ((performance.now() / 1000) - lastShadow.current > 0) {
      lastShadow.current = (performance.now() / 1000)
      gl.shadowMap.needsUpdate = true
    }
    if (!controls || !sunRef.current || !target.current) return
    // follow the camera target, but in whole shadow-map texels: a shadow camera that slides by
    // fractions of a texel makes every shadow edge shimmer while you pan or zoom
    const sh = sunRef.current.shadow
    const texel = (sh.camera.right - sh.camera.left) / sh.mapSize.x
    const snap = (v) => Math.round(v / (texel * 2)) * texel * 2
    const t = { x: snap(controls.target.x), y: controls.target.y, z: snap(controls.target.z) }
    target.current.position.set(t.x, t.y - 0.8, t.z)
    // the sun travels with the real hour: low from the left in the morning, high at noon, low from the right at dusk
    const d = new Date()
    const h = d.getHours() + d.getMinutes() / 60
    const day = Math.min(1, Math.max(0, (h - 6) / 13)) // 6h..19h
    const ang = (day - 0.5) * 2.2
    // from the back-left (behind the far walls as seen by the default camera), so shadows fall
    // toward the viewer and show; it swings a little with the hour
    sunRef.current.position.set(t.x - 9 + Math.sin(ang) * 3, t.y + 13 + Math.cos(ang) * 2, t.z - 5)
  })
  return (
    <>
      <directionalLight
        ref={sunRef}
        castShadow={!low}
        intensity={2.1}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-11}
        shadow-camera-right={11}
        shadow-camera-top={11}
        shadow-camera-bottom={-11}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0008}
        shadow-normalBias={0.045}
        shadow-radius={4}
      />
      <object3D ref={target} />
    </>
  )
}

const keys = new Set()
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), delta = new THREE.Vector3()

const _up = new THREE.Vector3(0, 1, 0)
const VIEW_DIR = new THREE.Vector3(1, 0.78, 1).normalize()

function CameraRig({ floorIdx, focus, selectedBot, tour, onUserMove, bounds }) {
  const { camera, controls, gl, size } = useThree()
  const pendingZoom = useRef(0)
  const desired = useRef(new THREE.Vector3(0, 0.6, 0))
  const zoomGoal = useRef(null)
  const spinGoal = useRef(0) // pending rotation (radians) from the horizontal wheel
  const placed = useRef(false)
  const fy = focus.y ?? 1.2
  // narrow screens (phones) need to back off so the whole room fits
  const fit = Math.max(1, Math.pow(1.25 / Math.max(0.3, size.width / size.height), 0.7))
  const goalDist = focus.dist * fit

  // smooth wheel zoom: wheel moves a goal distance, the camera eases toward it
  useEffect(() => {
    const el = gl.domElement
    const onWheel = (e) => {
      e.preventDefault()
      if (!controls) return
      // horizontal wheel (tilt / side scroll): rotate the camera around what it looks at
      const dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX
      if (Math.abs(dx) > Math.abs(e.deltaY) && !e.shiftKey) {
        spinGoal.current += -dx * 0.0013 // eased in the frame loop, like the zoom
        return
      }
      const cur = zoomGoal.current ?? camera.position.distanceTo(controls.target)
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY
      zoomGoal.current = THREE.MathUtils.clamp(cur * Math.exp(d * 0.0012), controls.minDistance, controls.maxDistance)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [gl, controls, camera])

  const focusGen = useRef(0)
  const swoopT = useRef(0)
  useEffect(() => {
    focusGen.current++
    dragging.current = false
    desired.current.set(focus.x, fy, focus.z)
    // a little cinematic swoop between rooms: pull back while travelling, settle in on arrival
    const swoop = placed.current && controls && controls.target.distanceTo(desired.current) > 3
    zoomGoal.current = swoop ? Math.max(goalDist, camera.position.distanceTo(controls.target)) * 1.3 : goalDist
    clearTimeout(swoopT.current)
    if (swoop) swoopT.current = setTimeout(() => (zoomGoal.current = goalDist), 520)
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

  // panning (right-drag / two fingers) moves the focus point: keep it where the user left it
  const dragging = useRef(false)
  useEffect(() => {
    if (!controls) return
    // a plain click also fires start/end: only a real pan (the target moved) keeps the new spot,
    // and a room picked meanwhile (new focus) always wins
    const from = new THREE.Vector3()
    let gen = 0
    const start = () => {
      dragging.current = true
      from.copy(controls.target)
      gen = focusGen.current
    }
    // damping keeps gliding a moment after release: settle on where it stops
    let t = null
    const end = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        dragging.current = false
        if (gen === focusGen.current && controls.target.distanceTo(from) > 0.05) desired.current.copy(controls.target)
      }, 450)
    }
    controls.addEventListener('start', start)
    controls.addEventListener('end', end)
    return () => {
      controls.removeEventListener('start', start)
      controls.removeEventListener('end', end)
    }
  }, [controls])

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
    }
    // follow selected bot
    if (selectedBot) {
      const r = ridePositions.get(selectedBot)
      const p = botWorld.get(selectedBot)
      if (r) desired.current.copy(r)
      else if (p) desired.current.set(p.x, p.y, p.z)
    }
    if (dragging.current) {
      // while the user drags, follow their hand (and damping) instead of pulling back
      desired.current.copy(target)
    }
    // panning reaches every corner of the storey but never drags the building off screen
    if (bounds) {
      const mx = bounds.W / 2 + 4, mz = bounds.D / 2 + 4
      const cx = THREE.MathUtils.clamp(target.x, -mx, mx), cz = THREE.MathUtils.clamp(target.z, -mz, mz)
      if (cx !== target.x || cz !== target.z) {
        camera.position.x += cx - target.x
        camera.position.z += cz - target.z
        target.x = cx
        target.z = cz
      }
      desired.current.x = THREE.MathUtils.clamp(desired.current.x, -mx, mx)
      desired.current.z = THREE.MathUtils.clamp(desired.current.z, -mz, mz)
    }
    delta.copy(desired.current).sub(target).multiplyScalar(Math.min(1, dt * (pendingZoom.current ? 7 : 4)))
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
    // (the zoom waits until the camera has travelled to the bot, so it never zooms into the wrong spot)
    if (sceneSignals.focusRequest) {
      sceneSignals.focusRequest = null
      pendingZoom.current = performance.now()
    }
    if (pendingZoom.current && (desired.current.distanceTo(target) < 0.8 || performance.now() - pendingZoom.current > 1500)) {
      pendingZoom.current = 0
      zoomGoal.current = 11.5
    }
    if (Math.abs(spinGoal.current) > 0.0005) {
      const step = spinGoal.current * Math.min(1, dt * 8)
      spinGoal.current -= step
      const so = camera.position.clone().sub(target).applyAxisAngle(_up, step)
      camera.position.copy(target).add(so)
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

// nobody touching the screen for a while: draw ~30 fps instead of the full refresh rate
function IdleSaver({ cap = false }) {
  const { setFrameloop, invalidate, advance } = useThree()
  useEffect(() => {
    let last = Date.now(), idle = false, tick = 0
    const wake = () => {
      last = Date.now()
      if (cap) return
      if (idle) (idle = false, (perfFlags.idle = false), clearInterval(tick), setFrameloop('always'))
    }
    const chk = setInterval(() => {
      if (!idle && (cap || Date.now() - last > 30000)) (idle = true, (perfFlags.idle = true), setFrameloop('demand'), (tick = setInterval(() => invalidate(), 33)))
    }, 2000)
    const vis = () => {
      if (document.hidden && pipStore.get().on) {
        // floating window open: browsers pause animation frames in hidden tabs, so drive frames ourselves
        clearInterval(tick)
        setFrameloop('never')
        tick = setInterval(() => advance(performance.now()), 100)
      } else if (document.hidden) (clearInterval(tick), setFrameloop('never'))
      else (clearInterval(tick), (idle = false), wake())
      if (!document.hidden) setFrameloop('always')
    }
    document.addEventListener('visibilitychange', vis)
    const evs = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart']
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }))
    return () => {
      clearInterval(chk), clearInterval(tick)
      document.removeEventListener('visibilitychange', vis)
      evs.forEach((e) => window.removeEventListener(e, wake))
    }
  }, [setFrameloop, invalidate, cap])
  return null
}

export const perfFlags = { idle: false }

// Soft cel shading for every lit material (the "painted" look): the direct light wraps into a
// bright band with a short soft edge instead of a long gradient. One string change, no extra cost.
THREE.ShaderChunk.lights_physical_pars_fragment = THREE.ShaderChunk.lights_physical_pars_fragment.replace(
  'vec3 irradiance = dotNL * directLight.color;',
  'float toonNL = smoothstep( 0.0, 0.14, dotNL ) * 0.8 + dotNL * 0.2;\n\tvec3 irradiance = toonNL * directLight.color;',
)

/** Fog follows the zoom: the ground fades out past the campus instead of ending in an edge. */
function CampusFog() {
  const { scene, camera, controls } = useThree()
  useEffect(() => {
    scene.fog = new THREE.Fog('#dfe3e8', 60, 140)
    return () => (scene.fog = null)
  }, [scene])
  useFrame(() => {
    if (!scene.fog || !controls) return
    const d = camera.position.distanceTo(controls.target)
    scene.fog.near = d + 25
    scene.fog.far = d + 130
    if (scene.background?.isColor) scene.fog.color.copy(scene.background)
  })
  return null
}

/** Few CPU cores or little memory: start in Leve (desktop browsers only report these roughly). */
function weakHardware() {
  if (typeof navigator === 'undefined') return false
  const cores = navigator.hardwareConcurrency || 8
  const mem = navigator.deviceMemory || 8
  return cores <= 4 || mem <= 4
}

// desktop-only post effects live in their own chunk: phones never download them

// compile every shader once the office is up, so the first visit to another floor / the
// building view doesn't stutter while materials compile
/** Tells the page the office has drawn a few frames (the loading cover fades and rooms build up). */
function ReadySignal() {
  const n = useRef(0)
  useFrame(() => {
    if (n.current++ === 3) window.dispatchEvent(new Event('botoffice:scene-ready'))
  })
  return null
}

function Precompile() {
  const { gl, scene, camera } = useThree()
  useEffect(() => {
    const id = setTimeout(() => {
      try {
        gl.compile(scene, camera)
      } catch {
        /* not critical */
      }
    }, 2500)
    return () => clearTimeout(id)
  }, [gl, scene, camera])
  return null
}

/**
 * Feed PiP after each real WebGL present.
 * Must NOT use useFrame with priority > 0: that puts R3F into manual render mode, and when
 * Effects aren't mounted (Leve / Auto on weak GPU) nothing calls gl.render — the office goes
 * white while Html labels keep floating. Wrapping gl.render avoids that and still copies the
 * buffer in the same turn (no preserveDrawingBuffer, which stalls the GPU).
 */
function PipFeed() {
  const { gl } = useThree()
  const on = useStore(pipStore, (p) => p.on)
  useEffect(() => {
    if (!on) return
    const orig = gl.render.bind(gl)
    gl.render = (scene, camera) => {
      orig(scene, camera)
      pipGrabFrame(gl.domElement)
    }
    return () => {
      gl.render = orig
    }
  }, [gl, on])
  return null
}

export default function Scene(props) {
  const { night, nightness, weather, tour, floorIdx, focus, selectedBot, onPointerMissed, onUserMove } = props
  // Adaptive quality: phones start light; any device drops resolution and shadows if FPS falls.
  const [low, setLow] = useState(MOBILE)
  // Phones drop the GPU context when the app goes to the background (black building on return).
  // Rebuild the canvas when that happens.
  const [glKey, setGlKey] = useState(0)
  const glRef = useRef(null)
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'visible') return
      const g = glRef.current
      if (g && g.getContext().isContextLost()) (resetTextureCaches(), setGlKey((k) => k + 1))
    }
    document.addEventListener('visibilitychange', check)
    window.addEventListener('pageshow', check)
    return () => {
      document.removeEventListener('visibilitychange', check)
      window.removeEventListener('pageshow', check)
    }
  }, [])
  const [dpr, setDpr] = useState(MOBILE ? Math.min(1.6, window.devicePixelRatio || 1) : Math.min(1.5, window.devicePixelRatio || 1))
  // graphics quality: Auto picks Leve on machines without a real GPU (software / basic renderer)
  const gfxPref = useStore(prefStore, (p) => p.gfx || 'auto')
  const [weakGpu, setWeakGpu] = useState(() => prefs.get('gfxAutoWeak', false) || weakHardware())
  // two levels: Normal (everything below) and Leve (no sky, weather or shadows); old 'alta' = Normal
  const q = gfxPref === 'leve' ? 'leve' : 'media'
  useEffect(() => {
    document.documentElement.classList.toggle('gfx-leve', q === 'leve')
  }, [q])
  const pipOn = useStore(pipStore, (p) => p.on)
  const effDpr = pipOn ? 1 : q === 'leve' ? Math.min(dpr, MOBILE ? 1.25 : 1) : q === 'media' ? Math.min(dpr, MOBILE ? 1.6 : 1.5) : dpr
  return (
    <Canvas
      key={glKey}
      shadows={MOBILE || q === 'leve' ? false : 'percentage'}
      dpr={effDpr}
      gl={{ antialias: true, powerPreference: 'high-performance', stencil: false }}
      camera={{ fov: 30, position: [12, 10, 12], near: 1, far: 400 }}
      onPointerMissed={onPointerMissed}
      onCreated={({ gl, scene, setEvents }) => {
        // hidden things (other rooms while one is open) can't be clicked or hovered
        setEvents({ filter: (hits) => hits.filter((h) => { for (let o = h.object; o; o = o.parent) if (!o.visible) return false; return true }) })
        glRef.current = gl
        // ?perf: expose the renderer for measuring draw calls (debug only)
        if (window.location.search.includes('perf')) (window.__gl = gl), (window.__scene = scene)
        gl.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault())
        // long-press opens our quick menu, not the browser's (no selection / blue flash on phones)
        gl.domElement.addEventListener('contextmenu', (e) => e.preventDefault())
        gl.domElement.addEventListener('webglcontextrestored', () => (resetTextureCaches(), setGlKey((k) => k + 1)))
        try {
          const ctx = gl.getContext()
          const ext = ctx.getExtension('WEBGL_debug_renderer_info')
          const r = String(ext ? ctx.getParameter(ext.UNMASKED_RENDERER_WEBGL) : ctx.getParameter(ctx.RENDERER))
          // software rendering, or a laptop's built-in graphics (Intel HD/UHD, AMD Radeon Graphics/Vega, older Iris)
          if (/swiftshader|llvmpipe|softpipe|basic render|microsoft basic|software|intel\(r\) (hd|uhd)|intel.*(hd|uhd) graphics|radeon\(tm\) graphics|radeon graphics|vega \d|mali-[gt]\d{2}\b|adreno \(tm\) [1-5]\d\d/i.test(r)) setWeakGpu(true)
        } catch {
          /* unknown: keep auto */
        }
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <IdleSaver cap={q === 'leve'} />
      <LabelLayer />
      {/* highest graphics: bloom + colour finish (its own chunk, never downloaded otherwise) */}
      <Precompile />
      <ReadySignal />
      <PipFeed />
      <PerformanceMonitor
        flipflops={3}
        onFallback={() => {
          setLow(true)
          setDpr(Math.min(MOBILE ? 1.25 : 1.25, window.devicePixelRatio || 1))
          // Auto: this device can't keep up -> Leve from now on (remembered)
          setWeakGpu(true)
          prefs.set('gfxAutoWeak', true)
          // struggling device: drop the frosted-glass blur on the interface too
          document.documentElement.classList.add('lowfx')
        }}
        // phones are capped at 30 fps on purpose: judge them against that, not 60
        // aim at the screen's own refresh rate (120 Hz phone, 75 Hz monitor...)
        bounds={(refresh) => [refresh * 0.72, refresh * 0.92]}
        onDecline={() => {
          // phones keep at least 1.5x so edges stay smooth (MSAA alone isn't enough at 1x)
          setDpr((d) => Math.max(Math.min(MOBILE ? 1.5 : 1.25, window.devicePixelRatio || 1), d - 0.25))
          setLow(true)
        }}
        onIncline={() => {
          if (!MOBILE) setLow(false)
          setDpr((d) => Math.min(MOBILE ? Math.min(2, window.devicePixelRatio || 1) : Math.min(2, window.devicePixelRatio || 1), d + 0.25))
        }}
      />
      <Lights nightness={nightness ?? (night ? 1 : 0)} weather={weather} low={MOBILE || q === 'leve'} span={props.overview && props.campus ? Math.max(props.campus.W, props.campus.D) * 0.55 : 11} />
      {q !== 'leve' && <Sky nightness={nightness ?? (night ? 1 : 0)} weather={weather} desktop={false} />}
      {q !== 'leve' && <Weather kind={weather} low={low || q === 'media'} />}
      <Environment resolution={32} frames={1}>
        <Lightformer form="rect" intensity={2.5} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[8, 3, 4]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-6, 2, 6]} rotation-y={Math.PI / 3} scale={[6, 3, 1]} color="#ffeedd" />
      </Environment>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={4}
        maxDistance={props.campus ? Math.max(45, Math.max(props.campus.W, props.campus.D) * 2.2) : 45}
        minPolarAngle={0.3}
        maxPolarAngle={1.3}
        enableZoom={MOBILE}
        screenSpacePanning={false}
        panSpeed={MOBILE ? 1.5 : 1}
        onStart={onUserMove}
      />
      <CameraRig floorIdx={floorIdx} focus={focus} selectedBot={selectedBot} tour={tour} onUserMove={onUserMove} bounds={props.campus} />
      <Campus {...props} low={q === 'leve'} />
    </Canvas>
  )
}
