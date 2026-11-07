export const PALETTE = {
  violet: '#8F59F9',
  purple: '#8F59F9',
  blue: '#1E86FC',
  orange: '#FD690F',
  red: '#E5484D',
  magenta: '#F93498',
  pink: '#F93498',
  brown: '#A06B39',
  black: '#1a1a1a',
  none: '#959595',
  grey: '#959595',
  gray: '#959595',
  green: '#2FB36B',
  yellow: '#F5B70A',
  teal: '#14B8A6',
}

export function resolveColor(c) {
  if (typeof c !== 'string') return PALETTE.none
  const k = c.trim().toLowerCase()
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/.test(k)) return k
  return PALETTE[k] || PALETTE.none
}

export function isDark(hex) {
  const c = hex.replace('#', '')
  const full = c.length === 3 ? c.split('').map((x) => x + x).join('') : c
  const n = parseInt(full, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 70
}

export const SHAPES = [
  'cloud', 'wedge', 'pebble', 'heart', 'sphere', 'star4', 'star6', 'clover', 'bubble',
  'flower', 'drop', 'pill', 'triangle', 'pentagon', 'hexagon', 'cone', 'trio', 'rounded_square',
]
export const ACCESSORIES = ['none', 'glasses', 'antenna', 'stem', 'bow']

export const STATUS = {
  working: { label: 'Working', color: '#2FB36B' },
  waiting_user: { label: 'Waiting on you', color: '#F5A524' },
  error: { label: 'Error', color: '#E5484D' },
  done: { label: 'Finished', color: '#1E86FC' },
  resting: { label: 'Resting', color: '#A3A7AE' },
}

export const DECAY_MS = 2 * 3600 * 1000
export const TALK_TIMEOUT_MS = 90 * 1000
export const CORTEX_KEY = '__cortex__'

/** Status the UI shows: idle and anything older than ~2h become "resting". */
export function effStatus(bot, now) {
  if (!bot || !bot.status || bot.status === 'idle') return 'resting'
  if (now - (bot.ts || 0) > DECAY_MS) return 'resting'
  return bot.status
}

export function talkActive(talk, now) {
  return !!talk && now - talk.lastT < TALK_TIMEOUT_MS
}

export function chatLink(state, name) {
  const explicit = state.chat[name]
  if (explicit) return explicit
  const id = state.bots[name]?.id
  return id ? `grokbot://app/v1/agent?id=${encodeURIComponent(id)}` : null
}

export function hhmm(t) {
  const d = new Date(t)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

export function durationShort(ms) {
  if (!isFinite(ms)) return ''
  const neg = ms < 0
  ms = Math.abs(ms)
  const m = Math.floor(ms / 60000)
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60
  const s = d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`
  return neg ? `${s} ago` : s
}
