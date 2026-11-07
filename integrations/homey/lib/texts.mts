// Texterna som appen räknar fram själv, på svenska och engelska. Avfallstypernas namn kommer från Sopor och är alltid svenska.

export type Lang = 'sv' | 'en'

export const TEXTS = {
  sv: {
    weekdays: ['sön', 'mån', 'tis', 'ons', 'tors', 'fre', 'lör'],
    months: ['jan', 'feb', 'mars', 'apr', 'maj', 'juni', 'juli', 'aug', 'sep', 'okt', 'nov', 'dec'],
    today: 'i dag',
    tomorrow: 'i morgon',
    dayAfterTomorrow: 'i övermorgon',
    inDays: (days: number) => `om ${days} dagar`,
    estimated: 'beräknat',
    none: 'Inga kommande hämtningar',
    nothing: 'Inget',
    moved: (name: string, from: string, to: string) => `${name} flyttas från ${from} till ${to}`,
    cancelled: (name: string, date: string) => `${name} hämtas inte ${date}`,
    added: (name: string, date: string) => `${name} hämtas ${date}`,
  },
  en: {
    weekdays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    months: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    today: 'today',
    tomorrow: 'tomorrow',
    dayAfterTomorrow: 'in 2 days',
    inDays: (days: number) => `in ${days} days`,
    estimated: 'estimated',
    none: 'No upcoming collections',
    nothing: 'Nothing',
    moved: (name: string, from: string, to: string) => `${name} moves from ${from} to ${to}`,
    cancelled: (name: string, date: string) => `${name} is not collected on ${date}`,
    added: (name: string, date: string) => `${name} is collected on ${date}`,
  },
} satisfies Record<Lang, unknown>

/** Homeys språk till appens: svenska för svenska, engelska för allt annat. */
export const languageOf = (language: string): Lang => (language === 'sv' ? 'sv' : 'en')
