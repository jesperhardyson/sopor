import { addDays } from './dates'
import { holidayOn } from './holidays'

/** Antal tömningar per år → dagar mellan tömningarna. Övriga värden räknas inte fram. */
const STEP_DAYS: Record<number, number> = { 52: 7, 26: 14, 13: 28 }

export interface ExpandedPickup {
  date: string
  /** false för datumet källan själv angett, true för framräknade */
  estimated: boolean
  warning?: string
}

/**
 * Räknar fram kommande tömningar ur nästa datum och antal tömningar per år (EDP m.fl.).
 * Framräknade datum som hamnar på en röd dag eller helgdagsafton får en varning men flyttas inte,
 * eftersom vi inte vet hur kommunen hanterar just den dagen.
 */
export function expandPickups(input: {
  next: string
  perYear: number
  /** ISO-veckodagar (1 = måndag … 7 = söndag), krävs för 104 tömningar per år */
  weekdays?: number[]
  months?: number
}): ExpandedPickup[] {
  const { next, perYear, weekdays, months = 12 } = input
  const end = addDays(next, Math.round(months * 30.44))
  const dates: string[] = []

  const step = STEP_DAYS[perYear]
  if (step) {
    for (let d = next; d <= end; d = addDays(d, step)) dates.push(d)
  } else if (perYear === 104 && weekdays && weekdays.length > 0) {
    for (let d = next; d <= end; d = addDays(d, 1)) {
      const iso = ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1
      if (d === next || weekdays.includes(iso)) dates.push(d)
    }
  } else {
    dates.push(next)
  }

  return dates.map((date) => {
    if (date === next) return { date, estimated: false }
    const holiday = holidayOn(date)
    return holiday
      ? { date, estimated: true, warning: `Infaller på ${holiday.name} – kan flyttas.` }
      : { date, estimated: true }
  })
}
