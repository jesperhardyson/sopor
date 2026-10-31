import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { TestDataBanner } from './TestDataBanner'

describe('TestDataBanner', () => {
  it.each(['/', '/uppsala/storgatan-2_uppsala-1', '/om'])('säger att sajten är en testversion på %s', (path) => {
    render(
      <MemoryRouter initialEntries={[path]}>
        <TestDataBanner />
      </MemoryRouter>,
    )
    expect(screen.getByRole('status')).toHaveTextContent(
      'Testversion – Sopor är under utveckling. Kolla alltid din kommuns hämtschema.',
    )
  })
})
