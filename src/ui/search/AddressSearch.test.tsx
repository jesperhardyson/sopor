import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { searchAddresses, suggest } from '@/domain/search'
import type { Address } from '@/domain/types'
import { reportMissingKommun } from '@/lib/analytics'
import { AddressSearch } from './AddressSearch'

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
                search={async (q) => ({ addresses: searchAddresses(q, addresses, 12), failed })}
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
          <AddressSearch search={async () => ({ addresses, failed: [] })} suggest={async () => []} />
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
    expect(screen.getByRole('link', { name: 'Tipsa om din kommun' })).toHaveAttribute('href', '/bidra')
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
    expect(reportMissingKommun).toHaveBeenCalledWith(['Hedemora kommun'])
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
          search={(q) => (q === 'sto' ? Promise.resolve({ addresses: [], failed: [] }) : new Promise(() => {}))}
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
          search={(q) => (q === 'storgx' ? Promise.resolve({ addresses: [], failed: [] }) : new Promise(() => {}))}
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
            onPartial?.({ addresses: searchAddresses(q, ADDRESSES), failed: [] })
            return new Promise((resolve) => (finish = () => resolve({ addresses: searchAddresses(q, ADDRESSES), failed: [] })))
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
            onPartial?.({ addresses: [first, second], failed: [] })
            return new Promise((resolve) => (finish = () => resolve({ addresses: [third, second, first], failed: [] })))
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
          search={(q) => new Promise((resolve) => (finish = () => resolve({ addresses: searchAddresses(q, ADDRESSES), failed: [] })))}
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
            q.startsWith('storg') ? Promise.resolve({ addresses: searchAddresses(q, ADDRESSES), failed: [] }) : new Promise(() => {})
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
          search={(q) => (q === 'storg' ? Promise.resolve({ addresses: searchAddresses(q, ADDRESSES), failed: [] }) : new Promise(() => {}))}
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
    const search = vi.fn(async () => ({ addresses: [], failed: [] }))
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
        <AddressSearch search={async () => ({ addresses: twins, failed: [] })} suggest={async () => []} />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'vasagatan 20')
    const options = await screen.findAllByRole('option')
    expect(within(options[0]).getByText('Byggnad 1')).toBeInTheDocument()
    expect(within(options[1]).getByText('Byggnad 2')).toBeInTheDocument()
  })

  it('visar ingen tom rad och ingen ensam punkt när orten saknas', async () => {
    const lidkoping = (id: string, street: string): Address => ({ id, street, locality: '', sourceId: 'lidkoping', kommun: 'Lidköpings kommun' })
    const hits = [lidkoping('storgatan-11-1', 'Storgatan 11'), a('avesta-storgatan-12', 'Storgatan 12', 'Avesta')]
    render(
      <MemoryRouter>
        <AddressSearch search={async () => ({ addresses: hits, failed: [] })} suggest={async () => []} />
      </MemoryRouter>,
    )
    await userEvent.type(screen.getByRole('combobox'), 'storgatan')
    const options = await screen.findAllByRole('option')
    expect(options[0]).toHaveTextContent(/^Storgatan 11Lidköpings kommun$/)
  })
})
