import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'

// All bot labels (name, status icon, speech bubble) live in ONE overlay and are positioned in ONE
// loop per frame, instead of one projection loop per bot (what drei's <Html> does).
const entries = new Set()
const root = { el: null, listeners: new Set() }
const v = new THREE.Vector3()
/** Visible only if it and every parent are visible (a hidden room / pet hides its labels too). */
function shown(o) {
  for (let p = o; p; p = p.parent) if (!p.visible) return false
  return true
}

export function LabelLayer() {
  const { gl, camera, size, scene } = useThree()
  const sizeRef = useRef(size)
  sizeRef.current = size
  useLayoutEffect(() => {
    const host = gl.domElement.parentNode
    const el = document.createElement('div')
    el.className = 'label-layer'
    el.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:1'
    host.appendChild(el)
    root.el = el
    root.listeners.forEach((f) => f(el))
    return () => {
      root.el = null
      root.listeners.forEach((f) => f(null))
      el.remove()
    }
  }, [gl])
  // Positioned right after the frame is drawn: bots and the camera have already moved this frame,
  // so names and icons stick to their bot instead of trailing one frame behind.
  useEffect(() => {
    const prev = scene.onBeforeRender
    scene.onBeforeRender = (r, sc, cam) => {
      if (cam !== camera) return
      const size = sizeRef.current
      const vFov = (camera.fov * Math.PI) / 180
      const k = 2 * Math.tan(vFov / 2)
      for (const e of entries) {
        try {
        const o = e.anchor.current, el = e.el
        if (!o || !el) continue
        o.getWorldPosition(v)
        v.y += e.y * (o.scale?.y || 1)
        const dist = v.distanceTo(camera.position)
        v.project(camera)
        const off = v.z > 1 || !shown(o) || Math.abs(v.x) > 1.3 || Math.abs(v.y) > 1.3
        if (off) {
          if (!e.hidden) (el.style.display = 'none'), (e.hidden = true)
          continue
        }
        if (e.hidden) (el.style.display = ''), (e.hidden = false)
        const x = ((v.x + 1) / 2) * size.width, y = ((1 - v.y) / 2) * size.height
        const sc2 = e.fixed ? 1 : e.factor / (k * dist)
        // only touch the DOM when something changed (most labels sit still most of the time)
        const t = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${sc2.toFixed(3)}) translate(-50%,-50%)`
        if (t !== e.t) (el.style.transform = t), (e.t = t)
        const z = Math.round((1 - v.z) * 10000)
        if (z !== e.z) (el.style.zIndex = String(z)), (e.z = z)
        } catch {
          /* one bad label never stops the others */
        }
      }
    }
    return () => (scene.onBeforeRender = prev)
  }, [scene, camera])
  return null
}

/** A label that follows `anchor` (a ref to an Object3D), `y` units above it. Its content renders in its
 * own small React DOM root (the 3D renderer can't host DOM nodes); positioning is done by LabelLayer. */
export function Label({ anchor, y = 0, factor = 10, fixed = false, children }) {
  const [host, setHost] = useState(root.el)
  const entry = useRef({ anchor, y, factor, el: null })
  const rootRef = useRef(null)
  entry.current.anchor = anchor
  entry.current.y = y
  entry.current.factor = factor
  entry.current.fixed = fixed
  useEffect(() => {
    root.listeners.add(setHost)
    setHost(root.el)
    return () => root.listeners.delete(setHost)
  }, [])
  useLayoutEffect(() => {
    if (!host) return
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;display:none'
    host.appendChild(el)
    const r = createRoot(el)
    rootRef.current = r
    const e = entry.current
    e.el = el
    e.hidden = true // starts hidden (display:none) until the first placement
    e.t = e.z = null
    entries.add(e)
    return () => {
      entries.delete(e)
      rootRef.current = null
      setTimeout(() => r.unmount(), 0)
      el.remove()
    }
  }, [host])
  useLayoutEffect(() => {
    rootRef.current?.render(children)
  })
  return null
}
