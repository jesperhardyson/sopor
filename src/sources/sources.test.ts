import { describe, expect, it } from 'vitest'
import { daysBetween, isValidDate } from '../domain/dates'
import { activeMessages } from '../domain/messages'
import { ALL_SOURCES, getSource, kommunForLocality, SOURCES, sourceLabel, supportedKommuner, type Source } from './index'

const host = (u: string) => new URL(u).hostname.replace(/^www\./, '')
/** Källans egen domän eller en underdomän till den. */
const onSite = (s: Source, u: string) => host(u) === host(s.url) || host(u).endsWith(`.${host(s.url)}`)

describe('källregistret', () => {
  it('har unika och URL-säkra id', () => {
    const ids = ALL_SOURCES.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/)
  })

  it('har Avesta som synlig statisk källa med områdesval', () => {
    const avesta = ALL_SOURCES.find((s) => s.id === 'avesta')!
    expect(avesta.config).toEqual({ system: 'static' })
    expect(avesta.kommuner).toEqual([{ code: '2084', name: 'Avesta kommun' }])
    expect(avesta).toMatchObject({ selection: 'area' })
    expect(avesta.hidden).toBeUndefined()
    expect(avesta.testData).toBeUndefined()
    expect(avesta.emptyScheduleNote?.title).toBe('Schemat för nästa år är inte publicerat än')
    expect(activeMessages(avesta.messages, '2026-11-17').map((m) => m.id)).toEqual(['nya-rutter-2026'])
  })

  it('kräver en varning för varje källa med områdesval', () => {
    for (const s of ALL_SOURCES.filter((x) => x.selection === 'area')) {
      expect(s.areaNotice?.title, s.id).toBeTruthy()
      expect(s.areaNotice?.text, s.id).toBeTruthy()
    }
  })

  it('visar inte dolda källor', () => {
    expect(SOURCES.some((s) => s.hidden)).toBe(false)
    expect(getSource('avesta')).toBeDefined()
    expect(supportedKommuner().map((k) => k.name)).toContain('Avesta kommun')
  })

  it('listar kommunerna som stöds, sorterade och utan dubbletter', () => {
    const names = supportedKommuner().map((k) => k.name)
    expect(names).toEqual([...new Set(names)].sort((a, b) => a.localeCompare(b, 'sv')))
    expect(names).toContain('Uppsala kommun')
  })

  it('förklarar hur statiska källor publicerar schemat, eftersom deras schema har ett slut', () => {
    for (const s of ALL_SOURCES.filter((x) => x.config.system === 'static')) expect(s.publishing, s.id).toMatch(/\S.*\.$/)
  })

  it('har kontaktuppgifter från källans egen webbplats', () => {
    for (const s of ALL_SOURCES.filter((x) => x.contact)) {
      const c = s.contact!
      expect(c.phone ?? c.email ?? c.page, s.id).toBeDefined()
      if (c.phone) {
        expect(c.phone.number, s.id).toMatch(/^\+46[1-9]\d{6,9}$/)
        expect(c.phone.display.replace(/\D/g, '').replace(/^0/, '46'), s.id).toBe(c.phone.number.slice(1))
      }
      if (c.email) expect(c.email, s.id).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/)
      for (const u of [c.page, c.checked.url].filter((x) => x !== undefined)) {
        expect(u, s.id).toMatch(/^https:\/\//)
        expect(onSite(s, u), `${s.id}: ${u}`).toBe(true)
      }
      expect(c.checked.date, s.id).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('har giltiga meddelanden', () => {
    for (const s of ALL_SOURCES.filter((x) => x.messages)) {
      const ids = s.messages!.map((m) => m.id)
      expect(new Set(ids).size, s.id).toBe(ids.length)
      for (const m of s.messages!) {
        const name = `${s.id}/${m.id}`
        expect(m.id, name).toMatch(/^[a-z0-9-]+$/)
        expect(isValidDate(m.validFrom) && isValidDate(m.validTo), name).toBe(true)
        expect(m.validFrom <= m.validTo, name).toBe(true)
        expect(daysBetween(m.validFrom, m.validTo), name).toBeLessThanOrEqual(183)
        expect(m.title.length, name).toBeLessThanOrEqual(60)
        expect(m.text.length, name).toBeLessThanOrEqual(400)
        for (const t of [m.title, m.text]) expect(t, name).toMatch(/^[^<>*`[]+$/)
        if (m.url !== undefined) {
          expect(m.url, name).toMatch(/^https:\/\//)
          expect(onSite(s, m.url), `${name}: ${m.url}`).toBe(true)
        }
      }
    }
  })

  it('namnger en källa efter kommunerna, inte efter bolaget', () => {
    expect(sourceLabel(getSource('uppsala')!)).toBe('Uppsala kommun')
    expect(sourceLabel(getSource('herrljunga-vargarda')!)).toBe('Herrljunga kommun och Vårgårda kommun')
  })
})

describe('kommunForLocality', () => {
  const sydost: Source = {
    id: 'sydost',
    name: 'Sydost AB',
    url: 'https://x',
    kommuner: [{ code: '0880', name: 'Kalmar kommun' }, { code: '0840', name: 'Mörbylånga kommun' }],
    config: { system: 'edp', baseUrl: 'https://x' },
  }
  const places = { kalmar: 'Kalmar kommun', 'kalmar smedby': 'Kalmar kommun', färjestaden: 'Mörbylånga kommun' }

  it('slår upp orten oavsett skiftläge och skiljetecken', () => {
    expect(kommunForLocality(sydost, 'KALMAR', places)).toBe('Kalmar kommun')
    expect(kommunForLocality(sydost, 'Kalmar-Smedby', places)).toBe('Kalmar kommun')
    expect(kommunForLocality(sydost, 'Färjestaden', places)).toBe('Mörbylånga kommun')
  })

  it('visar orten, inte källans namn, när orten saknas i tabellen', () => {
    expect(kommunForLocality(sydost, 'Vetlanda', places)).toBe('Vetlanda')
    expect(kommunForLocality(sydost, 'Vetlanda')).toBe('Vetlanda')
  })

  it('ger kommunen direkt för källor med en kommun', () => {
    expect(kommunForLocality({ ...sydost, kommuner: [sydost.kommuner[0]] }, 'Var som helst')).toBe('Kalmar kommun')
  })

  it('slår upp orten när källan har en kommun men även grannkommuner', () => {
    const source = { ...sydost, kommuner: [sydost.kommuner[0]], grannkommuner: [{ code: '0685', name: 'Vetlanda kommun' }] }
    expect(kommunForLocality(source, 'Korsberga', { korsberga: 'Vetlanda kommun' })).toBe('Vetlanda kommun')
  })
})

describe('Kretslopp Sydost och SSAM', () => {
  const codes = (id: string) => getSource(id)!.kommuner.map((k) => k.code).sort()

  // Medlemskommunerna enligt kretsloppsydost.se, kontrollerade mot söktjänsten 2026-11-17.
  it('täcker Kretslopp Sydosts åtta medlemskommuner och inga andra', () => {
    expect(codes('kretslopp-sydost')).toEqual(['0684', '0685', '0760', '0834', '0840', '0880', '0881', '0882'])
    expect(getSource('kretslopp-sydost')!.grannkommuner ?? []).toEqual([])
  })

  it('räknar inte Uppvidinge till SSAM, som saknar kommunens adresser', () => {
    expect(codes('ssam')).not.toContain('0760')
  })
})
