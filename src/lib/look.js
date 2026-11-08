// Office look (personalisation): style preset, floor & wall finish, and what decor is shown.
// Shared through the topic ({"office":{"look":{...}}}) so every screen looks the same.
import { createStore } from './createStore'

export const STYLES = {
  decorado: { label: 'Decorado', sub: 'Plantas, tapetes, quadros e cantinhos', floor: 'light', wall: 'white', plants: true, art: true, rugs: true, furniture: true, accent: true },
  aconchegante: { label: 'Aconchegante', sub: 'Madeira, tons quentes e muitas plantas', floor: 'wood', wall: 'sand', plants: true, art: true, rugs: true, furniture: true, accent: true },
  minimalista: { label: 'Minimalista', sub: 'Só mesas, bots e o essencial', floor: 'concrete', wall: 'white', plants: false, art: false, rugs: false, furniture: false, accent: false },
}
export const FLOORS = { light: ['Claro', '#eceef1'], wood: ['Madeira', '#c9a27c'], concrete: ['Concreto', '#c3c6cb'], dark: ['Grafite', '#4a4e57'] }
export const WALLS = { white: ['Branco', '#f3f3f5'], sand: ['Areia', '#efe5d6'], grey: ['Cinza', '#d7dbe1'], sage: ['Sálvia', '#d5e0d0'] }
export const ACCENTS = { roxo: ['Roxo', '#8F59F9'], azul: ['Azul', '#1E86FC'], verde: ['Verde', '#18A957'], laranja: ['Laranja', '#F26B1D'], rosa: ['Rosa', '#E83E8C'], grafite: ['Grafite', '#4B5563'] }
const BOOLS = ['plants', 'art', 'rugs', 'furniture', 'accent', 'pet', 'seasonal']

export const DEFAULT_LOOK = { style: 'decorado', ...STYLES.decorado, pet: true, seasonal: true, accentColor: 'roxo' }
delete DEFAULT_LOOK.label
delete DEFAULT_LOOK.sub

/** Keep only known keys/values (the look arrives from the topic). */
export function cleanLook(l) {
  if (!l || typeof l !== 'object') return null
  const out = {}
  if (STYLES[l.style]) out.style = l.style
  if (FLOORS[l.floor]) out.floor = l.floor
  if (WALLS[l.wall]) out.wall = l.wall
  if (ACCENTS[l.accentColor]) out.accentColor = l.accentColor
  for (const k of BOOLS) if (typeof l[k] === 'boolean') out[k] = l[k]
  return out
}

export const lookStore = createStore({ ...DEFAULT_LOOK })
