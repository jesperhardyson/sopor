import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const html = readFileSync(path.join(root, 'index.html'), 'utf8')
const manifest = JSON.parse(readFileSync(path.join(root, 'public/manifest.webmanifest'), 'utf8')) as Record<string, unknown>

describe('appen på hemskärmen', () => {
  it('fyller hela skärmen, så att innehållet kan lägga sig runt notch och hemindikator', () => {
    expect(html).toMatch(/<meta name="viewport" content="[^"]*viewport-fit=cover/)
  })

  it('har ett fast id i manifestet, så att installationen överlever en ändrad start_url', () => {
    expect(manifest.id).toBe('/')
    expect(manifest.display).toBe('standalone')
  })
})
