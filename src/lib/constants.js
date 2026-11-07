export const PALETTE = {
  violet: '#9B5CF6',
  purple: '#9B5CF6',
  blue: '#1683FF',
  orange: '#FF6A00',
  red: '#FF2D3D',
  magenta: '#FF2FA0',
  pink: '#FF2FA0',
  brown: '#8E5E34',
  black: '#1a1a1a',
  none: '#6E6E6E',
  grey: '#6E6E6E',
  gray: '#6E6E6E',
  green: '#00C46A',
  yellow: '#FF9F0A',
  teal: '#14B8A6',
  cyan: '#00B3A7',
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

// Grok Bot avatar shapes (exact names from the app)
export const GROK_SHAPES = [
  'blob', 'pebble', 'bean', 'egg', 'squircle', 'tablet', 'capsule', 'cylinder', 'hex', 'gem', 'crystal', 'wedge', 'shield',
  'dome', 'arch', 'cloud', 'teardrop', 'leaf', 'square', 'sparkle', 'clover', 'flower', 'heart', 'house', 'star',
]
// older names still accepted
export const SHAPE_ALIASES = {
  circle: 'blob', sphere: 'blob', hexagon: 'hex', drop: 'teardrop', rounded_square: 'square', pill: 'capsule', star4: 'sparkle',
}
export const SHAPES = [...GROK_SHAPES, 'star6', 'bubble', 'triangle', 'pentagon', 'cone', 'trio', 'photo']
/** Canonical shape name, or null if unknown. */
export function normalizeShape(name) {
  if (typeof name !== 'string') return null
  const k = name.trim().toLowerCase().replace(/[\s-]+/g, '_')
  const c = SHAPE_ALIASES[k] || k
  return SHAPES.includes(c) ? c : null
}
// Grok Bot colours (exact names); `grey`, `none`, `purple`, `pink`, `teal` kept as aliases
export const GROK_COLORS = ['black', 'brown', 'red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'violet', 'magenta', 'gray']
export const ACCESSORIES = ['none', 'glasses', 'antenna', 'stem', 'bow', 'headphones', 'cap', 'scarf', 'crown']

export const STATUS = {
  working: { label: 'Trabalhando', color: '#2FB36B' },
  waiting_user: { label: 'Esperando você', color: '#F5A524' },
  error: { label: 'Erro', color: '#E5484D' },
  done: { label: 'Concluído', color: '#1E86FC' },
  resting: { label: 'Descansando', color: '#A3A7AE' },
}

export const DECAY_MS = 2 * 3600 * 1000
export const WORKING_DECAY_MS = 30 * 60 * 1000
export const TALK_TIMEOUT_MS = 90 * 1000
export const CORTEX_KEY = '__cortex__'

/** Status the UI shows: idle and anything older than ~2h become "resting". */
export function effStatus(bot, now) {
  if (!bot || !bot.status || bot.status === 'idle') return 'resting'
  const age = now - (bot.ts || 0)
  // a bot that said "working" and then went quiet probably finished without telling us
  if (bot.status === 'working' && age > WORKING_DECAY_MS) return 'resting'
  if (age > DECAY_MS) return 'resting'
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
  // one consistent style everywhere: "agora", "12 min", "2 h", "2 h 5 min", "3 d", "3 d 4 h"
  if (m < 1) return 'agora'
  const s = d ? (h ? `${d} d ${h} h` : `${d} d`) : h ? (mm ? `${h} h ${mm} min` : `${h} h`) : `${mm} min`
  return neg ? `há ${s}` : s
}
