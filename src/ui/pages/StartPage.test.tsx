import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { StartPage } from './StartPage'

vi.mock('@/providers/registry', () => ({
  searchAll: async () => [],
  suggestAll: async () => [],
  providerFor: () => ({ getSchedule: async () => null }),
}))

function setup() {
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  return screen.getByRole('combobox')
}

describe('StartPage fokusläge', () => {
  it('tonar ner resten av sidan när man klickar i sökfältet', async () => {
    const input = setup()
    expect(screen.queryByTestId('sok-fokus')).toBeNull()
    await userEvent.click(input)
    expect(screen.getByTestId('sok-fokus')).toBeInTheDocument()
  })

  it('avslutas med Esc', async () => {
    const input = setup()
    await userEvent.click(input)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByTestId('sok-fokus')).toBeNull()
    expect(input).not.toHaveFocus()
  })

  it('avslutas när man klickar på den tonade ytan', async () => {
    const input = setup()
    await userEvent.click(input)
    await userEvent.click(screen.getByTestId('sok-fokus'))
    expect(screen.queryByTestId('sok-fokus')).toBeNull()
  })
})
