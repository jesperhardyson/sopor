// Dokumentationssidan för API:t (/api/v1/docs) är en statisk fil som laddar Scalar från jsDelivr.

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const html = readFileSync(path.resolve(import.meta.dirname, '../../public/api/v1/docs/index.html'), 'utf8')

describe('API-dokumentationen', () => {
  it('läser openapi.json från sajten', () => {
    expect(html).toContain("url: '/api/v1/openapi.json'")
  })

  it('laddar Scalar i en låst version med integritetskontroll', () => {
    const script = html.match(/<script[^>]*src="([^"]+)"[^>]*>/)
    expect(script?.[1]).toMatch(/^https:\/\/cdn\.jsdelivr\.net\/npm\/@scalar\/api-reference@\d+\.\d+\.\d+\//)
    expect(script?.[0]).toMatch(/integrity="sha384-[A-Za-z0-9+/=]+"/)
    expect(script?.[0]).toContain('crossorigin="anonymous"')
  })

  it('skickar ingenting till Scalar: ingen statistik, ingen AI-chatt, ingen proxy och inga typsnitt utifrån', () => {
    expect(html).toContain('telemetry: false')
    expect(html).toContain('agent: { disabled: true }')
    expect(html).toContain('withDefaultFonts: false')
    expect(html).not.toContain('proxyUrl')
  })
})
