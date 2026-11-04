import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pair = (locale: string) => JSON.parse(readFileSync(new URL(`../locales/${locale}.json`, import.meta.url), 'utf8')).pair

// Kommunerna där man söker på område, eftersom API:t bara ger områden som träffar där
describe.each(['sv', 'en'])('hjälptexten vid tom sökning (%s)', (locale) => {
  it.each(['notFound', 'notFoundCovered'])('%s nämner kommunerna med områdesval', (key) => {
    const text = pair(locale)[key]
    for (const expected of ['Avesta', 'Säter', 'Bispberg']) expect(text).toContain(expected)
  })
})
