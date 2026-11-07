import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Environment, Lightformer, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import Building from './Building'
import { FLOOR_H } from './layout'
import { botPositions, sceneSignals } from './registry'

const DAY_BG = new THREE.Color('#eceef2')
const NIGHT_BG = new THREE.Color('#0c1120')

function Lights({ night }) {
  const { scene } = useThree()
  const hemi = useRef(), sun = useRef(), amb = useRef()
  const k = useRef(night ? 1 : 0)
  useEffect(() => {
    scene.background = DAY_BG.clone()
  }, [scene])
  useFrame((_, dt) => {
    k.current += ((night ? 1 : 0) - k.current) * Math.min(1, dt * 2.5)
    const n = k.current
    scene.background.copy(DAY_BG).lerp(NIGHT_BG, n)
    if (scene.fog) scene.fog.color.copy(scene.background)
    scene.environmentIntensity = THREE.MathUtils.lerp(0.9, 0.18, n)
    if (hemi.current) {
      hemi.current.intensity = THREE.MathUtils.lerp(1.15, 0.25, n)
      hemi.current.color.set('#ffffff').lerp(new THREE.Color('#7f8fc9'), n)
    }
    if (sun.current) {
      sun.current.intensity = THREE.MathUtils.lerp(2.1, 0.35, n)
      sun.current.color.set('#fff8ef').lerp(new THREE.Color('#9fb4ff'), n)
    }
    if (amb.current) amb.current.intensity = THREE.MathUtils.lerp(0.35, 0.12, n)
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#ffffff', '#d4d7de', 1.15]} />
      <ambientLight ref={amb} intensity={0.35} />
      <SunWithTarget sunRef={sun} />
    </>
  )
}

/** Directional light that follows the camera target so shadows stay crisp on the current floor. */
function SunWithTarget({ sunRef }) {
  const controls = useThree((s) => s.controls)
  const target = useRef()
  useEffect(() => {
    if (sunRef.current && target.current) sunRef.current.target = target.current
  }, [sunRef])
  useFrame(() => {
    if (!controls || !sunRef.current || !target.current) return
    const t = controls.target
    target.current.position.set(t.x, t.y - 0.8, t.z)
    sunRef.current.position.set(t.x + 7, t.y + 14, t.z + 5)
  })
  return (
    <>
      <directionalLight
        ref={sunRef}
        castShadow
        intensity={2.1}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-14}
        shadow-camera-right={14}
        shadow-camera-top={14}
        shadow-camera-bottom={-14}
        shadow-camera-near={1}
        shadow-camera-far={45}
        shadow-bias={-0.0004}
        shadow-normalBias={0.02}
        shadow-radius={6}
      />
      <object3D ref={target} />
    </>
  )
}

const keys = new Set()
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), delta = new THREE.Vector3()

function CameraRig({ floorIdx, selectedBot, tour, onUserMove }) {
  const { camera, controls } = useThree()
  const desired = useRef(new THREE.Vector3(0, 0.6, 0))
  const last = useRef(floorIdx)

  useEffect(() => {
    desired.current.set(0, floorIdx * FLOOR_H + 0.6, 0)
    last.current = floorIdx
  }, [floorIdx])

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
      const p = botPositions.get(selectedBot)
      if (p) desired.current.copy(p)
    }
    delta.copy(desired.current).sub(target).multiplyScalar(Math.min(1, dt * 4))
    if (delta.lengthSq() > 1e-8) {
      target.add(delta)
      camera.position.add(delta)
    }
    // zoom buttons
    if (sceneSignals.zoom !== 0) {
      const f = sceneSignals.zoom > 0 ? 0.82 : 1.22
      sceneSignals.zoom = 0
      const off = camera.position.clone().sub(target)
      const len = THREE.MathUtils.clamp(off.length() * f, controls.minDistance, controls.maxDistance)
      camera.position.copy(target).add(off.setLength(len))
    }
    // focus request zooms in a bit
    if (sceneSignals.focusRequest) {
      sceneSignals.focusRequest = null
      const off = camera.position.clone().sub(target)
      if (off.length() > 16) camera.position.copy(target).add(off.setLength(16))
    }
    controls.update()
  })
  return null
}

export default function Scene(props) {
  const { night, tour, floorIdx, selectedBot, onPointerMissed, onUserMove } = props
  return (
    <Canvas
      shadows="soft"
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, position: [13.5, 12.5 + floorIdx * FLOOR_H, 13.5], near: 0.5, far: 260 }}
      onPointerMissed={onPointerMissed}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1.05
      }}
    >
      <Lights night={night} />
      <Environment resolution={128} frames={1}>
        <Lightformer form="rect" intensity={2.5} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[8, 3, 4]} rotation-y={-Math.PI / 2} scale={[8, 4, 1]} />
        <Lightformer form="rect" intensity={0.8} position={[-6, 2, 6]} rotation-y={Math.PI / 3} scale={[6, 3, 1]} color="#ffeedd" />
      </Environment>
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={60}
        minPolarAngle={0.25}
        maxPolarAngle={1.32}
        onStart={onUserMove}
      />
      <CameraRig floorIdx={floorIdx} selectedBot={selectedBot} tour={tour} onUserMove={onUserMove} />
      <Building {...props} />
    </Canvas>
  )
}
