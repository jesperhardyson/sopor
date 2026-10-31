// Regel 8 i AGENTS.md: integrationen pratar bara med det publika API:t och importerar aldrig sajtens kod.

import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const SKIP = new Set(['node_modules', '.homeybuild'])

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : sources(full)
    return /\.(m?ts|m?js)$/.test(entry.name) ? [full] : []
  })
}

describe('gränsen mot sajten', () => {
  it('importerar inget utanför integrations/homey', () => {
    const outside = sources(root).flatMap((file) =>
      [...readFileSync(file, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)]
        .map((m) => m[1])
        .filter((spec) => spec.startsWith('@/') || (spec.startsWith('.') && !path.resolve(path.dirname(file), spec).startsWith(root + path.sep)))
        .map((spec) => `${path.relative(root, file)}: ${spec}`),
    )
    expect(outside).toEqual([])
  })
})
