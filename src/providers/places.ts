/** Ort → kommun per källa (public/data/orter.json från gatuindexet), laddas en gång. */
let placesPromise: Promise<Record<string, Record<string, string>>> | undefined

export function loadPlaces(fetchFn: typeof fetch = fetch): Promise<Record<string, Record<string, string>>> {
  placesPromise ??= fetchFn('/data/orter.json')
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
  return placesPromise
}
