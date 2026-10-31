import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { searchAddresses, suggest } from '@/domain/search'
import type { Address } from '@/domain/types'
import { AddressSearch } from './AddressSearch'

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

function setup(addresses = ADDRESSES) {
  onDeactivate = vi.fn()
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
                onDeactivate={onDeactivate}
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
})
