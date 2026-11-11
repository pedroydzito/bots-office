import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Furniture and walls are hundreds of small meshes that never move. After mount, bake every
// static mesh that shares a material into one geometry per material (hundreds of draw calls
// become a few dozen). Anything animated is left alone: an object with a React ref is marked
// `userData.dynamic` and skipped with all its children. Materials stay shared, so colour /
// emissive changes driven elsewhere still show on the merged meshes.
const tmp = new THREE.Matrix4()

function isDynamic(o, root) {
  for (let p = o; p && p !== root; p = p.parent) if (p.userData?.dynamic || p.__r3f?.eventCount) return true
  return false
}

function prep(g, m) {
  let geo = g.index ? g.toNonIndexed() : g.clone()
  for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') geo.deleteAttribute(k)
  if (!geo.attributes.normal) geo.computeVertexNormals()
  if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2))
  geo.clearGroups()
  geo.applyMatrix4(m)
  return geo
}

// Props often declare their own inline material (<meshStandardMaterial color=…/>): every one is a
// separate instance, so merging by instance merged almost nothing. Plain, non-glowing materials
// that look the same are merged together; anything with a texture or glow stays per instance
// (those are the ones animated in code).
// Those plain ones are merged regardless of colour: the colour goes into the vertices and one
// shared vertex-colour material draws them all (a room's furniture becomes a handful of meshes).
function plain(m) {
  if (!m.isMeshStandardMaterial || m.isMeshPhysicalMaterial || m.map || m.emissiveMap || m.normalMap || m.vertexColors || m.userData?.live) return false
  return !(m.emissiveIntensity > 0 && m.emissive.getHex() !== 0)
}
function matKey(m) {
  if (!plain(m)) return m.uuid
  return `vc|${(Math.round(m.roughness * 4) / 4).toFixed(2)}|${(Math.round(m.metalness * 4) / 4).toFixed(2)}|${m.side}|${m.flatShading ? 1 : 0}`
}
const vcMats = new Map()
function vcMaterial(m) {
  const k = matKey(m)
  if (!vcMats.has(k)) vcMats.set(k, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: Math.round(m.roughness * 4) / 4, metalness: Math.round(m.metalness * 4) / 4, side: m.side, flatShading: m.flatShading }))
  return vcMats.get(k)
}
function addColor(g, c) {
  const n = g.attributes.position.count
  const a = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) (a[i * 3] = c.r), (a[i * 3 + 1] = c.g), (a[i * 3 + 2] = c.b)
  g.setAttribute('color', new THREE.BufferAttribute(a, 3))
}

export default function StaticMerge({ children }) {
  const ref = useRef()
  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    root.updateWorldMatrix(true, true)
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert()
    const buckets = new Map()
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.isSkinnedMesh || !o.visible) return
      const mat = o.material
      if (!mat || Array.isArray(mat) || mat.transparent || o.geometry.isInstancedBufferGeometry || !o.geometry.attributes.position) return
      if (isDynamic(o, root)) return
      const key = `${matKey(mat)}|${o.castShadow ? 1 : 0}|${o.receiveShadow ? 1 : 0}`
      let b = buckets.get(key)
      if (!b) buckets.set(key, (b = { mat: plain(mat) ? vcMaterial(mat) : mat, vc: plain(mat), cast: o.castShadow, recv: o.receiveShadow, list: [] }))
      b.list.push(o)
    })
    const added = []
    const hidden = []
    for (const b of buckets.values()) {
      if (b.list.length < 2) continue
      const geos = b.list.map((o) => {
        const g = prep(o.geometry, tmp.multiplyMatrices(inv, o.matrixWorld))
        if (b.vc) addColor(g, o.material.color)
        return g
      })
      const merged = mergeGeometries(geos, false)
      geos.forEach((g) => g.dispose())
      if (!merged) continue
      merged.computeBoundingSphere()
      const mesh = new THREE.Mesh(merged, b.mat)
      mesh.castShadow = b.cast
      mesh.receiveShadow = b.recv
      mesh.matrixAutoUpdate = false
      root.add(mesh)
      added.push(mesh)
      for (const o of b.list) (o.visible = false, (o.matrixAutoUpdate = false), (o.matrixWorldAutoUpdate = false), hidden.push(o))
    }
    return () => {
      for (const m of added) (root.remove(m), m.geometry.dispose())
      for (const o of hidden) (o.visible = true, (o.matrixAutoUpdate = true), (o.matrixWorldAutoUpdate = true))
    }
  }, [])
  return <group ref={ref}>{children}</group>
}
