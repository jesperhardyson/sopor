import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams, useLocation } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { searchAddresses, suggest } from '@/domain/search'
import type { Address } from '@/domain/types'
import { reportMissingKommun } from '@/lib/analytics'
import type { SearchResult } from '@/providers/registry'
import { AddressSearch } from './AddressSearch'
import { loadChoice, rememberChoice } from '@/lib/storage'

vi.mock('@/lib/analytics', () => ({ reportMissingKommun: vi.fn() }))

const a = (id: string, street: string, locality: string): Address => ({ id, street, locality, sourceId: 'avesta', kommun: 'Avesta kommun' })
const ADDRESSES = [
  a('krylbo-storgatan-12b', 'Storgatan 12 B', 'Krylbo'),
  a('avesta-storgatan-12', 'Storgatan 12', 'Avesta'),
  a('fors-storgatan-21', 'Storgatan 21', 'Fors'),
  a('horndal-bergsvagen-4', 'Bergsvägen 4', 'Horndal'),
]

function Result() {
  const { sourceId, addressId } = useParams()
  return <p>Resultat {sourceId}/{addressId}</p>
}

let failed: string[] = []

const s = (id: string, street: string, kommun: string, sourceId = 'sater'): Address => ({ id, street, locality: 'Säter', sourceId, kommun })
const MANY_KOMMUNER = [
  ...ADDRESSES,
  a('avesta-storgatan-30', 'Storgatan 30', 'Avesta'),
  a('avesta-storgatan-31', 'Storgatan 31', 'Avesta'),
  s('sater-storgatan-40', 'Storgatan 40', 'Säters kommun'),
]

let onDeactivate = vi.fn()
let prefetch = vi.fn()

function setup(addresses = ADDRESSES) {
  onDeactivate = vi.fn()
  prefetch = vi.fn()
  render(
    <MemoryRouter>
      <Routes>
        <Route
          index
          element={
            <>
              <AddressSearch
                search={async (q) => ({ addresses: searchAddresses(q, addresses, 12), failed, areaPickers: [] })}
                suggest={async (q) => suggest(q, addresses)}
                missing={async (q) => (/hedemora/i.test(q) ? ['Hedemora kommun'] : /kil$/i.test(q) ? ['Kils kommun', 'Danderyds kommun'] : [])}
                onDeactivate={onDeactivate}
                prefetch={prefetch}
              />
              <p>Utanför</p>
            </>
          }
        />
        <Route path=":sourceId/:addressId" element={<Result />} />
      </Routes>
    </MemoryRouter>,
  )
  return screen.getByRole('combobox')
}

