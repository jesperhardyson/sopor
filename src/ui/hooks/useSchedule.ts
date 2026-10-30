import { useCallback, useEffect, useState } from 'react'
import type { Schedule } from '@/domain/types'
import { getMunicipality } from '@/municipalities'
import { providerFor } from '@/providers/registry'

export type ScheduleState =
  | { status: 'loading' }
  | { status: 'ok'; schedule: Schedule }
  | { status: 'missing' }
  | { status: 'error' }

export function useSchedule(municipalityId: string, addressId: string) {
  const [state, setState] = useState<ScheduleState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const m = getMunicipality(municipalityId)
    if (!m) return
    const controller = new AbortController()
    setState({ status: 'loading' })
    providerFor(m)
      .getSchedule(addressId, controller.signal)
      .then(
        (schedule) => setState(schedule ? { status: 'ok', schedule } : { status: 'missing' }),
        () => !controller.signal.aborted && setState({ status: 'error' }),
      )
    return () => controller.abort()
  }, [municipalityId, addressId, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return [state, retry, attempt] as const
}
