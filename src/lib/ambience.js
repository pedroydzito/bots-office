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

// ---------------------------------------------------------------- background music
// A slow, quiet generative pad: four soft chords on a loop with a few sparse pentatonic notes.
let mctx = null, mGain = null, musicTimer = null, chordIdx = 0
const CHORDS = [
  [261.63, 329.63, 392.0, 493.88], // Cmaj7
  [220.0, 261.63, 329.63, 392.0], // Am7
  [174.61, 220.0, 261.63, 329.63], // Fmaj7
  [196.0, 246.94, 293.66, 329.63], // G6
]
const PENTA = [523.25, 587.33, 659.25, 783.99, 880.0]

function voice(c, freq, start, dur, gain, type = 'triangle') {
  const o = c.createOscillator()
  const g = c.createGain()
  const f = c.createBiquadFilter()
  o.type = type
  o.frequency.value = freq
  o.detune.value = (Math.random() - 0.5) * 8
  f.type = 'lowpass'
  f.frequency.value = 1100
  g.gain.setValueAtTime(0, start)
  g.gain.linearRampToValueAtTime(gain, start + Math.min(2.5, dur / 3))
  g.gain.setValueAtTime(gain, start + dur - Math.min(3, dur / 3))
  g.gain.linearRampToValueAtTime(0, start + dur)
  o.connect(f).connect(g).connect(mGain)
  o.start(start)
  o.stop(start + dur + 0.1)
}

function nextBar() {
  if (!mctx) return
  const t = mctx.currentTime + 0.05
  const chord = CHORDS[chordIdx++ % CHORDS.length]
  chord.forEach((f, i) => voice(mctx, f / 2, t + i * 0.08, 9.5, 0.018))
  voice(mctx, chord[0] / 4, t, 9.5, 0.022, 'sine')
  // a few soft notes on top
  const notes = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < notes; i++) voice(mctx, PENTA[Math.floor(Math.random() * PENTA.length)], t + 1 + Math.random() * 6.5, 2.4, 0.012, 'sine')
  musicTimer = setTimeout(nextBar, 8000)
}

export function startMusic() {
  if (mctx) return
  try {
    mctx = new (window.AudioContext || window.webkitAudioContext)()
    mGain = mctx.createGain()
    mGain.gain.value = 0
    mGain.gain.linearRampToValueAtTime(0.9, mctx.currentTime + 4) // fade in
    // gentle echo for space
    const delay = mctx.createDelay()
    delay.delayTime.value = 0.42
    const fb = mctx.createGain()
    fb.gain.value = 0.28
    mGain.connect(mctx.destination)
    mGain.connect(delay)
    delay.connect(fb).connect(delay)
    delay.connect(mctx.destination)
    nextBar()
  } catch {
    mctx = null
  }
}

export function stopMusic() {
  clearTimeout(musicTimer)
  if (mctx) {
    const c = mctx
    mGain.gain.linearRampToValueAtTime(0, c.currentTime + 1)
    setTimeout(() => c.close(), 1200)
  }
  mctx = null
}

// ---------------------------------------------------------------- interface sounds
let uctx = null
const UI = {
  click: [[880, 0, 0.05, 0.035]],
  toggle: [[660, 0, 0.06, 0.03], [990, 0.05, 0.08, 0.03]],
  open: [[520, 0, 0.08, 0.03], [780, 0.06, 0.1, 0.025]],
  close: [[700, 0, 0.07, 0.03], [470, 0.05, 0.09, 0.025]],
  done: [[784, 0, 0.12, 0.03], [1047, 0.09, 0.18, 0.03]],
  pop: [[1200, 0, 0.04, 0.025]],
}
/** Tiny, quiet blips for the interface. Only when the user turned them on. */
export function uiSound(kind = 'click') {
  try {
    uctx = uctx || new (window.AudioContext || window.webkitAudioContext)()
    const t0 = uctx.currentTime
    for (const [f, d, len, g] of UI[kind] || UI.click) {
      const o = uctx.createOscillator()
      const gn = uctx.createGain()
      o.type = 'sine'
      o.frequency.setValueAtTime(f, t0 + d)
      o.frequency.exponentialRampToValueAtTime(f * 1.04, t0 + d + len)
      gn.gain.setValueAtTime(0, t0 + d)
      gn.gain.linearRampToValueAtTime(g, t0 + d + 0.008)
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d + len)
      o.connect(gn).connect(uctx.destination)
      o.start(t0 + d)
      o.stop(t0 + d + len + 0.02)
    }
  } catch {
    /* audio blocked */
  }
}

/** Browsers start audio suspended until a real gesture: resume everything we created. */
export function resumeAudio() {
  for (const c of [ctx, mctx, uctx]) if (c && c.state === 'suspended') c.resume().catch(() => {})
}
