import { useCallback, useEffect, useState } from 'react'
import type { Schedule } from '@/domain/types'
import { getSource } from '@/sources'
import { providerFor } from '@/providers/registry'

export type ScheduleState =
  | { status: 'loading' }
  | { status: 'ok'; schedule: Schedule }
  | { status: 'missing' }
  | { status: 'error' }

export function useSchedule(sourceId: string, addressId: string) {
  const [state, setState] = useState<ScheduleState>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const m = getSource(sourceId)
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
  }, [sourceId, addressId, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return [state, retry, attempt] as const
}
