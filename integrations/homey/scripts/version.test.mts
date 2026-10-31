import { describe, expect, it } from 'vitest'
import { bumpProblem, versionProblems } from './version.mjs'

const ok = { compose: '0.4.1', app: '0.4.1', pkg: '0.4.1', changelog: { '0.4.1': { en: 'Text', sv: 'Text' } } }

describe('versionerna', () => {
  it('godtar samma version överallt med ändringslogg på båda språken', () => {
    expect(versionProblems(ok)).toEqual([])
  })

  it('säger vilken fil som avviker', () => {
    expect(versionProblems({ ...ok, pkg: '0.4.0' })).toEqual(['package.json har 0.4.0, .homeycompose/app.json har 0.4.1'])
  })

  it('kräver ändringslogg på engelska och svenska', () => {
    expect(versionProblems({ ...ok, changelog: { '0.4.1': { en: 'Text' } } })).toEqual(['.homeychangelog.json saknar sv för 0.4.1'])
    expect(versionProblems({ ...ok, changelog: {} })).toEqual(['.homeychangelog.json saknar en för 0.4.1', '.homeychangelog.json saknar sv för 0.4.1'])
  })

  it('kräver att taggen stämmer med versionen', () => {
    expect(versionProblems({ ...ok, tag: 'homey-v0.4.1' })).toEqual([])
    expect(versionProblems({ ...ok, tag: 'homey-v0.4.2' })).toEqual(['taggen homey-v0.4.2 stämmer inte med versionen 0.4.1'])
  })
})

describe('ny version', () => {
  it('måste vara x.y.z och högre än nuvarande', () => {
    expect(bumpProblem('0.4.1', '0.4.2')).toBeNull()
    expect(bumpProblem('0.4.1', '0.5.0')).toBeNull()
    expect(bumpProblem('0.4.1', '0.4.1')).toBe('0.4.1 är inte högre än 0.4.1')
    expect(bumpProblem('0.4.1', '0.3.9')).toBe('0.3.9 är inte högre än 0.4.1')
    expect(bumpProblem('0.4.1', '0.4.10')).toBeNull()
    expect(bumpProblem('0.4.1', '1.0')).toBe('1.0 är inte en version på formen x.y.z')
  })
})
