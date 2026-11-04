import { useEffect, useState } from 'react'
import type { AreasIndexFile } from '@/data/static-format'
import { providerFor } from '@/providers/registry'
import type { Source } from '@/sources'

type State = { status: 'loading' } | { status: 'error' } | { status: 'ready'; index: AreasIndexFile }

/** Källans områden. Sidorna som använder den renderas om per källa, så källan byts aldrig under tiden. */
export function useAreas(source: Source | undefined): [State, () => void] {
  const [state, setState] = useState<State>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const provider = source && providerFor(source)
    if (!provider?.listAreas) return
    let active = true
    provider.listAreas().then(
      (index) => active && setState({ status: 'ready', index }),
      () => active && setState({ status: 'error' }),
    )
    return () => {
      active = false
    }
  }, [source, attempt])
  const retry = () => {
    setState({ status: 'loading' })
    setAttempt((a) => a + 1)
  }
  return [state, retry]
}
