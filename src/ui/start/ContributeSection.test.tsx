import '@/test/show-hidden-sources'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { supportedKommuner } from '@/sources'
import { MunicipalityStatusList } from './ContributeSection'

describe('MunicipalityStatusList', () => {
  it('sammanfattar antalet kommuner och fäller ut namnen först på begäran', async () => {
    render(<MunicipalityStatusList />)
    const count = supportedKommuner().length
    expect(screen.getByText(`${count} kommuner finns nu`)).toBeInTheDocument()
    expect(screen.queryByText('Avesta kommun')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Visa alla kommuner' }))
    expect(screen.getByRole('list', { name: 'Kommuner som finns nu' }).children).toHaveLength(count)
    expect(screen.getByText('Avesta kommun')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dölj kommunerna' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('märker kommuner med testdata och visar nästa kommun', async () => {
    render(<MunicipalityStatusList />)
    await userEvent.click(screen.getByRole('button', { name: 'Visa alla kommuner' }))
    expect(screen.getByText('Avesta kommun').parentElement).toHaveTextContent('Testdata')
    expect(screen.getByText('Nästa kommun')).toBeInTheDocument()
  })
})
