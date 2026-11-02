// Orter i hela Sverige och vilken kommun de ligger i, från Wikidata. Används bara för att säga
// "Vi finns inte i … än" när någon söker på en ort i en kommun som Sopor inte har.
// Byggs av scripts/build-data.ts från data/sverige/orter.json (scripts/build-sweden-places.ts).

import { normalize } from '../domain/search.js'

/** data/sverige/orter.json */
export interface SwedenPlacesFile {
  source: string
  updatedAt: string
  /** kommunkod → kommunnamn */
  kommuner: Record<string, string>
  /** ortnamn → kommunkoder */
  orter: Record<string, string[]>
}

/** public/data/sverige.json: som filen, men med normaliserade ortnamn och kommunnamn som orter. */
export interface PlaceLookup {
  kommuner: Record<string, string>
  orter: Record<string, string[]>
}

/** "Backa, Kamperöd och Skogen" → tre orter. Förklaringar som "(norra delen)" tas bort. */
export function placeNames(label: string): string[] {
  return label
    .replace(/\s*\([^)]*\)/g, '')
    .split(/,\s*|\s+och\s+/)
    .map((name) => name.trim())
    .filter(Boolean)
}

/** "Stockholms kommun" → stockholms och stockholm. "Region Gotland" → gotland. */
function kommunKeys(name: string): string[] {
  const base = normalize(name.replace(/ kommun$/, '').replace(/^Region /, ''), false)
  return base.endsWith('s') ? [base, base.slice(0, -1)] : [base]
}

export function buildPlaceLookup(file: SwedenPlacesFile): PlaceLookup {
  const orter: Record<string, Set<string>> = {}
  const add = (key: string, code: string) => (orter[key] ??= new Set()).add(code)
  for (const [label, codes] of Object.entries(file.orter)) {
    for (const name of placeNames(label)) for (const code of codes) add(normalize(name, false), code)
  }
  for (const [code, name] of Object.entries(file.kommuner)) for (const key of kommunKeys(name)) add(key, code)
  return {
    kommuner: file.kommuner,
    orter: Object.fromEntries(Object.entries(orter).map(([key, codes]) => [key, [...codes].sort()])),
  }
}

/**
 * Kommunkoderna för en ort, eller en tom lista om orten är okänd. En ort i flera kommuner
 * (tätorten Stockholm ligger i tolv) ger bara kommunen med samma namn, om det finns en.
 */
export function kommunerForPlace(lookup: PlaceLookup, place: string): string[] {
  const key = normalize(place, false)
  const codes = lookup.orter[key] ?? []
  const named = codes.filter((code) => kommunKeys(lookup.kommuner[code] ?? '').includes(key))
  return named.length > 0 ? named : codes
}
