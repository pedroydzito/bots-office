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
    case 'cloud':
      return <path d="M9.5 25a6 6 0 0 1-.9-11.9A8 8 0 0 1 23.6 11a6.9 6.9 0 0 1-.4 14z" />
    case 'wedge':
      return <path d="M16 5.5c1 0 1.7.6 2.2 1.5l8.3 15.2c.9 1.7-.1 3.3-2 3.6-5.6.9-11.4.9-17 0-1.9-.3-2.9-1.9-2-3.6L13.8 7c.5-.9 1.2-1.5 2.2-1.5z" />
    case 'pebble':
      return <ellipse cx="16" cy="16.5" rx="10" ry="11" />
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
  return (
    <span className="avatar" style={{ width: size, height: size, '--ring': ring || 'transparent', background: color + '1f' }}>
      <svg viewBox="0 0 32 32" width={size - 4} height={size - 4}>
        <g fill={color} stroke={color}>
          <Body shape={bot?.shape} />
        </g>
        <ellipse cx="13.2" cy={ey} rx="1.25" ry="1.7" fill={eye} />
        <ellipse cx="18.8" cy={ey} rx="1.25" ry="1.7" fill={eye} />
      </svg>
    </span>
  )
}
