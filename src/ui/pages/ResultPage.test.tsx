import '@/test/show-hidden-sources'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Link, MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Address, Area, Schedule } from '@/domain/types'
import { loadStoredSchedule, storeSchedule, upsertSaved } from '@/lib/storage'
import type { WasteProvider } from '@/providers/types'
import { ResultPage, ResultRoute } from './ResultPage'

const villa: Address = { id: 'krylbo-storgatan-12b', street: 'Storgatan 12 B', locality: 'Krylbo', sourceId: 'uppsala', kommun: 'Avesta kommun' }
const schedule: Schedule = {
  bins: [{ fraction: 'rest', sizeLiters: 190, frequencyText: 'Var 6:e vecka · onsdagar' }, { fraction: 'mat' }],
  note: 'Påminnelse: ställ ut kärlen senast 06.00 på tömningsdagen.',
  updatedAt: '2026-10-29',
  events: [
    { date: '2026-10-28', fractions: ['plast', 'mat'] },
    { date: '2026-11-11', fractions: ['rest', 'mat'] },
    { date: '2026-11-25', fractions: ['papper', 'mat'] },
    { date: '2026-12-09', fractions: ['plast', 'mat'] },
    { date: '2026-12-23', fractions: ['rest', 'mat'] },
    { date: '2027-01-07', fractions: ['papper', 'mat'], deviation: { originalDate: '2027-01-06', reason: 'trettondedag jul' } },
  ],
}

let fake: WasteProvider
let resolveSchedule: (() => void) | undefined

vi.mock('@/providers/registry', () => ({
  providerFor: () => fake,
  getAddress: (_m: string, id: string) => fake.getAddress(id),
  searchAll: async () => ({ addresses: [], failed: [] }),
  warmUpSearch: () => {},
  prefetchAddress: () => {},
  suggestAll: async () => [],
  missingKommuner: async () => [],
}))

function makeProvider(over: Partial<WasteProvider> = {}): WasteProvider {
  return {
    searchAddresses: async () => [],
    suggestAddresses: async () => [],
    getAddress: async (id) => (id === villa.id ? villa : null),
    getSchedule: (id) =>
      new Promise((resolve) => {
        resolveSchedule = () => resolve(id === villa.id ? schedule : null)
      }),
    dataUpdatedAt: async () => '2026-10-29',
    icsUrl: (id) => `/ics/avesta/${id}.ics`,
    ...over,
  }
}