describe('AddressSearch', () => {
  it('börjar hämta adressen när fingret landar på en träff, före klicket', async () => {
    await userEvent.type(setup(), 'storg')
    const [first] = await screen.findAllByRole('option')
    fireEvent.pointerDown(first)
    expect(prefetch).toHaveBeenCalledWith('avesta', 'avesta-storgatan-12')
    expect(screen.queryByText(/Resultat/)).toBeNull()
  })

  it('visar träffar med gata, ort och kommun', async () => {
    await userEvent.type(setup(), 'storg')
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(3)
    expect(within(options[0]).getByText('Storgatan 12')).toBeInTheDocument()
    expect(within(options[0]).getByText('Avesta')).toBeInTheDocument()
    expect(within(options[0]).getByText('Avesta kommun')).toBeInTheDocument()
  })

  it('avbryter sökningen och rensar när man klickar utanför', async () => {
    const input = setup()
    await userEvent.type(input, 'storg')
    await screen.findAllByRole('option')
    await userEvent.click(screen.getByText('Utanför'))
    expect(screen.queryByRole('option')).toBeNull()
    expect(input).toHaveValue('')
    expect(onDeactivate).toHaveBeenCalledOnce()
  })

  // På mobil börjar en scrollgest med pointerdown men slutar utan klick.
  it('rör inte sökningen när man drar för att scrolla utanför listan', async () => {
    const input = setup()
    await userEvent.type(input, 'storg')
    await screen.findAllByRole('option')
    fireEvent.pointerDown(screen.getByText('Utanför'))
    fireEvent.pointerCancel(screen.getByText('Utanför'))
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(input).toHaveValue('storg')
    expect(onDeactivate).not.toHaveBeenCalled()
  })

  it('lämnar fokusläget vid klick utanför även när fältet är tomt', async () => {
    await userEvent.click(setup())
    await userEvent.click(screen.getByText('Utanför'))
    expect(onDeactivate).toHaveBeenCalledOnce()
  })

  it('ber om ett söktangentbord utan autokorrigering', () => {
    const input = setup()
    expect(input).toHaveAttribute('enterkeyhint', 'search')
    expect(input).toHaveAttribute('autocorrect', 'off')
    expect(input).toHaveAttribute('autocapitalize', 'off')
  })

  it('har en rensa-knapp som är stor nog att träffa med fingret', async () => {
    await userEvent.type(setup(), 'st')
    expect(screen.getByRole('button', { name: 'Rensa' })).toHaveClass('size-11')
  })

  it('rör inte sökningen vid klick utanför när den inte används', async () => {
    setup()
    await userEvent.click(screen.getByText('Utanför'))
    expect(onDeactivate).not.toHaveBeenCalled()
  })

  it('visar ingen grupprubrik när alla träffar ligger i en kommun', async () => {
    await userEvent.type(setup(), 'storg')
    await screen.findAllByRole('option')
    expect(screen.queryByRole('group')).toBeNull()
  })

  it('visar kommunen på raden i stället för rubriker när varje kommun har en träff', async () => {
    const one = [a('avesta-storgatan-12', 'Storgatan 12', 'Avesta'), s('sater-storgatan-40', 'Storgatan 40', 'Säters kommun')]
    await userEvent.type(setup(one), 'storg')
    const options = await screen.findAllByRole('option')
    expect(screen.queryByRole('group')).toBeNull()
    expect(within(options[1]).getByText('Säters kommun')).toBeInTheDocument()
  })

  it('grupperar träffarna per kommun när de ligger i flera', async () => {
    await userEvent.type(setup(MANY_KOMMUNER), 'storg')
    const groups = await screen.findAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Avesta kommun', 'Säters kommun'])
    const avesta = within(groups[0]).getAllByRole('option')
    // Tre adresser och en rad för resten. Kommunen står i rubriken, inte på varje rad.
    expect(avesta).toHaveLength(4)
    expect(within(avesta[0]).queryByText('Avesta kommun')).toBeNull()
    expect(avesta[3]).toHaveTextContent('Visa 2 till i Avesta kommun')
    expect(within(groups[1]).getByText('Storgatan 40')).toBeInTheDocument()
  })

  it('fäller ut resten av en kommuns träffar', async () => {
    await userEvent.type(setup(MANY_KOMMUNER), 'storg')
    await userEvent.click(await screen.findByRole('option', { name: 'Visa 2 till i Avesta kommun' }))
    const avesta = within(screen.getAllByRole('group')[0]).getAllByRole('option')
    expect(avesta).toHaveLength(5)
    expect(screen.queryByText(/Visa 2 till/)).toBeNull()
    expect(screen.getByRole('combobox')).toHaveFocus()
  })

  describe('många kommuner', () => {
    const spread = (n: number) => Array.from({ length: n }, (_, i) => s(`id-${i}`, `Storgatan ${i + 1}`, `Kommun ${i + 1}`))
    const renderWith = (addresses: Address[]) =>
      render(
        <MemoryRouter>
          <AddressSearch search={async () => ({ addresses, failed: [], areaPickers: [] })} suggest={async () => []} />
        </MemoryRouter>,
      )

    it('visar högst 15 rader och resten bakom en rad', async () => {
      renderWith(spread(18))
      await userEvent.type(screen.getByRole('combobox'), 'storg')
      const options = await screen.findAllByRole('option')
      expect(options).toHaveLength(16)
      expect(options[15]).toHaveTextContent('Visa 3 till')
    })

    it('fäller ut resten och behåller fokus i sökfältet', async () => {
      renderWith(spread(18))
      await userEvent.type(screen.getByRole('combobox'), 'storg')
      await userEvent.click(await screen.findByRole('option', { name: 'Visa 3 till' }))
      expect(screen.getAllByRole('option')).toHaveLength(18)
      expect(screen.getByRole('combobox')).toHaveFocus()
    })

    it('håller taket även för en enda rad till, så att en rad som syns aldrig försvinner', async () => {
      renderWith(spread(16))
      await userEvent.type(screen.getByRole('combobox'), 'storg')
      const options = await screen.findAllByRole('option')
      expect(options).toHaveLength(16)
      expect(options[15]).toHaveTextContent('Visa 1 till')
    })

    it('ger en kommun som klipps sin egen rad för resten', async () => {
      const kommunA = Array.from({ length: 2 }, (_, i) => s(`a-${i}`, `Storgatan ${i + 50}`, 'Kommun A'))
      const kommunB = Array.from({ length: 4 }, (_, i) => s(`b-${i}`, `Storgatan ${i + 60}`, 'Kommun B'))
      renderWith([...spread(12), ...kommunA, ...kommunB])
      await userEvent.type(screen.getByRole('combobox'), 'storg')
      const options = await screen.findAllByRole('option')
      expect(options.map((o) => o.textContent).filter((t) => t?.startsWith('Visa'))).toEqual(['Visa 3 till i Kommun B'])
      await userEvent.click(screen.getByRole('option', { name: 'Visa 3 till i Kommun B' }))
      expect(within(screen.getByRole('group', { name: 'Kommun B' })).getAllByRole('option')).toHaveLength(4)
    })

    it('räknar de rader som syns, inte de som en kommun har fällt ihop', async () => {
      const kommunA = Array.from({ length: 5 }, (_, i) => s(`a-${i}`, `Storgatan ${i + 50}`, 'Kommun A'))
      renderWith([...kommunA, ...spread(12)])
      await userEvent.type(screen.getByRole('combobox'), 'storg')
      const options = await screen.findAllByRole('option')
      // Tre rader för Kommun A och tolv för de andra: precis 15, så ingen rad för hela listan.
      expect(options.map((o) => o.textContent).filter((t) => t?.startsWith('Visa'))).toEqual(['Visa 2 till i Kommun A'])
    })
  })

  it('stegar mellan grupperna med tangentbordet och fäller ut med Enter', async () => {
    const input = setup(MANY_KOMMUNER)
    await userEvent.type(input, 'storg')
    await screen.findAllByRole('group')
    await userEvent.keyboard('{ArrowDown>4/}{Enter}')
    expect(within(screen.getAllByRole('group')[0]).getAllByRole('option')).toHaveLength(5)
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
    expect(await screen.findByText('Resultat sater/sater-storgatan-40')).toBeInTheDocument()
  })

  it('navigerar till vald adress med tangentbordet', async () => {
    const input = setup()
    await userEvent.type(input, 'storgatan 12 b')
    await screen.findAllByRole('option')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(await screen.findByText('Resultat avesta/krylbo-storgatan-12b')).toBeInTheDocument()
  })

  it('visar hittades inte med förslag vid felstavning', async () => {
    await userEvent.type(setup(), 'Storgtan 12{Enter}')
    expect(await screen.findByText('Vi hittade inte adressen')).toBeInTheDocument()
    expect(screen.getByText('Menade du:')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Storgatan 12, Avesta' })
    expect(link).toHaveAttribute('href', '/avesta/avesta-storgatan-12')
    expect(screen.queryByText(/officiella hämtschema/)).toBeNull()
  })

  it('pekar vidare till bidra-sidan när adressen inte hittas', async () => {
    await userEvent.type(setup(), 'Storgtan 12{Enter}')
    await screen.findByText('Vi hittade inte adressen')
    expect(screen.queryByRole('link', { name: 'Sök på startsidan' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Tipsa om din kommun' })).toHaveAttribute('href', '/bidra')
  })

  describe('avgränsad till en kommun', () => {
    function setupInKommun() {
      render(
        <MemoryRouter>
          <AddressSearch search={async () => ({ addresses: [], failed: [], areaPickers: [] })} suggest={async () => []} kommun="Uppsala kommun" />
        </MemoryRouter>,
      )
      return screen.getByRole('combobox')
    }

    it('säger att adressen inte hittades i kommunen, inte i hela landet', async () => {
      await userEvent.type(setupInKommun(), 'Storgatan 2{Enter}')
      expect(await screen.findByRole('heading', { name: 'Vi hittade inte adressen i Uppsala kommun' })).toBeInTheDocument()
      expect(screen.getByText(/Kolla stavningen/)).toBeInTheDocument()
    })

    it('pekar vidare till startsidan för adresser i andra kommuner', async () => {
      await userEvent.type(setupInKommun(), 'Storgatan 2{Enter}')
      await screen.findByRole('heading', { name: 'Vi hittade inte adressen i Uppsala kommun' })
      expect(screen.getByText(/Ligger adressen i en annan kommun\?/)).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Sök på startsidan' })).toHaveAttribute('href', '/')
      expect(screen.queryByRole('link', { name: 'Tipsa om din kommun' })).toBeNull()
    })
  })

  it('säger att kommunen saknas när orten ligger i en kommun som Sopor inte har', async () => {
    await userEvent.type(setup(), 'Storgatan 12, Hedemora{Enter}')
    expect(await screen.findByRole('heading', { name: 'Vi finns inte i Hedemora kommun än' })).toBeInTheDocument()
    expect(screen.getByText(/Adressen ligger i Hedemora kommun, som Sopor inte har än/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Tipsa om din kommun' })).toHaveAttribute('href', '/bidra')
    expect(screen.queryByText('Vi hittade inte adressen')).toBeNull()
  })

  it('räknar sökningen när kommunen saknas, men inte vanliga felstavningar', async () => {
    vi.mocked(reportMissingKommun).mockClear()
    const input = setup()
    await userEvent.type(input, 'Storgtan 12{Enter}')
    await screen.findByText('Vi hittade inte adressen')
    expect(reportMissingKommun).not.toHaveBeenCalled()
    await userEvent.clear(input)
    await userEvent.type(input, 'Storgatan 12, Hedemora{Enter}')
    await screen.findByRole('heading', { name: 'Vi finns inte i Hedemora kommun än' })
    // Rapporten körs i en effekt, som kan komma först efter att rubriken syns
    await waitFor(() => expect(reportMissingKommun).toHaveBeenCalledWith(['Hedemora kommun']))
  })

  it('räknar upp kommunerna när orten ligger i flera', async () => {
    await userEvent.type(setup(), 'Storgatan 12 Kil{Enter}')
    expect(await screen.findByRole('heading', { name: 'Vi finns inte där än' })).toBeInTheDocument()
    expect(screen.getByText(/Orten ligger i Kils kommun och Danderyds kommun, som Sopor inte har än/)).toBeInTheDocument()
  })

  it('visar inte hittades inte för en kortare fråga medan den nya söks', async () => {
    render(
      <MemoryRouter>
        <AddressSearch
          search={(q) => (q === 'sto' ? Promise.resolve({ addresses: [], failed: [], areaPickers: [] }) : new Promise(() => {}))}
          suggest={async () => []}
        />
      </MemoryRouter>,
    )
    const box = screen.getByRole('combobox')
    await userEvent.type(box, 'sto')
    await new Promise((r) => setTimeout(r, 300))
    await userEvent.type(box, 'r')
    expect(screen.queryByText('Vi hittade inte adressen')).toBeNull()
  })

  it('låter hittades inte stå kvar medan man skriver vidare', async () => {
    render(
      <MemoryRouter>
        <AddressSearch
          search={(q) => (q === 'storgx' ? Promise.resolve({ addresses: [], failed: [], areaPickers: [] }) : new Promise(() => {}))}
          suggest={async () => []}
        />
      </MemoryRouter>,
    )
    const box = screen.getByRole('combobox')
    await userEvent.type(box, 'storgx')
    expect(await screen.findByText('Vi hittade inte adressen')).toBeInTheDocument()
    await userEvent.type(box, 'y')
    expect(screen.getByText('Vi hittade inte adressen')).toBeInTheDocument()
  })

  it('rensar fältet med rensa-knappen', async () => {
    const input = setup()
    await userEvent.type(input, 'storg')
    await userEvent.click(screen.getByRole('button', { name: 'Rensa' }))
    expect(input).toHaveValue('')
    expect(screen.queryByRole('option')).toBeNull()
  })

  it('öppnar rätt adress när man trycker Enter innan sökningen hunnit uppdateras', async () => {
    const input = setup()
    await userEvent.type(input, 'storgatan 12')
    await screen.findAllByRole('option')
    await userEvent.type(input, ' b{Enter}')
    expect(await screen.findByText('Resultat avesta/krylbo-storgatan-12b')).toBeInTheDocument()
  })

  describe('Enter när svaret inte är entydigt', () => {
    const horn = (nr: string, locality: string): Address => ({ id: `${locality}-${nr}`, street: `Hornsgatan ${nr}`, locality, sourceId: locality, kommun: `${locality} kommun` })

    it('öppnar inte en annan adress när bara andra husnummer finns', async () => {
      const input = setup([horn('10', 'Boden'), horn('12', 'Boden')])
      await userEvent.type(input, 'Hornsgatan 1')
      await screen.findAllByRole('option')
      await userEvent.keyboard('{Enter}')
      expect(screen.queryByText(/^Resultat/)).not.toBeInTheDocument()
      expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('låter ett andra Enter öppna den markerade raden', async () => {
      const input = setup([horn('1', 'Borås'), horn('1', 'Kalmar')])
      await userEvent.type(input, 'Hornsgatan 1')
      await screen.findAllByRole('option')
      await userEvent.keyboard('{Enter}{Enter}')
      expect(await screen.findByText('Resultat Borås/Borås-1')).toBeInTheDocument()
    })

    it('öppnar den enda raden med rätt husnummer, även om den inte står först', async () => {
      const input = setup([horn('10', 'Boden'), horn('1', 'Kalmar')])
      await userEvent.type(input, 'Hornsgatan 1')
      await screen.findAllByRole('option')
      await userEvent.keyboard('{Enter}')
      expect(await screen.findByText('Resultat Kalmar/Kalmar-1')).toBeInTheDocument()
    })

    it('öppnar en rad man har valt med piltangenterna', async () => {
      const input = setup([horn('10', 'Boden'), horn('12', 'Boden')])
      await userEvent.type(input, 'Hornsgatan 1')
      await screen.findAllByRole('option')
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
      expect(await screen.findByText('Resultat Boden/Boden-12')).toBeInTheDocument()
    })

    it('visar listan när Enter kommer innan sökningen hunnit svara', async () => {
      await userEvent.type(setup([horn('1', 'Borås'), horn('1', 'Kalmar')]), 'Hornsgatan 1{Enter}')
      expect((await screen.findAllByRole('option'))[0]).toHaveAttribute('aria-selected', 'true')
      expect(screen.queryByText(/^Resultat/)).not.toBeInTheDocument()
    })

    it('väntar på alla källor i stället för att gissa från de som redan svarat', async () => {
      const search = vi.fn(async (_q: string, _signal?: AbortSignal, onPartial?: (p: { addresses: Address[]; failed: string[]; areaPickers: [] }) => void, options?: { submitted?: boolean }) => {
        if (options?.submitted) return { addresses: [horn('1', 'Borås'), horn('1', 'Kalmar')], failed: [], areaPickers: [] }
        onPartial?.({ addresses: [horn('1', 'Borås')], failed: [], areaPickers: [] })
        return new Promise<never>(() => {})
      })
      render(
        <MemoryRouter>
          <Routes>
            <Route index element={<AddressSearch search={search} suggest={async () => []} missing={async () => []} />} />
            <Route path=":sourceId/:addressId" element={<Result />} />
          </Routes>
        </MemoryRouter>,
      )
      await userEvent.type(screen.getByRole('combobox'), 'Hornsgatan 1')
      await screen.findAllByRole('option')
      await userEvent.keyboard('{Enter}')
      await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2))
      expect(screen.queryByText(/^Resultat/)).not.toBeInTheDocument()
    })
  })

  it('lägger träfflistan ovanpå innehållet så att inget under hoppar', async () => {
    await userEvent.type(setup(), 'storg')
    const listbox = await screen.findByRole('listbox')
    expect(listbox.closest('.absolute')).not.toBeNull()
  })

  it('lägger hittades inte ovanpå innehållet så att inget under hoppar', async () => {
    await userEvent.type(setup(), 'Storgtan 12{Enter}')
    const card = await screen.findByText('Vi hittade inte adressen')
    expect(card.closest('.absolute')).not.toBeNull()
  })

  it('ger fältet fokus vid klick var som helst i rutan', async () => {
    const input = setup()
    await userEvent.click(input.parentElement!)
    expect(input).toHaveFocus()
  })

  it('ber lösenordshanterare att låta sökfältet vara', () => {
    const input = setup()
    expect(input).toHaveAttribute('data-1p-ignore')
    expect(input).toHaveAttribute('data-lpignore', 'true')
  })

  it('berättar när en källa inte svarar', async () => {
    failed = ['uppsala']
    await userEvent.type(setup(), 'storg')
    expect(await screen.findByText('Uppsala Vatten svarar inte just nu.')).toBeInTheDocument()
    failed = []
  })

  it('visar lokala träffar direkt och att fler källor söks', async () => {
    let finish: () => void = () => {}
    render(
      <MemoryRouter>
        <AddressSearch
          search={(q, _signal, onPartial) => {
            onPartial?.({ addresses: searchAddresses(q, ADDRESSES), failed: [], areaPickers: [] })
            return new Promise((resolve) => (finish = () => resolve({ addresses: searchAddresses(q, ADDRESSES), failed: [], areaPickers: [] })))
          }}
          suggest={async () => []}
        />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'storg')
    expect(await screen.findAllByRole('option')).toHaveLength(3)
    expect(screen.getByText('Söker hos fler källor…')).toBeInTheDocument()
    finish()
    await vi.waitFor(() => expect(screen.queryByText('Söker hos fler källor…')).toBeNull())
  })

  it('låter raderna som syns stå kvar på sin plats när fler träffar kommer', async () => {
    let finish: () => void = () => {}
    const [first, second, third] = searchAddresses('storg', ADDRESSES)
    render(
      <MemoryRouter>
        <AddressSearch
          search={(_q, _signal, onPartial) => {
            onPartial?.({ addresses: [first, second], failed: [], areaPickers: [] })
            return new Promise((resolve) => (finish = () => resolve({ addresses: [third, second, first], failed: [], areaPickers: [] })))
          }}
          suggest={async () => []}
        />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'storg')
    expect(await screen.findAllByRole('option')).toHaveLength(2)
    finish()
    await vi.waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3))
    const streets = screen.getAllByRole('option').map((o) => within(o).getAllByText(/Storgatan/)[0].textContent)
    expect(streets).toEqual([first.street, second.street, third.street])
  })

  it('visar ett skelett medan den söker och ännu inte har några träffar', async () => {
    let finish: () => void = () => {}
    render(
      <MemoryRouter>
        <AddressSearch
          search={(q) => new Promise((resolve) => (finish = () => resolve({ addresses: searchAddresses(q, ADDRESSES), failed: [], areaPickers: [] })))}
          suggest={async () => []}
        />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'storg')
    expect(await screen.findByRole('status')).toHaveTextContent('Söker adresser…')
    finish()
    expect(await screen.findAllByRole('option')).toHaveLength(3)
    expect(screen.queryByText('Söker adresser…')).toBeNull()
  })

  it('visar inte förra frågans träffar när man skrivit något helt annat', async () => {
    render(
      <MemoryRouter>
        <AddressSearch
          search={(q) =>
            q.startsWith('storg') ? Promise.resolve({ addresses: searchAddresses(q, ADDRESSES), failed: [], areaPickers: [] }) : new Promise(() => {})
          }
          suggest={async () => []}
        />
      </MemoryRouter>,
    )
    const box = screen.getByRole('combobox')
    await userEvent.type(box, 'storg')
    expect(await screen.findAllByRole('option')).toHaveLength(3)
    // Markera allt och skriv över: texten byts utan att fältet blir tomt däremellan.
    fireEvent.change(box, { target: { value: 'bergs' } })
    expect(await screen.findByText('Söker adresser…')).toBeInTheDocument()
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('låter förra träffarna stå kvar medan man skriver vidare', async () => {
    render(
      <MemoryRouter>
        <AddressSearch
          search={(q) => (q === 'storg' ? Promise.resolve({ addresses: searchAddresses(q, ADDRESSES), failed: [], areaPickers: [] }) : new Promise(() => {}))}
          suggest={async () => []}
        />
      </MemoryRouter>,
    )
    const box = screen.getByRole('combobox')
    await userEvent.type(box, 'storg')
    expect(await screen.findAllByRole('option')).toHaveLength(3)
    await userEvent.type(box, 'atan')
    await new Promise((r) => setTimeout(r, 400))
    expect(screen.getAllByRole('option')).toHaveLength(3)
    expect(screen.queryByText('Söker adresser…')).toBeNull()
  })

  it('visar inget skelett när svaret kommer direkt', async () => {
    await userEvent.type(setup(), 'storg')
    await screen.findAllByRole('option')
    await new Promise((r) => setTimeout(r, 300))
    expect(screen.queryByText('Söker adresser…')).toBeNull()
  })

  it('ber om en bredare sökning när man trycker Enter', async () => {
    const search = vi.fn(async () => ({ addresses: [], failed: [], areaPickers: [] }))
    render(
      <MemoryRouter>
        <AddressSearch search={search} suggest={async () => []} />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'Okändgatan{Enter}')
    expect(search).toHaveBeenCalledWith('Okändgatan', undefined, undefined, { submitted: true })
  })

  it('visar särskiljaren när flera träffar har samma adress', async () => {
    const twins = [
      { ...a('vasagatan-20_vasteras-1', 'Vasagatan 20', 'Västerås'), detail: 'Byggnad 1' },
      { ...a('vasagatan-20_vasteras-2', 'Vasagatan 20', 'Västerås'), detail: 'Byggnad 2' },
    ]
    render(
      <MemoryRouter>
        <AddressSearch search={async () => ({ addresses: twins, failed: [], areaPickers: [] })} suggest={async () => []} />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'vasagatan 20')
    const options = await screen.findAllByRole('option')
    expect(within(options[0]).getByText('Byggnad 1')).toBeInTheDocument()
    expect(within(options[1]).getByText('Byggnad 2')).toBeInTheDocument()
  })

  it('ger särskiljaren en egen rad, så att en lång text inte delar raden med orten och kommunen', async () => {
    const detail = 'Matavfall varannan vecka (container), Restavfall varannan vecka (2 containrar)'
    const twins = [
      { ...a('ringvagen-1_grodinge-1', 'Ringvägen 1', 'Grödinge'), detail },
      { ...a('ringvagen-1_grodinge-2', 'Ringvägen 1', 'Grödinge'), detail: 'Restavfall varje vecka' },
    ]
    render(
      <MemoryRouter>
        <AddressSearch search={async () => ({ addresses: twins, failed: [], areaPickers: [] })} suggest={async () => []} />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'ringvägen 1')
    const [first] = await screen.findAllByRole('option')
    const line = within(first).getByText('Grödinge').parentElement!
    expect(line).not.toHaveTextContent(detail)
    expect(within(first).getByText(detail).parentElement).not.toBe(line)
  })

  it('visar ingen tom rad och ingen ensam punkt när orten saknas', async () => {
    const lidkoping = (id: string, street: string): Address => ({ id, street, locality: '', sourceId: 'lidkoping', kommun: 'Lidköpings kommun' })
    const hits = [lidkoping('storgatan-11-1', 'Storgatan 11'), a('avesta-storgatan-12', 'Storgatan 12', 'Avesta')]
    render(
      <MemoryRouter>
        <AddressSearch search={async () => ({ addresses: hits, failed: [], areaPickers: [] })} suggest={async () => []} />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'storgatan')
    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveTextContent(/^Storgatan 11Lidköpings kommun$/)
  })

  describe('områdesval', () => {
    const area = (id: string, street: string, detail: string, searchTerms: string[]): Address => ({
      id,
      street,
      locality: '',
      detail,
      searchTerms,
      sourceId: 'avesta',
      kommun: 'Avesta kommun',
    })
    const tatort = area('trakt-7', 'Avesta tätort, Östanfors m.fl.', 'Tisdag, jämn vecka · Trakt 7', ['Avesta tätort'])
    const skogsbo = area('trakt-2', 'Skogsbo tätort, Rosse m.fl.', 'Tisdag, udda vecka · Trakt 2', ['Backa'])
    const krylbo = area('trakt-4', 'Krylbo stationssidan, Lejde m.fl.', 'Torsdag, udda vecka · Trakt 4', ['Backa'])
    const hedemora: Address = { id: 'kungsgatan-12', street: 'Kungsgatan 12', locality: 'Hedemora', sourceId: 'hedemora', kommun: 'Hedemoras kommun' }
    const picker = (hasHits: boolean) => ({ sourceId: 'avesta', kommun: 'Avesta kommun', hasHits })

    beforeEach(() => localStorage.clear())

    function Omraden() {
      const street = (useLocation().state as { street?: string } | null)?.street
      return <p>{street ? `Områdesvalet: ${street}` : 'Områdesvalet'}</p>
    }

    function renderResult(query: string, result: Partial<SearchResult>) {
      render(
        <MemoryRouter>
          <Routes>
            <Route
              index
              element={<AddressSearch search={async () => ({ addresses: [], failed: [], areaPickers: [], ...result })} suggest={async () => []} />}
            />
            <Route path="avesta/omraden" element={<Omraden />} />
            <Route path=":sourceId/:addressId" element={<Result />} />
          </Routes>
        </MemoryRouter>,
      )
      return userEvent.type(screen.getByRole('combobox'), query)
    }

    it('visar områdets namn och särskiljare med kartikon, och raden för alla områden', async () => {
      await renderResult('Avesta tätort', { addresses: [tatort], areaPickers: [picker(true)] })
      const options = await screen.findAllByRole('option')
      expect(options).toHaveLength(2)
      expect(options[0]).toHaveTextContent('Avesta tätort, Östanfors m.fl.Tisdag, jämn vecka · Trakt 7')
      expect(options[0].querySelector('.lucide-map')).not.toBeNull()
      expect(options[0].querySelector('.lucide-map-pin')).toBeNull()
      expect(options[1]).toHaveTextContent('Se alla områden i Avesta')
      expect(screen.getByRole('group', { name: 'Avesta kommun' })).toBeInTheDocument()
    })

    it('behåller nålen för en adress med särskiljare och ort', async () => {
      const twin = { ...a('ringvagen-1_1', 'Ringvägen 1', 'Grödinge'), detail: 'Restavfall varje vecka' }
      await renderResult('ringvägen 1', { addresses: [twin] })
      const [row] = await screen.findAllByRole('option')
      expect(row.querySelector('.lucide-map-pin')).not.toBeNull()
    })

    it('behåller nålen för en adress med särskiljare men utan ort', async () => {
      const lidkoping: Address = { id: 'ringvagen-1', street: 'Ringvägen 1', locality: '', detail: 'Restavfall varje vecka', sourceId: 'lidkoping', kommun: 'Lidköpings kommun' }
      await renderResult('ringvägen 1', { addresses: [lidkoping] })
      const [row] = await screen.findAllByRole('option')
      expect(row.querySelector('.lucide-map-pin')).not.toBeNull()
      expect(row.querySelector('.lucide-map')).toBeNull()
    })

    it('skiljer raden för alla områden från träffarna med en rak linje', async () => {
      await renderResult('Avesta tätort', { addresses: [tatort], areaPickers: [picker(true)] })
      const row = await screen.findByRole('option', { name: /Se alla områden i Avesta/ })
      expect(row.className).not.toContain('border-t')
      expect(row.previousElementSibling).toHaveClass('h-px', 'bg-border')
      expect(row.previousElementSibling).toHaveAttribute('role', 'none')
    })

    it('visar sökordet som gav träffen', async () => {
      await renderResult('Backa', { addresses: [skogsbo, krylbo], areaPickers: [picker(true)] })
      const options = await screen.findAllByRole('option')
      expect(options[0]).toHaveTextContent('Backa ingår i området')
      expect(options[1]).toHaveTextContent('Backa ingår i området')
    })

    it('visar ingen sökordsrad när namnet själv träffar', async () => {
      await renderResult('Avesta tätort', { addresses: [tatort], areaPickers: [picker(true)] })
      await screen.findAllByRole('option')
      expect(screen.queryByText(/ingår i området/)).toBeNull()
    })

    it('visar Välj område med förklaring, och andra kommuners träffar under sina rubriker', async () => {
      await renderResult('Kungsgatan 12 Avesta', { addresses: [hedemora], areaPickers: [picker(false)] })
      const options = await screen.findAllByRole('option')
      expect(within(screen.getByRole('group', { name: 'Avesta kommun' })).getByRole('option')).toHaveTextContent(
        'Välj område i AvestaHär finns schemat per område, inte per adress.',
      )
      expect(within(screen.getByRole('group', { name: 'Hedemoras kommun' })).getByRole('option')).toHaveTextContent('Kungsgatan 12')
      expect(options).toHaveLength(2)
    })

    it('lägger raden för gatan sist, efter andra kommuners träffar', async () => {
      await renderResult('Kungsgatan 12', { addresses: [hedemora], areaPickers: [{ ...picker(false), street: 'Kungsgatan 12' }] })
      const groups = await screen.findAllByRole('group')
      expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Hedemoras kommun', 'Avesta kommun'])
      expect(within(groups[1]).getByRole('option')).toHaveTextContent('Kungsgatan 12Välj område i Avesta. Här finns schemat per område, inte per adress.')
    })

    describe('eget val', () => {
      const choice = { sourceId: 'avesta', street: 'Kungsgatan 12', areaId: 'trakt-7', label: 'Trakt 7', day: 'Tisdag, jämn vecka' }
      const withStreet = { areaPickers: [{ ...picker(false), street: 'Kungsgatan 12' }] }
      beforeEach(() => rememberChoice(choice))

      it('märks som användarens eget val och öppnar området', async () => {
        await renderResult('Kungsgatan 12', withStreet)
        const row = await screen.findByRole('option', { name: /Ditt val/ })
        expect(row).toHaveTextContent('Trakt 7 · Tisdag, jämn vecka')
        expect(row).toHaveTextContent(/Ditt val, inte från/)
        await userEvent.click(row)
        expect(await screen.findByText('Resultat avesta/trakt-7')).toBeInTheDocument()
      })

      it('går att ändra med tangentbordet och tar med gatan', async () => {
        await renderResult('Kungsgatan 12', withStreet)
        await screen.findByRole('option', { name: /Ditt val/ })
        await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
        expect(await screen.findByText('Områdesvalet: Kungsgatan 12')).toBeInTheDocument()
      })

      it('går att glömma, och då visas raden för att välja område igen', async () => {
        await renderResult('Kungsgatan 12', withStreet)
        await userEvent.click(await screen.findByRole('option', { name: 'Glöm valet' }))
        expect(screen.queryByRole('option', { name: /Ditt val/ })).toBeNull()
        expect(screen.getByRole('option', { name: /Välj område i Avesta/ })).toBeInTheDocument()
        expect(loadChoice('avesta', 'Kungsgatan 12')).toBeUndefined()
      })

      it('öppnar valet med Enter när det är enda raden', async () => {
        await renderResult('Kungsgatan 12{Enter}', withStreet)
        expect(await screen.findByText('Resultat avesta/trakt-7')).toBeInTheDocument()
      })
    })

    it('tar med gatan till områdesvalet', async () => {
      await renderResult('Kungsgatan 12', { areaPickers: [{ ...picker(false), street: 'Kungsgatan 12' }] })
      await userEvent.click(await screen.findByRole('option', { name: /Kungsgatan 12/ }))
      expect(await screen.findByText('Områdesvalet: Kungsgatan 12')).toBeInTheDocument()
    })

    it('är inte "hittades inte" när bara raden för områdesval finns', async () => {
      await renderResult('Okändgatan 3, Avesta', { areaPickers: [picker(false)] })
      expect(await screen.findByRole('option', { name: /Välj område i Avesta/ })).toBeInTheDocument()
      expect(screen.queryByText('Vi hittade inte adressen')).toBeNull()
    })

    it('går till områdesvalet vid klick på raden', async () => {
      await renderResult('Kungsgatan 12 Avesta', { addresses: [hedemora], areaPickers: [picker(false)] })
      await userEvent.click(await screen.findByRole('option', { name: /Välj område i Avesta/ }))
      expect(await screen.findByText('Områdesvalet')).toBeInTheDocument()
    })

    it('går till områdesvalet med piltangent och Enter på raden Se alla områden', async () => {
      await renderResult('Avesta tätort', { addresses: [tatort], areaPickers: [picker(true)] })
      await screen.findAllByRole('option')
      await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')
      expect(await screen.findByText('Områdesvalet')).toBeInTheDocument()
    })

    it('öppnar områdesvalet med Enter när raden är den enda', async () => {
      await renderResult('Okändgatan 3, Avesta{Enter}', { areaPickers: [picker(false)] })
      expect(await screen.findByText('Områdesvalet')).toBeInTheDocument()
    })

    it('öppnar inte något med Enter när en träff och Välj område finns', async () => {
      await renderResult('Kungsgatan 12 Avesta{Enter}', { addresses: [hedemora], areaPickers: [picker(false)] })
      await screen.findAllByRole('option')
      expect(screen.queryByText('Områdesvalet')).toBeNull()
      expect(screen.queryByText(/^Resultat/)).toBeNull()
      expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('öppnar en ensam områdesträff med Enter även med raden Se alla områden', async () => {
      await renderResult('Avesta tätort{Enter}', { addresses: [tatort], areaPickers: [picker(true)] })
      expect(await screen.findByText('Resultat avesta/trakt-7')).toBeInTheDocument()
    })

    it('fäller ut kommunens träffar med Visa N till utan att tappa raden för områdesval', async () => {
      const many = Array.from({ length: 6 }, (_, i) => area(`trakt-${i + 20}`, `Område ${i}`, 'Måndag', ['Backa']))
      await renderResult('Backa', { addresses: many, areaPickers: [picker(true)] })
      await userEvent.click(await screen.findByRole('option', { name: 'Visa 3 till i Avesta kommun' }))
      expect(screen.getAllByRole('option')).toHaveLength(7)
      expect(screen.getByRole('option', { name: /Se alla områden i Avesta/ })).toBeInTheDocument()
    })
  })

  describe('hittades inte', () => {
    it('har länken Välj område när sökningen är avgränsad till en kommun med områdesval', async () => {
      render(
        <MemoryRouter>
          <AddressSearch
            search={async () => ({ addresses: [], failed: [], areaPickers: [] })}
            suggest={async () => []}
            kommun="Avesta kommun"
            areaHref="/avesta/omraden"
          />
        </MemoryRouter>,
      )
      await userEvent.type(screen.getByRole('combobox'), 'Okändgatan 3{Enter}')
      expect(await screen.findByRole('link', { name: 'Välj område i Avesta' })).toHaveAttribute('href', '/avesta/omraden')
    })
  })
})

describe('sena svar från källor', () => {
  type Partial = (p: SearchResult) => void
  const lateSearch = (first: SearchResult) => {
    let send: Partial | undefined
    const search = async (q: string, _signal?: AbortSignal, onPartial?: Partial) => {
      // Svaret ska höra till hela frågan, inte en äldre sökning från medan man skrev.
      if (q === 'Storgatan 12') send = onPartial
      return first
    }
    render(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<AddressSearch search={search} suggest={async () => []} missing={async () => []} prefetch={vi.fn()} />} />
          <Route path="/:sourceId/:addressId" element={<Result />} />
        </Routes>
      </MemoryRouter>,
    )
    return {
      late: async (p: SearchResult) => {
        await waitFor(() => expect(send).toBeDefined())
        await act(async () => {
          await new Promise((r) => setTimeout(r, 0))
          send!(p)
        })
      },
    }
  }

  it('ersätter "hittades inte" med träffen när en sen källa svarar, och varningen försvinner', async () => {
    const { late } = lateSearch({ addresses: [], failed: ['avesta'], areaPickers: [] })
    await userEvent.type(screen.getByRole('combobox'), 'Storgatan 12')
    expect(await screen.findByText(/svarar inte just nu/)).toBeInTheDocument()
    await late({ addresses: [a('avesta-storgatan-12', 'Storgatan 12', 'Avesta')], failed: [], areaPickers: [], pending: false })
    expect(await screen.findByRole('option', { name: /Storgatan 12/ })).toBeInTheDocument()
    expect(screen.queryByText(/svarar inte just nu/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Söker hos fler källor/)).not.toBeInTheDocument()
  })

  it('tar bort varningen när en sen källa svarar utan träffar', async () => {
    const { late } = lateSearch({ addresses: [], failed: ['avesta'], areaPickers: [] })
    await userEvent.type(screen.getByRole('combobox'), 'Storgatan 12')
    expect(await screen.findByText(/svarar inte just nu/)).toBeInTheDocument()
    await late({ addresses: [], failed: [], areaPickers: [], pending: false })
    await waitFor(() => expect(screen.queryByText(/svarar inte just nu/)).not.toBeInTheDocument())
  })

  it('säger att fler källor söks, inte att de är nere, när en källa är långsam', async () => {
    const { late } = lateSearch({ addresses: [], failed: [], areaPickers: [], pending: true })
    await userEvent.type(screen.getByRole('combobox'), 'Storgatan 12')
    expect(await screen.findByText(/Söker hos fler källor/)).toBeInTheDocument()
    expect(screen.queryByText(/svarar inte just nu/)).not.toBeInTheDocument()
    await late({ addresses: [], failed: ['avesta'], areaPickers: [], pending: false })
    expect(await screen.findByText(/svarar inte just nu/)).toBeInTheDocument()
    expect(screen.queryByText(/Söker hos fler källor/)).not.toBeInTheDocument()
  })

  describe('skydd mot felklick', () => {
    const shown = [a('s-120', 'Storgatan 120', 'Avesta'), a('s-121', 'Storgatan 121', 'Avesta')]
    const withExact = { addresses: [...shown, a('s-12', 'Storgatan 12', 'Avesta')], failed: [], areaPickers: [] as [], pending: false }
    const rows = () => screen.getAllByRole('option').map((o) => o.textContent?.match(/Storgatan \d+/)?.[0])
    const start = async () => {
      const { late } = lateSearch({ addresses: shown, failed: [], areaPickers: [] })
      await userEvent.type(screen.getByRole('combobox'), 'Storgatan 12')
      await screen.findByRole('option', { name: /Storgatan 120/ })
      return late
    }

    it('flyttar inte raderna medan pekaren är över listan, utan när den lämnar den', async () => {
      const late = await start()
      const list = screen.getByRole('listbox').parentElement!
      fireEvent.pointerEnter(list)
      await late(withExact)
      await screen.findByRole('option', { name: /Storgatan 12(?!\d)/ })
      expect(rows()).toEqual(['Storgatan 120', 'Storgatan 121', 'Storgatan 12'])
      fireEvent.pointerLeave(list)
      await waitFor(() => expect(rows()).toEqual(['Storgatan 12', 'Storgatan 120', 'Storgatan 121']))
    })

    it('flyttar inte raderna medan en rad är markerad med tangentbordet', async () => {
      const late = await start()
      fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' })
      await late(withExact)
      await screen.findByRole('option', { name: /Storgatan 12(?!\d)/ })
      expect(rows()).toEqual(['Storgatan 120', 'Storgatan 121', 'Storgatan 12'])
      expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('ignorerar ett klick precis efter att raderna flyttat sig, men inte ett senare', async () => {
      const late = await start()
      await late(withExact)
      await waitFor(() => expect(rows()[0]).toBe('Storgatan 12'))
      fireEvent.click(screen.getAllByRole('option')[0])
      expect(screen.queryByText(/^Resultat/)).not.toBeInTheDocument()
      await new Promise((r) => setTimeout(r, 650))
      fireEvent.click(screen.getAllByRole('option')[0])
      expect(await screen.findByText('Resultat avesta/s-12')).toBeInTheDocument()
    })
  })

  it('sätter en sen exakt träff först, medan övriga rader står kvar i sin ordning', async () => {
    const shown = [a('s-120', 'Storgatan 120', 'Avesta'), a('s-121', 'Storgatan 121', 'Avesta')]
    const { late } = lateSearch({ addresses: shown, failed: [], areaPickers: [] })
    await userEvent.type(screen.getByRole('combobox'), 'Storgatan 12')
    await screen.findByRole('option', { name: /Storgatan 120/ })
    await late({ addresses: [...shown, a('s-12', 'Storgatan 12', 'Avesta')], failed: [], areaPickers: [], pending: false })
    await screen.findByRole('option', { name: /Storgatan 12(?!\d)/ })
    expect(screen.getAllByRole('option').map((o) => o.textContent?.match(/Storgatan \d+/)?.[0])).toEqual(['Storgatan 12', 'Storgatan 120', 'Storgatan 121'])
  })
})
