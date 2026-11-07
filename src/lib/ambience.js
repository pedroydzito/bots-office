// Optional ambient sound, fully synthesized (no audio files): soft room tone, keyboard clicks
// that follow how many bots are working, and rain when the weather says so.
let ctx = null, master = null, roomGain = null, rainGain = null, clickTimer = null
let working = 0

function noiseBuffer(c, seconds = 2) {
  const b = c.createBuffer(1, c.sampleRate * seconds, c.sampleRate)
  const d = b.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
  return b
}

function loop(c, buf, filterType, freq, gain) {
  const src = c.createBufferSource()
  src.buffer = buf
  src.loop = true
  const f = c.createBiquadFilter()
  f.type = filterType
  f.frequency.value = freq
  const g = c.createGain()
  g.gain.value = gain
  src.connect(f).connect(g).connect(master)
  src.start()
  return g
}

function click() {
  if (!ctx) return
  const t = ctx.currentTime
  const src = ctx.createBufferSource()
  src.buffer = noiseBuffer(ctx, 0.03)
  const f = ctx.createBiquadFilter()
  f.type = 'bandpass'
  f.frequency.value = 2400 + Math.random() * 1800
  const g = ctx.createGain()
  g.gain.setValueAtTime(0.05 + Math.random() * 0.03, t)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
  src.connect(f).connect(g).connect(master)
  src.start(t)
}

function scheduleClicks() {
  clearTimeout(clickTimer)
  if (!ctx) return
  // more working bots -> denser typing; nobody working -> silence
  const rate = Math.min(14, working * 1.6)
  if (rate > 0) {
    const burst = 1 + Math.floor(Math.random() * 4)
    for (let i = 0; i < burst; i++) setTimeout(click, i * (60 + Math.random() * 70))
  }
  clickTimer = setTimeout(scheduleClicks, rate > 0 ? 1000 / rate + Math.random() * 400 : 1500)
}

export function startAmbience() {
  if (ctx) return
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
    const buf = noiseBuffer(ctx)
    roomGain = loop(ctx, buf, 'lowpass', 300, 0.035)
    rainGain = loop(ctx, buf, 'highpass', 1200, 0)
    scheduleClicks()
  } catch {
    ctx = null
  }
}

export function stopAmbience() {
  clearTimeout(clickTimer)
  if (ctx) ctx.close()
  ctx = null
}

export function updateAmbience({ workingCount, weather }) {
  working = workingCount
  if (!ctx || !rainGain) return
  const r = weather === 'storm' ? 0.16 : weather === 'rain' ? 0.1 : 0
  rainGain.gain.setTargetAtTime(r, ctx.currentTime, 1.5)
}
