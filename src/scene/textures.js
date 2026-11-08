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
  const [c, g] = canvas(1024, 600)
  g.scale(2, 2)
  const t = tex(c)
  t.anisotropy = 8
  return { canvas: c, ctx: g, texture: t }
}

/** Team TV: weekly goal progress on top, activity sparkline below. */
/** Team TV: what the floor is doing right now + the latest deliveries. */
export function drawTVNow(tv, { working, waiting, errors, total, last }) {
  const { ctx: g } = tv
  const W = 512, H = 300
  g.fillStyle = '#0b0f17'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#7b8494'
  g.font = `700 17px ${FONT}`
  g.fillText('AGORA NO ANDAR', 24, 36)
  g.textAlign = 'right'
  g.fillText(`${total} BOTS`, W - 24, 36)
  g.textAlign = 'left'
  const stats = [['Trabalhando', working, '#34d399'], ['Esperando você', waiting, '#f5a524'], ['Com erro', errors, '#ff6369']]
  stats.forEach(([l, v, col], i) => {
    const x = 24 + i * 160
    g.fillStyle = v ? col : '#3a4252'
    g.font = `800 50px ${FONT}`
    g.fillText(String(v), x, 96)
    g.fillStyle = '#9aa3b2'
    g.font = `600 15px ${FONT}`
    g.fillText(l, x, 120)
  })
  g.fillStyle = '#1d2433'
  g.fillRect(24, 140, W - 48, 2)
  g.fillStyle = '#7b8494'
  g.font = `700 15px ${FONT}`
  g.fillText('ÚLTIMAS ENTREGAS', 24, 170)
  if (!last.length) {
    g.fillStyle = '#5d6676'
    g.font = `500 17px ${FONT}`
    g.fillText('Nada concluído hoje ainda', 24, 200)
  }
  last.slice(0, 3).forEach((l, i) => {
    const y = 200 + i * 34
    g.fillStyle = '#ffffff'
    g.font = `700 18px ${FONT}`
    let a = l.bot
    while (g.measureText(a).width > 150 && a.length > 3) a = a.slice(0, -2)
    g.fillText(a, 24, y)
    g.fillStyle = '#9aa3b2'
    g.font = `500 16px ${FONT}`
    let b = l.step || 'Concluído'
    while (g.measureText(b).width > 230 && b.length > 3) b = b.slice(0, -2)
    g.fillText(b, 184, y)
    g.textAlign = 'right'
    g.fillStyle = '#6b7484'
    g.fillText(l.ago, W - 24, y)
    g.textAlign = 'left'
  })
  tv.texture.needsUpdate = true
}

