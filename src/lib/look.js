// Office look (personalisation): style preset, floor & wall finish, and what decor is shown.
// Shared through the topic ({"office":{"look":{...}}}) so every screen looks the same.
import { createStore } from './createStore'

export const STYLES = {
  decorado: { label: 'Decorado', sub: 'Plantas, tapetes, quadros e cantinhos', floor: 'light', wall: 'white', plants: true, art: true, rugs: true, furniture: true, accent: true },
  aconchegante: { label: 'Aconchegante', sub: 'Madeira, tons quentes e muitas plantas', floor: 'wood', wall: 'sand', plants: true, art: true, rugs: true, furniture: true, accent: true },
  minimalista: { label: 'Minimalista', sub: 'Só mesas, bots e o essencial', floor: 'concrete', wall: 'white', plants: false, art: false, rugs: false, furniture: false, accent: false },
}
// 'light' = each room its own wood (the default)
export const FLOORS = { light: ['Cada sala uma madeira', '#d9b68f'], honey: ['Mel', '#e2c9a6'], wood: ['Carvalho', '#c9a27c'], walnut: ['Nogueira', '#9a6d4c'], concrete: ['Concreto', '#c3c6cb'], dark: ['Grafite', '#4a4e57'] }
// 'white' = each room its own colour (the default)
export const WALLS = { white: ['Cada sala uma cor', '#f3eee6'], snow: ['Branco', '#f6f6f8'], sand: ['Areia', '#efe5d6'], grey: ['Cinza', '#d7dbe1'], sage: ['Sálvia', '#d5e0d0'], sky: ['Azul', '#dbe6ef'], blush: ['Rosé', '#f0dfe3'] }
// choices (not on/off): desk finish, how many pets, how strong the lamps are at night
export const DESKS = { room: 'Cada sala uma', light: 'Clara', oak: 'Carvalho', dark: 'Escura' }
export const PETS = { none: 'Nenhum', few: 'Poucos', many: 'Muitos' }
export const LAMPS = { soft: 'Suave', normal: 'Normal', strong: 'Forte' }
export const DECOR = { min: 'Mínima', some: 'Média', full: 'Completa' }
export const ACCENTS = { roxo: ['Roxo', '#8F59F9'], azul: ['Azul', '#1E86FC'], verde: ['Verde', '#18A957'], laranja: ['Laranja', '#F26B1D'], rosa: ['Rosa', '#E83E8C'], grafite: ['Grafite', '#4B5563'] }
const BOOLS = ['plants', 'art', 'rugs', 'furniture', 'accent', 'pet', 'seasonal']

export const DEFAULT_LOOK = { style: 'decorado', ...STYLES.decorado, pet: true, seasonal: true, accentColor: 'roxo', desk: 'room', pets: 'few', lamps: 'normal' }
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
  if (DESKS[l.desk]) out.desk = l.desk
  if (PETS[l.pets]) out.pets = l.pets
  if (LAMPS[l.lamps]) out.lamps = l.lamps
  return out
}

export const lookStore = createStore({ ...DEFAULT_LOOK })
