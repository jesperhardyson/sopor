/** Hur kommunens data hämtas. Ny leverantör = ny variant här + ny provider i src/providers. */
export type ProviderConfig = { type: 'static' } | { type: 'edp'; baseUrl: string }

export interface Municipality {
  /** Används i URL:er och datasökvägar, t.ex. "avesta" */
  id: string
  name: string
  shortName: string
  operator: { name: string; url: string }
  provider: ProviderConfig
}

export const MUNICIPALITIES: Municipality[] = [
  {
    id: 'avesta',
    name: 'Avesta kommun',
    shortName: 'Avesta',
    operator: {
      name: 'Avesta Vatten och Avfall',
      url: 'https://www.avestavatten.se',
    },
    provider: { type: 'static' },
  },
]

export function getMunicipality(id: string): Municipality | undefined {
  return MUNICIPALITIES.find((m) => m.id === id)
}
