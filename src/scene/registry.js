import * as THREE from 'three'

/** Live world positions of mounted bots (head height), for camera focus + elevator doors. */
export const botPositions = new Map()

/** Shared signals between DOM UI and the 3D scene (no React re-render needed). */
export const sceneSignals = {
  zoom: 0, // pending zoom steps from +/- buttons
  focusRequest: null, // bot name the camera should glide to
}

export const tmpV = new THREE.Vector3()
