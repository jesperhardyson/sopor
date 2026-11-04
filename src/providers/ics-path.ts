import { DEFAULT_REMINDER, type ReminderId } from '@/domain/reminders'

/** Förvalet ligger kvar på den korta adressen. Övriga val går via funktionen, eftersom de saknar statisk fil. */
export function icsPath(sourceId: string, addressId: string, reminder: ReminderId = DEFAULT_REMINDER): string {
  const prefix = reminder === DEFAULT_REMINDER ? '' : `${reminder}/`
  return `/ics/${sourceId}/${prefix}${encodeURIComponent(addressId)}.ics`
}