function renderAt(path: string, today = '2026-10-30') {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path=":sourceId/:addressId" element={<ResultPage today={today} />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('ResultPage', () => {
  beforeEach(() => {
    fake = makeProvider()
    resolveSchedule = undefined
  })

  it('har adressen i sidans titel', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    await vi.waitFor(() => expect(document.title).toBe('Storgatan 12 B, Krylbo – Sopor'))
  })

  it('har en dela-knapp bredvid spara-knappen', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    expect(await screen.findByRole('button', { name: 'Dela' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara' })).toBeInTheDocument()
  })

  it('visar särskiljaren under adressen', async () => {
    fake = makeProvider({ getAddress: async () => ({ ...villa, detail: 'Byggnad 81674' }) })
    renderAt('/uppsala/krylbo-storgatan-12b')
    expect(await screen.findByText('Byggnad 81674')).toBeInTheDocument()
  })

  it('visar laddning och sedan nästa tömning, lista och avvikelse', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    expect(await screen.findByText('Hämtar schemat från Uppsala Vatten…')).toBeInTheDocument()
    resolveSchedule!()

    const next = await screen.findByRole('region', { name: 'Nästa tömning' })
    expect(within(next).getByRole('heading', { name: 'Om 12 dagar' })).toBeInTheDocument()
    expect(within(next).getByText('Onsdag 11 november')).toBeInTheDocument()
    expect(within(next).getByTestId('kalenderblad')).toHaveAttribute('aria-hidden', 'true')
    expect(within(next).getByText('Restavfall')).toBeInTheDocument()
    expect(within(next).getByText('Matavfall')).toBeInTheDocument()
    expect(within(next).getByText('Påminnelse: ställ ut kärlen senast 06.00 på tömningsdagen.')).toBeInTheDocument()

    const list = screen.getByRole('region', { name: 'Kommande tömningar' })
    expect(within(list).queryByText('28')).toBeNull()
    expect(within(list).getByText('Nästa · om 12 dagar')).toBeInTheDocument()
    expect(within(list).getByText('Flyttad · helgdag')).toBeInTheDocument()
    expect(within(list).getByText('Flyttad från ons 6 jan på grund av trettondedag jul.')).toBeInTheDocument()
  })

  it('visar inte "Mina kärl", eftersom vi inte vet användarens abonnemang', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    await vi.waitFor(() => resolveSchedule!())
    await screen.findByRole('region', { name: 'Nästa tömning' })
    expect(screen.queryByRole('region', { name: 'Mina kärl' })).toBeNull()
    expect(screen.queryByText('190 l')).toBeNull()
  })

  it('visar ingen ruta om påminnelser som kommer snart, eftersom de inte ska byggas', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    await vi.waitFor(() => resolveSchedule!())
    await screen.findByRole('region', { name: 'Nästa tömning' })
    expect(screen.queryByText('Påminnelser')).toBeNull()
    expect(screen.queryByText(/e-post eller sms/)).toBeNull()
  })

  it('visar integrationerna med söktext för Homey och API-länken', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    await vi.waitFor(() => resolveSchedule!())
    expect(await screen.findByRole('heading', { name: 'Integrationer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Kopiera söktexten' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /API-länk för utvecklare/ })).toHaveAttribute(
      'href',
      'https://sopor.hardyson.se/api/v1/adress/uppsala/krylbo-storgatan-12b',
    )
  })

  it('visar källan med länk och vem man kontaktar när något är fel', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    await vi.waitFor(() => resolveSchedule!())
    const source = await screen.findByRole('region', { name: 'Källa' })
    expect(within(source).getByText('Schemat kommer från')).toBeInTheDocument()
    expect(within(source).getByRole('link', { name: /Uppsala Vatten/ })).toHaveAttribute('href', 'https://www.uppsalavatten.se')
    expect(within(source).getByText(/Stämmer något inte\? Kontakta Uppsala Vatten\./)).toBeInTheDocument()
  })

  it('linjerar kalendern med kortet för nästa tömning', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    await vi.waitFor(() => resolveSchedule!())
    const cal = await screen.findByRole('region', { name: /November 2026/ })
    expect(cal.className).not.toMatch(/\bpt-/)
  })

  it('har månadskalender med prickar och bläddring', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    await vi.waitFor(() => resolveSchedule!())
    const cal = await screen.findByRole('region', { name: /November 2026/ })
    expect(within(cal).getByRole('button', { name: 'Föregående månad' })).toBeEnabled()
    expect(within(cal).getByLabelText('11 november: Restavfall, Matavfall')).toBeInTheDocument()
    expect(within(cal).getByLabelText('25 november: Pappersförpackningar, Matavfall')).toBeInTheDocument()

    await userEvent.click(within(cal).getByRole('button', { name: 'Nästa månad' }))
    const dec = screen.getByRole('region', { name: /December 2026/ })
    expect(within(dec).getByLabelText('9 december: Plastförpackningar, Matavfall')).toBeInTheDocument()
    expect(within(dec).getByLabelText('23 december: Restavfall, Matavfall')).toBeInTheDocument()

    await userEvent.click(within(dec).getByRole('button', { name: 'Nästa månad' }))
    expect(within(screen.getByRole('region', { name: /Januari 2027/ })).getByRole('button', { name: 'Nästa månad' })).toBeDisabled()
  })

  it('visar kommunen stöds inte för okänd kommun, utan e-postfält', async () => {
    renderAt('/hedemora/storgatan-12')
    expect(await screen.findByText('Den här adressen finns inte hos Sopor')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('visar hittades inte för okänd adress', async () => {
    renderAt('/uppsala/finns-inte')
    await vi.waitFor(() => resolveSchedule?.())
    expect(await screen.findByText('Vi hittade inte adressen')).toBeInTheDocument()
  })

  it('visar fel och kan försöka igen', async () => {
    let calls = 0
    fake = makeProvider({
      getSchedule: async () => {
        calls++
        if (calls === 1) throw new Error('nere')
        return schedule
      },
    })
    renderAt('/uppsala/krylbo-storgatan-12b')
    await userEvent.click(await screen.findByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByRole('region', { name: 'Nästa tömning' })).toBeInTheDocument()
    expect(calls).toBe(2)
  })

  describe('när källan inte svarar', () => {
    const save = () =>
      upsertSaved({ sourceId: 'uppsala', addressId: villa.id, name: 'Hemma', street: villa.street, locality: villa.locality, savedAt: '' })

    beforeEach(() => localStorage.clear())

    it('sparar schemat för en sparad adress när det har hämtats', async () => {
      save()
      renderAt('/uppsala/krylbo-storgatan-12b')
      await vi.waitFor(() => resolveSchedule!())
      await screen.findByRole('region', { name: 'Nästa tömning' })
      await vi.waitFor(() =>
        expect(loadStoredSchedule('uppsala', villa.id)).toEqual({ address: villa, schedule, fetchedAt: '2026-10-30' }),
      )
    })

    it('visar det sparade schemat med en varning, och kan försöka igen', async () => {
      save()
      storeSchedule({ address: villa, schedule, fetchedAt: '2026-10-29' })
      let calls = 0
      fake = makeProvider({
        getAddress: async () => {
          if (calls === 0) throw new Error('nere')
          return villa
        },
        getSchedule: async () => {
          if (calls++ === 0) throw new Error('nere')
          return schedule
        },
      })
      renderAt('/uppsala/krylbo-storgatan-12b')
      const alert = await screen.findByRole('alert')
      expect(alert).toHaveTextContent('Uppsala Vatten svarar inte just nu. Du ser schemat som hämtades 29 oktober.')
      expect(screen.getByRole('heading', { name: 'Storgatan 12 B', level: 1 })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Nästa tömning' })).toHaveTextContent('11 november')
      expect(screen.getByRole('button', { name: 'Lägg till i kalender' })).toBeEnabled()

      await userEvent.click(within(alert).getByRole('button', { name: 'Försök igen' }))
      await screen.findByRole('region', { name: 'Nästa tömning' })
      await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
    })

    it('visar det sparade schemat direkt, utan laddning eller varning, medan källan frågas', () => {
      save()
      storeSchedule({ address: villa, schedule, fetchedAt: '2026-10-29' })
      renderAt('/uppsala/krylbo-storgatan-12b')
      expect(screen.getByRole('heading', { name: 'Storgatan 12 B', level: 1 })).toBeInTheDocument()
      expect(screen.getByRole('region', { name: 'Nästa tömning' })).toHaveTextContent('11 november')
      expect(screen.queryByText('Hämtar schemat från Uppsala Vatten…')).toBeNull()
      expect(screen.queryByRole('alert')).toBeNull()
    })

    it('visar felet som förut utan sparat schema', async () => {
      fake = makeProvider({ getSchedule: async () => Promise.reject(new Error('nere')) })
      renderAt('/uppsala/krylbo-storgatan-12b')
      expect(await screen.findByText('Schemat gick inte att hämta')).toBeInTheDocument()
    })
  })

  it('visar källans besked när schemat är tomt (Stockholm: lägenheter)', async () => {
    fake = makeProvider({
      getAddress: async (id) => ({ ...villa, id, sourceId: 'stockholm', kommun: 'Stockholms kommun' }),
      getSchedule: async () => ({ bins: [], events: [], updatedAt: '2026-11-02' }),
    })
    renderAt('/stockholm/drottninggatan-50_stockholm-11121')
    expect(await screen.findByRole('heading', { name: 'I Stockholm visar Sopor bara villor och radhus' })).toBeInTheDocument()
    expect(
      screen.getByText('Bor du i lägenhet sköter fastighetsägaren sophämtningen. Fråga din hyresvärd eller bostadsrättsförening.'),
    ).toBeInTheDocument()
    expect(screen.queryByText('Inga kommande tömningar i schemat än')).toBeNull()
  })

  it('visar ett tomt läge när alla tömningar har passerat', async () => {
    // Uppsala har inget eget besked, så det allmänna tomma läget visas.
    fake = makeProvider({
      getAddress: async (id) => ({ ...villa, id, sourceId: 'uppsala', kommun: 'Uppsala kommun' }),
      getSchedule: async () => schedule,
    })
    renderAt('/uppsala/storgatan-12_uppsala', '2027-03-01')
    expect(await screen.findByText('Inga kommande tömningar i schemat än')).toBeInTheDocument()
  })

  it('visar Avestas besked när alla tömningar har passerat', async () => {
    renderAt('/avesta/krylbo-storgatan-12b', '2027-03-01')
    await vi.waitFor(() => resolveSchedule!())
    expect(await screen.findByRole('heading', { name: 'Schemat för nästa år är inte publicerat än' })).toBeInTheDocument()
  })

  it('öppnar kalenderarket och spara-arket', async () => {
    renderAt('/uppsala/krylbo-storgatan-12b')
    await vi.waitFor(() => resolveSchedule!())
    await userEvent.click(await screen.findByRole('button', { name: 'Lägg till i kalender' }))
    expect(await screen.findByRole('dialog', { name: 'Lägg till i kalender' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Stäng' }))
    await userEvent.click(screen.getByRole('button', { name: 'Spara' }))
    expect(await screen.findByRole('dialog', { name: 'Spara adress' })).toBeInTheDocument()
  })

  it('hämtar adressen igen när man försöker igen', async () => {
    let addressCalls = 0
    let scheduleCalls = 0
    fake = makeProvider({
      getAddress: async () => {
        addressCalls++
        if (addressCalls === 1) throw new Error('nere')
        return villa
      },
      getSchedule: async () => {
        scheduleCalls++
        if (scheduleCalls === 1) throw new Error('nere')
        return schedule
      },
    })
    renderAt('/uppsala/krylbo-storgatan-12b')
    await userEvent.click(await screen.findByRole('button', { name: 'Försök igen' }))
    expect(await screen.findByRole('heading', { name: 'Storgatan 12 B', level: 1 })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Lägg till i kalender' })).toBeEnabled()
  })

  it('nollställer sparat namn när man byter adress', async () => {
    const other: Address = { id: 'avesta-storgatan-12', street: 'Storgatan 12', locality: 'Avesta', sourceId: 'uppsala', kommun: 'Avesta kommun' }
    fake = makeProvider({
      getAddress: async (id) => (id === villa.id ? villa : id === other.id ? other : null),
      getSchedule: async () => schedule,
    })
    localStorage.setItem(
      'sopor.saved.v1',
      JSON.stringify([{ sourceId: 'uppsala', addressId: villa.id, name: 'Hemma', street: villa.street, locality: villa.locality, savedAt: '' }]),
    )
    render(
      <MemoryRouter initialEntries={['/uppsala/krylbo-storgatan-12b']}>
        <Link to="/uppsala/avesta-storgatan-12">byt</Link>
        <Routes>
          <Route path=":sourceId/:addressId" element={<ResultRoute today="2026-10-30" />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('button', { name: 'Sparad som Hemma' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('link', { name: 'byt' }))
    expect(await screen.findByRole('heading', { name: 'Storgatan 12', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Spara' })).toBeInTheDocument()
    localStorage.clear()
  })
})

describe('ResultPage för ett område', () => {
  const trakt7: Area = {
    id: 'trakt-7', name: 'Avesta tätort, Östanfors m.fl.', day: 'Tisdag, jämn vecka', label: 'Trakt 7',
    places: ['Avesta tätort', 'Östanfors', 'Lycka'], otherDays: ['Till exempel Stallgatan (måndag, udda vecka).'],
    searchTerms: [], dates: ['2026-11-10'],
  }
  const areaAddress: Address = {
    id: 'trakt-7', street: trakt7.name, locality: '', detail: 'Tisdag, jämn vecka · Trakt 7', sourceId: 'avesta', kommun: 'Avesta kommun',
  }
  const index = { explanation: 'Avesta Vatten publicerar sophämtningen per område, men inte vilka adresser som hör till vilket område.', help: '', areas: [trakt7] }
  const areaSchedule: Schedule = { bins: [], updatedAt: '2026-10-29', events: [{ date: '2026-11-10', fractions: ['plast', 'mat'] }] }

  function areaProvider(over: Partial<WasteProvider> = {}) {
    return makeProvider({
      getAddress: async () => areaAddress,
      getSchedule: async () => areaSchedule,
      listAreas: async () => index,
      ...over,
    })
  }

  it('länkar ett okänt id till områdeslistan', async () => {
    fake = areaProvider({ getAddress: async () => null, getSchedule: async () => null })
    renderAt('/avesta/trakt-99')
    expect(await screen.findByRole('link', { name: 'Byt område' })).toHaveAttribute('href', '/avesta/omraden')
    expect(screen.queryByRole('link', { name: 'Byt adress' })).not.toBeInTheDocument()
  })

  it('visar Byt område med länk till områdeslistan', async () => {
    fake = areaProvider()
    renderAt('/avesta/trakt-7')
    expect(await screen.findByRole('link', { name: 'Byt område' })).toHaveAttribute('href', '/avesta/omraden')
    expect(screen.queryByRole('link', { name: 'Byt adress' })).toBeNull()
  })

  it('visar dag och trakt från detail utan tom ort', async () => {
    fake = areaProvider()
    renderAt('/avesta/trakt-7')
    expect(await screen.findByText('Tisdag, jämn vecka · Trakt 7')).toBeInTheDocument()
    await vi.waitFor(() => expect(document.title).toBe('Avesta tätort, Östanfors m.fl. – Sopor'))
  })

  it('förklarar att området är valt av användaren och vad som ingår', async () => {
    fake = areaProvider()
    renderAt('/avesta/trakt-7')
    expect(await screen.findByText('Du har valt området själv')).toBeInTheDocument()
    expect(screen.getByText(`${index.explanation} Jämför gärna med din senaste tömning.`)).toBeInTheDocument()
    expect(screen.getByText('Ingår i området')).toBeInTheDocument()
    expect(screen.getByText('Avesta tätort, Östanfors och Lycka.')).toBeInTheDocument()
    expect(screen.getByText('Vissa gator i tätorten har en annan hämtdag')).toBeInTheDocument()
    expect(screen.getByText('Till exempel Stallgatan (måndag, udda vecka).')).toBeInTheDocument()
    expect(screen.queryByText(/beräknad/i)).toBeNull()
  })

  it('utelämnar rubriken om andra hämtdagar när området saknar sådana', async () => {
    fake = areaProvider({ listAreas: async () => ({ ...index, areas: [{ ...trakt7, otherDays: [] }] }) })
    renderAt('/avesta/trakt-7')
    expect(await screen.findByText('Ingår i området')).toBeInTheDocument()
    expect(screen.queryByText('Vissa gator i tätorten har en annan hämtdag')).toBeNull()
  })

  it('visar schemat utan rutan när områdena inte går att hämta', async () => {
    fake = areaProvider({ listAreas: async () => { throw new Error('nere') } })
    renderAt('/avesta/trakt-7')
    expect(await screen.findByRole('button', { name: 'Lägg till i kalender' })).toBeEnabled()
    expect(screen.queryByText('Du har valt området själv')).toBeNull()
  })

  it('hämtar inte områden för vanliga adresser', async () => {
    const listAreas = vi.fn(async () => index)
    fake = makeProvider({ getSchedule: async () => schedule, listAreas })
    renderAt('/uppsala/krylbo-storgatan-12b')
    expect(await screen.findByRole('link', { name: 'Byt adress' })).toHaveAttribute('href', '/')
    expect(listAreas).not.toHaveBeenCalled()
  })
})
