// Canvas-generated textures (no image downloads).
import * as THREE from 'three'

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, Helvetica, Arial, sans-serif'

function canvas(w, h) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')]
}

function tex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c)
  if (srgb) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

let codeTextures = null
export function getCodeTextures() {
  if (codeTextures) return codeTextures
  const palettes = [['#7dd3fc', '#a78bfa', '#f0abfc', '#86efac'], ['#fcd34d', '#fca5a5', '#93c5fd', '#e5e7eb'], ['#86efac', '#67e8f9', '#c4b5fd', '#fde68a']]
  codeTextures = palettes.map((pal, k) => {
    const [c, g] = canvas(256, 512)
    g.fillStyle = '#0f172a'
    g.fillRect(0, 0, 256, 512)
    let y = 14
    while (y < 512) {
      const indent = (Math.floor(Math.random() * 4)) * 14
      let x = 14 + indent
      const segs = 1 + Math.floor(Math.random() * 4)
      for (let s = 0; s < segs && x < 230; s++) {
        const w = 14 + Math.random() * 60
        g.fillStyle = pal[(s + k + Math.floor(y / 20)) % pal.length]
        g.globalAlpha = 0.85
        g.fillRect(x, y, Math.min(w, 240 - x), 7)
        x += w + 8
      }
      y += 16
    }
    const t = tex(c)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(1, 0.5)
    return t
  })
  return codeTextures
}

const facadeCache = new Map()
export function getFacadeTexture(length, lit) {
  const key = `${length}:${lit}`
  if (facadeCache.has(key)) return facadeCache.get(key)
  const [c, g] = canvas(1024, 256)
  const panes = Math.max(4, Math.round(length / 0.9))
  const pw = 1024 / panes
  g.fillStyle = lit ? '#000000' : '#f4f5f7'
  g.fillRect(0, 0, 1024, 256)
  for (let i = 0; i < panes; i++) {
    const on = lit ? Math.random() < 0.55 : true
    if (lit) {
      if (!on) continue
      const grd = g.createLinearGradient(0, 30, 0, 230)
      grd.addColorStop(0, '#ffd89a')
      grd.addColorStop(1, '#f2a65a')
      g.fillStyle = grd
    } else {
      const grd = g.createLinearGradient(0, 0, 0, 256)
      grd.addColorStop(0, '#1b1e25')
      grd.addColorStop(1, '#0d0f14')
      g.fillStyle = grd
    }
    g.fillRect(i * pw + pw * 0.16, 28, pw * 0.68, 200)
  }
  const t = tex(c)
  facadeCache.set(key, t)
  return t
}

export function makeTitleTexture(title, subtitle) {
  const [c, g] = canvas(1024, 256)
  g.clearRect(0, 0, 1024, 256)
  g.fillStyle = '#16181d'
  g.font = `700 120px ${FONT}`
  g.textBaseline = 'alphabetic'
  g.fillText(title, 8, 150)
  const w = g.measureText(title).width
  g.fillStyle = '#9aa0aa'
  g.font = `500 46px ${FONT}`
  g.fillText(subtitle, Math.min(w + 40, 800), 150)
  return tex(c)
}

export function makeClockFace() {
  const [c, g] = canvas(256, 256)
  g.fillStyle = '#ffffff'
  g.beginPath()
  g.arc(128, 128, 124, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#1b1d22'
  g.lineCap = 'round'
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2
    g.lineWidth = i % 3 ? 4 : 8
    g.beginPath()
    g.moveTo(128 + Math.cos(a) * 100, 128 + Math.sin(a) * 100)
    g.lineTo(128 + Math.cos(a) * 112, 128 + Math.sin(a) * 112)
    g.stroke()
  }
  return tex(c)
}

export function createTVCanvas() {
  const [c, g] = canvas(512, 300)
  const t = tex(c)
  return { canvas: c, ctx: g, texture: t }
}

export function drawTV(tv, { label, value, series, accent = '#34d399' }) {
  const { ctx: g, canvas: c } = tv
  const W = c.width, H = c.height
  g.fillStyle = '#0b0f17'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#7b8494'
  g.font = `600 22px ${FONT}`
  g.fillText(label, 26, 42)
  g.fillStyle = '#ffffff'
  g.font = `700 64px ${FONT}`
  g.fillText(String(value), 24, 108)
  const max = Math.max(1, ...series)
  const n = series.length
  // bars on the right
  for (let i = 0; i < Math.min(10, n); i++) {
    const v = series[n - 1 - i] / max
    g.fillStyle = '#3b82f6'
    const bw = 12
    const x = W - 30 - i * 18
    g.fillRect(x, H - 26 - v * 120, bw, v * 120)
  }
  // line
  g.strokeStyle = accent
  g.lineWidth = 4
  g.lineJoin = 'round'
  g.beginPath()
  series.forEach((v, i) => {
    const x = 24 + (i / Math.max(1, n - 1)) * (W - 240)
    const y = H - 30 - (v / max) * 140
    i ? g.lineTo(x, y) : g.moveTo(x, y)
  })
  g.stroke()
  tv.texture.needsUpdate = true
}

export function makeRugTexture(color) {
  const [c, g] = canvas(256, 256)
  g.fillStyle = color
  g.fillRect(0, 0, 256, 256)
  g.strokeStyle = 'rgba(255,255,255,0.35)'
  g.lineWidth = 6
  g.strokeRect(18, 18, 220, 220)
  return tex(c)
}
