import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router'
import { describe, expect, it } from 'vitest'
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

function setup() {
  render(
    <MemoryRouter>
      <Routes>
        <Route
          index
          element={
            <AddressSearch
              search={async (q) => searchAddresses(q, ADDRESSES)}
              suggest={async (q) => suggest(q, ADDRESSES)}
            />
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
    expect(listbox).toHaveClass('absolute')
  })

  it('ber lösenordshanterare att låta sökfältet vara', () => {
    const input = setup()
    expect(input).toHaveAttribute('data-1p-ignore')
    expect(input).toHaveAttribute('data-lpignore', 'true')
  })
})

