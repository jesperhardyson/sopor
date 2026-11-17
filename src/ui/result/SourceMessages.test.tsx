import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { SourceMessage } from '@/domain/messages'
import { SourceMessages } from './SourceMessages'

const base: SourceMessage = { id: 'rutter', title: 'Hämtrutterna läggs om', text: 'Schemat kan bli fel.', validFrom: '2026-11-17', validTo: '2027-03-31' }

describe('SourceMessages', () => {
  it('visar rubrik och text för varje meddelande', () => {
    render(<SourceMessages messages={[base, { ...base, id: 'annat', title: 'Annat besked' }]} sourceName="Avesta AB" />)
    expect(screen.getAllByRole('status')).toHaveLength(2)
    expect(screen.getByRole('heading', { level: 2, name: 'Hämtrutterna läggs om' })).toBeInTheDocument()
    expect(screen.getAllByText('Schemat kan bli fel.')).toHaveLength(2)
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('länkar till källans sida när den finns', () => {
    render(<SourceMessages messages={[{ ...base, url: 'https://avesta.test/nyheter' }]} sourceName="Avesta AB" />)
    expect(screen.getByRole('link', { name: 'Läs mer hos Avesta AB' })).toHaveAttribute('href', 'https://avesta.test/nyheter')
  })

  it('visar ingenting utan meddelanden', () => {
    const { container } = render(<SourceMessages messages={[]} sourceName="Avesta AB" />)
    expect(container).toBeEmptyDOMElement()
  })
})
