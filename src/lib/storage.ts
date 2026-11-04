import { normalize } from '@/domain/search'
import type { Address, Schedule } from '@/domain/types'

export interface SavedAddress {
  sourceId: string
  addressId: string
  name: string
  street: string
  locality: string
  savedAt: string
}

const KEY = 'sopor.saved.v1'

// Om skrivningen misslyckas (privat läge, full lagring) gäller listan i minnet så länge
// lagringen ser ut som när skrivningen misslyckades.
let pending: { raw: string | null; list: SavedAddress[] } | null = null

function readRaw(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function isSaved(value: unknown): value is SavedAddress {
  const v = value as SavedAddress
  return (
    typeof v === 'object' &&
    v !== null &&
    ['sourceId', 'addressId', 'name', 'street', 'locality'].every(
      (k) => typeof v[k as keyof SavedAddress] === 'string',
    )
  )
}

/** Adresser sparade före källregistret hade fältet municipalityId i stället för sourceId. */
function migrate(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || 'sourceId' in value || !('municipalityId' in value)) return value
  const { municipalityId, ...rest } = value as Record<string, unknown>
  return { sourceId: municipalityId, ...rest }
}

/** Läser sparade adresser. Trasig eller otillgänglig lagring ger en tom lista. */
export function loadSaved(): SavedAddress[] {
  const raw = readRaw()
  if (pending && pending.raw === raw) return pending.list
  pending = null
  try {
    const parsed: unknown = JSON.parse(raw ?? '[]')
    return Array.isArray(parsed) ? parsed.map(migrate).filter(isSaved) : []
  } catch {
    return []
  }
}

function store(list: SavedAddress[]): SavedAddress[] {
  const before = readRaw()
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
    pending = null
  } catch {
    pending = { raw: before, list }
  }
  return list
}

const same = (a: SavedAddress, sourceId: string, addressId: string) =>
  a.sourceId === sourceId && a.addressId === addressId

export function upsertSaved(address: SavedAddress): SavedAddress[] {
  const list = loadSaved()
  const i = list.findIndex((a) => same(a, address.sourceId, address.addressId))
  return store(i === -1 ? [...list, address] : list.map((a, j) => (j === i ? address : a)))
}

export function removeSaved(sourceId: string, addressId: string): SavedAddress[] {
  forgetSchedules((key) => key === scheduleKey(sourceId, addressId))
  return store(loadSaved().filter((a) => !same(a, sourceId, addressId)))
}

export function renameSaved(sourceId: string, addressId: string, name: string): SavedAddress[] {
  return store(loadSaved().map((a) => (same(a, sourceId, addressId) ? { ...a, name } : a)))
}

export function findSaved(sourceId: string, addressId: string): SavedAddress | undefined {
  return loadSaved().find((a) => same(a, sourceId, addressId))
}

/**
 * Byter ett sparat område mot ett annat på samma plats i listan. Ett eget namn följer med.
 * Ett område som inte var sparat förblir osparat.
 */
export function replaceSaved(sourceId: string, oldId: string, address: { id: string; street: string }): SavedAddress[] {
  const old = findSaved(sourceId, oldId)
  if (!old || oldId === address.id) return loadSaved()
  forgetSchedules((key) => key === scheduleKey(sourceId, oldId))
  const name = old.name === old.street ? address.street : old.name
  const list = loadSaved().filter((a) => !same(a, sourceId, address.id))
  return store(list.map((a) => (same(a, sourceId, oldId) ? { ...a, addressId: address.id, street: address.street, locality: '', name } : a)))
}

export function clearSaved(): SavedAddress[] {
  forgetSchedules(() => true)
  writeChoices({})
  return store([])
}

/** Senast hämtade schemat för en sparad adress, som visas när källan inte svarar. */
export interface StoredSchedule {
  address: Address
  schedule: Schedule
  /** När schemat hämtades, YYYY-MM-DD */
  fetchedAt: string
}

const SCHEDULES_KEY = 'sopor.schedules.v1'
const scheduleKey = (sourceId: string, addressId: string) => `${sourceId}/${addressId}`

function readSchedules(): Record<string, StoredSchedule> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SCHEDULES_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, StoredSchedule>) : {}
  } catch {
    return {}
  }
}

function writeSchedules(all: Record<string, StoredSchedule>) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(SCHEDULES_KEY)
    else localStorage.setItem(SCHEDULES_KEY, JSON.stringify(all))
  } catch {
    // Utan lagring visas felet som vanligt när källan inte svarar.
  }
}

function forgetSchedules(match: (key: string) => boolean) {
  const all = readSchedules()
  writeSchedules(Object.fromEntries(Object.entries(all).filter(([key]) => !match(key))))
}

const isStored = (v: StoredSchedule | undefined): v is StoredSchedule =>
  typeof v?.address?.street === 'string' && Array.isArray(v?.schedule?.events) && typeof v?.fetchedAt === 'string'

/** Sparar schemat, men bara för sparade adresser: det ska inte samlas scheman för allt man tittat på. */
export function storeSchedule(entry: StoredSchedule) {
  const { sourceId, id } = entry.address
  if (!findSaved(sourceId, id)) return
  writeSchedules({ ...readSchedules(), [scheduleKey(sourceId, id)]: entry })
}

export function loadStoredSchedule(sourceId: string, addressId: string): StoredSchedule | undefined {
  const entry = readSchedules()[scheduleKey(sourceId, addressId)]
  return isStored(entry) ? entry : undefined
}

/**
 * Området användaren själv valt för en gata. Valet stannar i den här webbläsaren: det skickas aldrig
 * till servern och säger inget om vilket område gatan egentligen hör till.
 */
export interface AreaChoice {
  sourceId: string
  street: string
  areaId: string
  label: string
  day: string
}

const CHOICES_KEY = 'sopor.areaChoices.v1'
const choiceKey = (sourceId: string, street: string) => `${sourceId}/${normalize(street, false)}`

function readChoices(): Record<string, AreaChoice> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CHOICES_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, AreaChoice>) : {}
  } catch {
    return {}
  }
}

function writeChoices(all: Record<string, AreaChoice>) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(CHOICES_KEY)
    else localStorage.setItem(CHOICES_KEY, JSON.stringify(all))
  } catch {
    // Utan lagring får användaren välja område igen nästa gång.
  }
}

export function loadChoice(sourceId: string, street: string): AreaChoice | undefined {
  const choice = readChoices()[choiceKey(sourceId, street)]
  return typeof choice?.areaId === 'string' && typeof choice.label === 'string' && typeof choice.day === 'string' ? choice : undefined
}

export function rememberChoice(choice: AreaChoice) {
  writeChoices({ ...readChoices(), [choiceKey(choice.sourceId, choice.street)]: choice })
}

export function forgetChoice(sourceId: string, street: string) {
  const { [choiceKey(sourceId, street)]: _forgotten, ...rest } = readChoices()
  writeChoices(rest)
}

/** Användaren har bytt område, så gator som pekade på det gamla området följer med till det nya. */
export function moveChoices(sourceId: string, fromAreaId: string, area: { id: string; label: string; day: string }) {
  const moved = Object.entries(readChoices()).map(([key, c]) =>
    [key, c.sourceId === sourceId && c.areaId === fromAreaId ? { ...c, areaId: area.id, label: area.label, day: area.day } : c] as const,
  )
  writeChoices(Object.fromEntries(moved))
}
