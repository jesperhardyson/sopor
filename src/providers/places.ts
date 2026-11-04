import type { KommunPage } from '@/data/kommun-pages'
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

/** Kommunsidornas data (public/data/kommuner.json). Ett misslyckande sparas inte, så att "Försök igen" hämtar på nytt. */
let kommunerPromise: Promise<KommunPage[] | null> | undefined

export function loadKommunPages(fetchFn: typeof fetch = fetch): Promise<KommunPage[] | null> {
  kommunerPromise ??= fetchFn('/data/kommuner.json')
    .then((r) => (r.ok ? (r.json() as Promise<KommunPage[]>) : null))
    .catch(() => null)
    .then((pages) => {
      if (!pages) kommunerPromise = undefined
      return pages
    })
  return kommunerPromise
}
