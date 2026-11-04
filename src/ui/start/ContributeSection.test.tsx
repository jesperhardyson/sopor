import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { supportedKommuner } from '@/sources'
import { MunicipalityStatusList } from './ContributeSection'

describe('MunicipalityStatusList', () => {
  it('sammanfattar antalet kommuner och fäller ut namnen först på begäran', async () => {
    render(<MunicipalityStatusList />, { wrapper: MemoryRouter })
    const count = supportedKommuner().length
    expect(screen.getByText(`${count} kommuner finns nu`)).toBeInTheDocument()
    expect(screen.queryByText('Avesta kommun')).toBeNull()

    await userEvent.click(screen.getByRole('button', { name: 'Visa alla kommuner' }))
    expect(screen.getByRole('list', { name: 'Kommuner som finns nu' }).children).toHaveLength(count)
    expect(screen.getByText('Avesta kommun')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Dölj kommunerna' })).toHaveAttribute('aria-expanded', 'true')
  })

  it('visar nästa kommun, utan märkning för testdata när ingen källa har det', async () => {
    render(<MunicipalityStatusList />, { wrapper: MemoryRouter })
    await userEvent.click(screen.getByRole('button', { name: 'Visa alla kommuner' }))
    expect(screen.getByText('Avesta kommun').parentElement).not.toHaveTextContent('Testdata')
    expect(screen.getByText('Nästa kommun')).toBeInTheDocument()
  })

  it('kan börja utfälld', () => {
    render(<MunicipalityStatusList defaultOpen />, { wrapper: MemoryRouter })
    expect(screen.getByRole('button', { name: 'Dölj kommunerna' })).toHaveAttribute('aria-expanded', 'true')
  })
})
