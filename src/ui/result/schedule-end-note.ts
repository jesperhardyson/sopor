import { formatFull } from '@/domain/dates'
import type { ScheduleEnd } from '@/domain/schedule'

/** Tomt läge när schemat har ett känt slut. Säger aldrig att adressen saknas, bara att schemat tagit slut. */
export function scheduleEndNote(end: ScheduleEnd | null, reason?: string): { title: string; text: string } | undefined {
  if (!end || end.kind === 'until') return undefined
  const date = formatFull(end.until)
  return {
    title:
      end.kind === 'no-more'
        ? `Inga fler hämtningar i schemat, som gäller till ${date}.`
        : `Schemat gällde till ${date}, och källan har inte publicerat nästa period än.`,
    text: reason ?? 'Nya tider visas här när källan publicerar dem.',
  }
}
