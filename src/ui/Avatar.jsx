import { isDark, resolveColor } from '../lib/constants'

const poly = (n, r, rot = -Math.PI / 2, inner = null) => {
  const pts = []
  const total = inner ? n * 2 : n
  for (let i = 0; i < total; i++) {
    const a = rot + (i / total) * Math.PI * 2
    const rr = inner && i % 2 ? inner : r
    pts.push(`${(16 + Math.cos(a) * rr).toFixed(2)},${(17 + Math.sin(a) * rr).toFixed(2)}`)
  }
  return <polygon points={pts.join(' ')} strokeLinejoin="round" strokeWidth="2.5" />
}

function Body({ shape }) {
  switch (shape) {
    case 'blob':
      return <circle cx="16" cy="16.5" r="11" />
    case 'egg':
      return <path d="M16 5c5.5 0 9.5 7 9.5 12.5S21.5 27 16 27s-9.5-4-9.5-9.5S10.5 5 16 5z" />
    case 'bean':
      return <path d="M6 16c0-5 5-7 9-5 3 1.5 5-1 8-1 3 0 4 3 4 6 0 6-5 9-11 9-6 0-10-3-10-9z" />
    case 'squircle':
    case 'square':
      return <rect x="6" y="6.5" width="20" height="20" rx="7" transform="rotate(-12 16 16.5)" />
    case 'tablet':
      return <rect x="9" y="4.5" width="14" height="24" rx="5" />
    case 'capsule':
      return <rect x="4" y="10" width="24" height="14" rx="7" />
    case 'cylinder':
      return <rect x="8" y="5" width="16" height="23" rx="4" />
    case 'hex':
      return poly(6, 11.5)
    case 'gem':
      return <path d="M10 8h12l5 6-11 14L5 14z" strokeLinejoin="round" strokeWidth="2.5" />
    case 'crystal':
      return <path d="M16 3l7 7v13l-7 7-7-7V10z" strokeLinejoin="round" strokeWidth="2.5" />
    case 'shield':
      return <path d="M7 6h18v9c0 6-5 10-9 12-4-2-9-6-9-12z" strokeLinejoin="round" strokeWidth="2" />
    case 'dome':
      return <path d="M4 24a12 12 0 0 1 24 0z" strokeLinejoin="round" strokeWidth="2" />
    case 'arch':
      return <path d="M9 28V15a7 7 0 0 1 14 0v13z" strokeLinejoin="round" strokeWidth="2" />
    case 'teardrop':
      return <path d="M16 4.5c4 5.5 9 10 9 14.6a9 9 0 0 1-18 0C7 14.5 12 10 16 4.5z" />
    case 'leaf':
      return <path d="M6 26C6 13 13 6 26 6c0 13-7 20-20 20z" />
    case 'sparkle':
      return poly(4, 12, -Math.PI / 2, 5.6)
    case 'house':
      return <path d="M6 15l10-9 10 9v11H6z" strokeLinejoin="round" strokeWidth="2.5" />
    case 'star':
      return poly(5, 12, -Math.PI / 2, 5.8)
    case 'cloud':
      return <path d="M9.5 25a6 6 0 0 1-.9-11.9A8 8 0 0 1 23.6 11a6.9 6.9 0 0 1-.4 14z" />
    case 'wedge':
      return <path d="M16 5.5c1 0 1.7.6 2.2 1.5l8.3 15.2c.9 1.7-.1 3.3-2 3.6-5.6.9-11.4.9-17 0-1.9-.3-2.9-1.9-2-3.6L13.8 7c.5-.9 1.2-1.5 2.2-1.5z" />
    case 'circle':
    case 'photo':
      return <circle cx="16" cy="16.5" r="11" />
    case 'pebble':
      return <circle cx="16" cy="16.5" r="11" />
    case 'heart':
      return <path d="M16 27C5.5 19.6 4 13.6 6.8 10c2.8-3.5 7.2-2.7 9.2.9 2-3.6 6.4-4.4 9.2-.9 2.8 3.6 1.3 9.6-9.2 17z" />
    case 'star4':
      return poly(4, 12, -Math.PI / 2, 5.6)
    case 'star6':
      return poly(6, 11.5, -Math.PI / 2, 7.2)
    case 'triangle':
    case 'cone':
      return poly(3, 12, -Math.PI / 2)
    case 'pentagon':
      return poly(5, 11.5)
    case 'hexagon':
      return poly(6, 11.5)
    case 'pill':
      return <rect x="9" y="5" width="14" height="23" rx="7" />
    case 'rounded_square':
      return <rect x="6" y="6" width="20" height="21" rx="6" />
    case 'drop':
      return <path d="M16 4.5c4 5.5 9 10 9 14.6a9 9 0 0 1-18 0C7 14.5 12 10 16 4.5z" />
    case 'bubble':
      return <path d="M16 5a10.5 10.5 0 1 1-6.4 18.8L5 26l1.7-5A10.5 10.5 0 0 1 16 5z" />
    case 'clover':
    case 'flower':
    case 'trio': {
      const c = shape === 'trio' ? [[11, 21], [21, 21], [16, 12]] : shape === 'flower' ? [0, 1, 2, 3, 4, 5].map((i) => [16 + Math.cos((i * Math.PI) / 3) * 6.5, 17 + Math.sin((i * Math.PI) / 3) * 6.5]) : [[16, 10.5], [10, 16.5], [22, 16.5], [16, 22.5]]
      const r = shape === 'flower' ? 4.6 : 6
      return (
        <g>
          {c.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={r} />
          ))}
          <circle cx="16" cy="17" r={shape === 'trio' ? 0 : 5} />
        </g>
      )
    }
    default:
      return <circle cx="16" cy="16.5" r="10.5" />
  }
}

export default function Avatar({ bot, size = 28, ring }) {
  const color = resolveColor(bot?.color)
  const eye = isDark(color) ? '#fff' : '#141414'
  const ey = bot?.shape === 'wedge' ? 19 : bot?.shape === 'heart' ? 15.5 : 16.5
  if (bot?.photo)
    return (
      <span className="avatar av-photo" style={{ width: size, height: size, '--ring': ring || 'transparent', background: color + '33' }}>
        <span className="av-ini" style={{ fontSize: size * 0.45, color }}>{(bot.name || '?').trim()[0]?.toUpperCase()}</span>
        <img src={bot.photo} alt="" onLoad={(e) => (e.currentTarget.style.opacity = 1)} />
      </span>
    )
  return (
    <span className="avatar" style={{ width: size, height: size, '--ring': ring || 'transparent', background: color + '1f' }}>
      <svg viewBox="0 0 32 32" width={size - 4} height={size - 4}>
        <g fill={color} stroke={color}>
          <Body shape={bot?.shape} />
        </g>
        <ellipse cx="15" cy={ey - 1} rx="1.05" ry="2.1" fill={eye} transform={`rotate(-24 15 ${ey - 1})`} />
        <ellipse cx="19.6" cy={ey - 1} rx="1.05" ry="2.1" fill={eye} transform={`rotate(-24 19.6 ${ey - 1})`} />
      </svg>
    </span>
  )
}
