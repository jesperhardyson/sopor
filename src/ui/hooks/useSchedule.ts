import { useCallback, useEffect, useState } from 'react'
import type { Address, Schedule } from '@/domain/types'
import { loadStoredSchedule } from '@/lib/storage'
import { getSource } from '@/sources'
import { providerFor } from '@/providers/registry'

export type ScheduleState =
  | { status: 'loading' }
  | { status: 'ok'; schedule: Schedule }
  | { status: 'missing' }
  | { status: 'error' }
  /** Källan svarar inte; schemat som sparades senast för den sparade adressen */
  | { status: 'stale'; schedule: Schedule; address: Address; fetchedAt: string }
  /** Schemat som sparades senast, medan källan frågas igen */
  | { status: 'cached'; schedule: Schedule; address: Address; fetchedAt: string }

/** Sparade adresser visas direkt med det senaste schemat; övriga får vänta på källan. */
function initial(sourceId: string, addressId: string): ScheduleState {
  const stored = loadStoredSchedule(sourceId, addressId)
  return stored ? { status: 'cached', ...stored } : { status: 'loading' }
}

export function useSchedule(sourceId: string, addressId: string) {
  const [state, setState] = useState(() => initial(sourceId, addressId))
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const m = getSource(sourceId)
    if (!m) return
    const controller = new AbortController()
    setState(initial(sourceId, addressId))
    providerFor(m)
      .getSchedule(addressId, controller.signal)
      .then(
        (schedule) => setState(schedule ? { status: 'ok', schedule } : { status: 'missing' }),
        () => {
          if (controller.signal.aborted) return
          const stored = loadStoredSchedule(sourceId, addressId)
          setState(stored ? { status: 'stale', ...stored } : { status: 'error' })
        },
      )
    return () => controller.abort()
  }, [sourceId, addressId, attempt])

  const retry = useCallback(() => setAttempt((a) => a + 1), [])
  return [state, retry, attempt] as const
}
