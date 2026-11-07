import * as THREE from 'three'

/** Live world positions of mounted bots (head height), for camera focus + elevator doors. */
export const botPositions = new Map()

/** Shared signals between DOM UI and the 3D scene (no React re-render needed). */
export const sceneSignals = {
  zoom: 0, // pending zoom steps from +/- buttons
  focusRequest: null, // bot name the camera should glide to
}

export const tmpV = new THREE.Vector3()

/** Seated bots publish their swivel so their chair turns with them. */
export const seatYaw = new Map()

/** Points of interest currently claimed by a bot (one bot per spot). */
export const poiTaken = new Set()
export const poiKey = (p) => `${p.kind}:${p.x.toFixed(2)},${p.z.toFixed(2)}`

let codeScroll = 0
/** Advance the shared monitor "code" scroll once per frame (not once per desk). */
export function tickCodeScroll(t, textures) {
  if (codeScroll === t) return
  codeScroll = t
  for (const tex of textures) tex.offset.y = (-t * 0.05) % 1
}
