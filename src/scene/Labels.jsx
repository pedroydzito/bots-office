import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

// All bot labels (name, status icon, speech bubble) live in ONE overlay and are positioned in ONE
// loop per frame, instead of one projection loop per bot (what drei's <Html> does).
const entries = new Set()
const root = { el: null, listeners: new Set() }
const v = new THREE.Vector3()

export function LabelLayer() {
  const { gl, camera, size } = useThree()
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
  useFrame(() => {
    const vFov = (camera.fov * Math.PI) / 180
    for (const e of entries) {
      const o = e.anchor.current, el = e.el
      if (!o || !el) continue
      o.getWorldPosition(v)
      v.y += e.y * (o.scale?.y || 1)
      const dist = v.distanceTo(camera.position)
      v.project(camera)
      const off = v.z > 1 || !o.visible
      if (off) {
        if (el.style.display !== 'none') el.style.display = 'none'
        continue
      }
      if (el.style.display === 'none') el.style.display = ''
      const x = ((v.x + 1) / 2) * size.width, y = ((1 - v.y) / 2) * size.height
      const s = e.fixed ? 1 : e.factor / (2 * Math.tan(vFov / 2) * dist)
      el.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(3)}) translate(-50%,-50%)`
      el.style.zIndex = String(Math.round((1 - v.z) * 10000))
    }
  })
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
