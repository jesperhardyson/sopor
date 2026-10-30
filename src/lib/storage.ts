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
  return store(loadSaved().filter((a) => !same(a, sourceId, addressId)))
}

export function renameSaved(sourceId: string, addressId: string, name: string): SavedAddress[] {
  return store(loadSaved().map((a) => (same(a, sourceId, addressId) ? { ...a, name } : a)))
}

export function findSaved(sourceId: string, addressId: string): SavedAddress | undefined {
  return loadSaved().find((a) => same(a, sourceId, addressId))
}

export function clearSaved(): SavedAddress[] {
  return store([])
}
