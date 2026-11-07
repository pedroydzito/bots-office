// Small inline SVG icons (no emoji anywhere in the UI).
const S = ({ size = 14, children, fill = 'none', ...p }) => (
  <svg className="ico" viewBox="0 0 24 24" width={size} height={size} fill={fill} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...p}>
    {children}
  </svg>
)
export const Sun = (p) => <S {...p}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></S>
export const Moon = (p) => <S {...p}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></S>
export const Play = (p) => <S fill="currentColor" stroke="none" {...p}><path d="M7 5l12 7-12 7z" /></S>
export const Pause = (p) => <S fill="currentColor" stroke="none" {...p}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></S>
export const Brain = (p) => <S {...p}><path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a2 2 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1" /></S>
export const Chat = (p) => <S {...p}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></S>
export const Doc = (p) => <S {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></S>
export const Arrow = (p) => <S {...p}><path d="M5 12h14M13 6l6 6-6 6" /></S>
export const Check = (p) => <S strokeWidth="3" {...p}><path d="M5 12.5l4.2 4.2L19 7" /></S>
export const Close = (p) => <S strokeWidth="2.6" {...p}><path d="M6 6l12 12M18 6L6 18" /></S>
export const Plus = (p) => <S {...p}><path d="M12 5v14M5 12h14" /></S>
export const Minus = (p) => <S {...p}><path d="M5 12h14" /></S>
export const Up = (p) => <S {...p}><path d="M12 19V5M6 11l6-6 6 6" /></S>
export const Down = (p) => <S {...p}><path d="M12 5v14M6 13l6 6 6-6" /></S>
export const Gear = (p) => <S {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></S>
export const Bell = (p) => <S {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></S>
export const Speaker = (p) => <S {...p}><path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></S>
export const Tv = (p) => <S {...p}><rect x="2" y="5" width="20" height="13" rx="2" /><path d="M8 21h8" /></S>
export const Auto = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 3v18" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></S>
export const Layers = (p) => <S {...p}><path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5" /></S>
export const Clock = (p) => <S {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></S>
export const Party = (p) => <S {...p}><path d="M4 20l5-14 9 9z" /><path d="M14 4l1 2M19 9l2-1M17 3l-1 3M20 13l-2 .5" /></S>