export function drawTV(tv, { label, value, series, goal, accent = '#34d399' }) {
  const { ctx: g } = tv
  const W = 512, H = 300
  g.fillStyle = '#0b0f17'
  g.fillRect(0, 0, W, H)
  // goal
  const n = goal?.n ?? 0
  const target = goal?.target || 0
  g.fillStyle = '#7b8494'
  g.font = `600 20px ${FONT}`
  g.fillText((goal?.label || 'Concluídas na semana').toUpperCase(), 24, 38)
  g.fillStyle = '#ffffff'
  g.font = `700 52px ${FONT}`
  const big = target ? `${n}` : `${n}`
  g.fillText(big, 22, 92)
  if (target) {
    const w = g.measureText(big).width
    g.fillStyle = '#7b8494'
    g.font = `600 28px ${FONT}`
    g.fillText(`/ ${target}`, 30 + w, 92)
    const pct = Math.min(1, n / target)
    g.fillStyle = '#1d2433'
    roundRect(g, 24, 108, W - 48, 16, 8)
    g.fill()
    g.fillStyle = pct >= 1 ? '#f5b70a' : '#34d399'
    roundRect(g, 24, 108, Math.max(16, (W - 48) * pct), 16, 8)
    g.fill()
    g.fillStyle = pct >= 1 ? '#f5b70a' : '#9aa3b2'
    g.font = `700 20px ${FONT}`
    g.textAlign = 'right'
    g.fillText(pct >= 1 ? 'META BATIDA!' : `${Math.round(pct * 100)}%`, W - 24, 92)
    g.textAlign = 'left'
  }
  // activity
  g.fillStyle = '#7b8494'
  g.font = `600 16px ${FONT}`
  g.fillText(`${label}  ·  ${value}`, 24, 160)
  const max = Math.max(1, ...series)
  const k = series.length
  g.strokeStyle = accent
  g.lineWidth = 4
  g.lineJoin = 'round'
  g.beginPath()
  series.forEach((v, i) => {
    const x = 24 + (i / Math.max(1, k - 1)) * (W - 48)
    const y = H - 22 - (v / max) * 95
    i ? g.lineTo(x, y) : g.moveTo(x, y)
  })
  g.stroke()
  tv.texture.needsUpdate = true
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

/** White rounded card with a title and an optional sub line (for sprites). */
export function makeCardTexture(title, sub, { big = false, accent = '#16181d' } = {}) {
  const [c, g] = canvas(512, big ? 220 : 128)
  const H = c.height
  g.shadowColor = 'rgba(0,0,0,0.12)'
  g.shadowBlur = 14
  g.fillStyle = '#ffffff'
  roundRect(g, 12, 10, 488, H - 24, 26)
  g.fill()
  g.shadowBlur = 0
  g.textAlign = 'center'
  g.fillStyle = accent
  g.font = big ? `800 92px ${FONT}` : `650 38px ${FONT}`
  let t = title
  while (g.measureText(t).width > 460 && t.length > 4) t = t.slice(0, -2)
  if (t !== title) t = t.trimEnd() + '…'
  g.fillText(t, 256, big ? 112 : sub ? 62 : 78)
  if (sub) {
    g.fillStyle = '#8b9099'
    g.font = `500 ${big ? 34 : 26}px ${FONT}`
    g.fillText(sub, 256, big ? 170 : 98)
  }
  return tex(c)
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

/** Wall board (cork or white) with a title and up to 6 lines. Redrawn when its content changes. */
export function drawBoard(ctx, canvasEl, { title, lines, accent = '#8F59F9', cork = false, empty = '' }) {
  const g = ctx, S = canvasEl.width / 512, W = 512, H = canvasEl.height / S
  g.setTransform(S, 0, 0, S, 0, 0)
  g.fillStyle = cork ? '#d8b27e' : '#ffffff'
  g.fillRect(0, 0, W, H)
  if (cork) {
    g.fillStyle = 'rgba(120,80,30,0.08)'
    for (let i = 0; i < 260; i++) g.fillRect(Math.random() * W, Math.random() * H, 3, 3)
  }
  g.fillStyle = accent
  g.fillRect(0, 0, W, 10)
  g.fillStyle = '#16181d'
  g.font = `700 40px ${FONT}`
  g.fillText(title, 28, 66)
  if (!lines.length) {
    g.fillStyle = cork ? '#7a5a2e' : '#9aa0aa'
    g.font = `500 28px ${FONT}`
    g.fillText(empty, 28, 120)
  }
  lines.slice(0, 6).forEach((l, i) => {
    const y = 96 + i * 66
    if (cork) {
      g.save()
      g.translate(28, y)
      g.rotate((i % 2 ? 1 : -1) * 0.012)
      g.fillStyle = ['#fff3a3', '#ffd6e7', '#d6ecff', '#e3ffd6'][i % 4]
      g.fillRect(0, 0, W - 56, 56)
      g.restore()
    }
    g.fillStyle = l.color || '#16181d'
    g.font = `700 27px ${FONT}`
    let a = l.a
    while (g.measureText(a).width > W - 90 && a.length > 3) a = a.slice(0, -2)
    g.fillText(a, 42, y + 25)
    g.fillStyle = '#5d636e'
    g.font = `500 22px ${FONT}`
    let b = l.b || ''
    while (g.measureText(b).width > W - 90 && b.length > 3) b = b.slice(0, -2)
    g.fillText(b, 42, y + 48)
  })
}

// ---- monitor screens that match what the bot is doing (built once, shared by every desk)
let screens = null
function screen(draw) {
  const [c, g] = canvas(256, 160)
  draw(g, 256, 160)
  const t = tex(c)
  t.anisotropy = 4
  return t
}
function bar(g, x, y, w, h, c) {
  g.fillStyle = c
  roundRect(g, x, y, w, h, Math.min(3, h / 2))
  g.fill()
}
export function getScreenTextures() {
  if (screens) return screens
  screens = {
    // inbox: list of messages, one highlighted
    mail: screen((g, W, H) => {
      g.fillStyle = '#f4f6fa'; g.fillRect(0, 0, W, H)
      bar(g, 0, 0, 62, H, '#e3e8f0')
      for (let i = 0; i < 5; i++) bar(g, 10, 14 + i * 18, 40, 7, i === 0 ? '#1E86FC' : '#b9c2d0')
      for (let i = 0; i < 6; i++) {
        const y = 10 + i * 25
        bar(g, 70, y, W - 78, 21, i === 1 ? '#dbeafe' : '#ffffff')
        bar(g, 76, y + 4, 60, 5, '#334155')
        bar(g, 76, y + 12, 120 - (i % 3) * 20, 4, '#94a3b8')
      }
    }),
    // dashboard: bars + a line chart
    chart: screen((g, W, H) => {
      g.fillStyle = '#0f172a'; g.fillRect(0, 0, W, H)
      for (let i = 0; i < 3; i++) (bar(g, 10 + i * 82, 10, 74, 34, '#1e293b'), bar(g, 18 + i * 82, 18, 30, 6, '#64748b'), bar(g, 18 + i * 82, 30, 44, 8, ['#34d399', '#60a5fa', '#fbbf24'][i]))
      const hs = [30, 52, 40, 70, 58, 86, 74, 95]
      hs.forEach((h, i) => bar(g, 14 + i * 14, H - 12 - h, 9, h, '#60a5fa'))
      g.strokeStyle = '#34d399'; g.lineWidth = 3; g.beginPath()
      ;[60, 48, 52, 34, 40, 22, 28].forEach((v, i) => (i ? g.lineTo(140 + i * 18, H - 60 + v) : g.moveTo(140, H - 60 + v)))
      g.stroke()
    }),
    // writing: a document with paragraphs
    doc: screen((g, W, H) => {
      g.fillStyle = '#e8ebf0'; g.fillRect(0, 0, W, H)
      bar(g, 48, 6, W - 96, H - 6, '#ffffff')
      bar(g, 62, 18, 90, 9, '#111827')
      for (let i = 0; i < 10; i++) bar(g, 62, 36 + i * 11, i % 4 === 3 ? 70 : W - 132 - (i % 3) * 8, 5, '#9ca3af')
    }),
    // design: canvas with shapes + layers panel
    design: screen((g, W, H) => {
      g.fillStyle = '#1f1f24'; g.fillRect(0, 0, W, H)
      bar(g, 0, 0, 46, H, '#2a2a31')
      for (let i = 0; i < 6; i++) bar(g, 8, 10 + i * 14, 30, 6, '#4b4b55')
      bar(g, 60, 12, W - 74, H - 24, '#f8fafc')
      g.fillStyle = '#8F59F9'; g.beginPath(); g.arc(110, 70, 26, 0, Math.PI * 2); g.fill()
      bar(g, 150, 40, 70, 46, '#F93498')
      bar(g, 80, 110, 140, 14, '#F5B70A')
    }),
    // browsing / research: a web page with search results
    web: screen((g, W, H) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H)
      bar(g, 0, 0, W, 18, '#e5e7eb')
      bar(g, 40, 5, W - 80, 9, '#ffffff')
      for (let i = 0; i < 4; i++) (bar(g, 16, 28 + i * 32, 110, 7, '#1d4ed8'), bar(g, 16, 39 + i * 32, W - 40, 4, '#9ca3af'), bar(g, 16, 46 + i * 32, W - 90, 4, '#9ca3af'))
    }),
    // video editing: preview + timeline
    video: screen((g, W, H) => {
      g.fillStyle = '#111114'; g.fillRect(0, 0, W, H)
      bar(g, 50, 8, W - 100, 82, '#334155')
      g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(120, 34); g.lineTo(142, 49); g.lineTo(120, 64); g.fill()
      for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) bar(g, 8 + i * 50 + r * 9, 100 + r * 18, 40, 12, ['#8F59F9', '#1E86FC', '#2FB36B'][r])
    }),
  }
  return screens
}

/** Pick a screen from the bot's current step (pt/en keywords); null = code. */
export function screenKind(step) {
  const s = (step || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  if (/e-?mail|inbox|caixa|mensag|respond|whats|dm\b|lead|contato|outreach/.test(s)) return 'mail'
  if (/relat|metric|dado|planilha|analis|venda|financ|dashboard|kpi|numero|custo|receita|uso/.test(s)) return 'chart'
  if (/design|thumb|imagem|arte|logo|banner|layout|criativ|carross|figma|visual/.test(s)) return 'design'
  if (/video|edic|editand|corte|reels|shorts|youtube|clipe/.test(s)) return 'video'
  if (/pesquis|busca|procur|vaga|site|navega|research|scrap|monitor/.test(s)) return 'web'
  if (/escrev|texto|post|roteiro|artigo|diario|doc|copy|legenda|resum|nota|redig|lista/.test(s)) return 'doc'
  return null
}
