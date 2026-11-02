import type { PlaceLookup } from '@/data/sweden-places'

/** Ort → kommun per källa (public/data/orter.json från gatuindexet), laddas en gång. */
let placesPromise: Promise<Record<string, Record<string, string>>> | undefined

export function loadPlaces(fetchFn: typeof fetch = fetch): Promise<Record<string, Record<string, string>>> {
  placesPromise ??= fetchFn('/data/orter.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return placesPromise
}

/** Orter i hela Sverige → kommunkoder (public/data/sverige.json), laddas en gång och bara vid behov. */
let swedenPromise: Promise<PlaceLookup | null> | undefined

export function loadSwedenPlaces(fetchFn: typeof fetch = fetch): Promise<PlaceLookup | null> {
  swedenPromise ??= fetchFn('/data/sverige.json')
    .then((r) => (r.ok ? (r.json() as Promise<PlaceLookup>) : null))
    .catch(() => null)
  return swedenPromise
}
