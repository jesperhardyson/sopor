import Homey from 'homey'
import type SoporApp from '../../app.mjs'
import { SoporError, type SoporSchedule } from '../../lib/api.mjs'
import { addDays, shortDate, stockholmTime, todayInStockholm } from '../../lib/dates.mjs'
import { isValidTime, reminderDue } from '../../lib/reminder.mjs'
import { changeText, collectedOn, daysToNext, fractionIds, fractionName, fractionsOn, nextText, scheduleChanges, summary, tomorrowText, withoutFractions } from '../../lib/schedule.mjs'

const TICK_MS = 15 * 60_000
const REMINDER_TICK_MS = 60_000
const REFRESH_MS = 6 * 3_600_000
const RETRY_MS = 3_600_000
const PREFIX = 'sopor_next.'
const BASE_CAPABILITIES = ['sopor_summary', 'sopor_days', 'sopor_tomorrow']

/** Fraktionerna som har en kryssruta "visa_<id>" i inställningarna. */
const KNOWN_FRACTIONS = ['rest', 'mat', 'papper', 'plast', 'glas', 'metall', 'tidningar', 'karl']

/** Triggerkorten som går vid en inställd tid, och dagarna framåt de gäller. */
const REMINDERS = [
  { card: 'hamtas_i_morgon', setting: 'paminnelsetid', fallback: '18:00', daysAhead: 1, store: 'reminded' },
  { card: 'hamtas_i_dag', setting: 'morgontid', fallback: '07:00', daysAhead: 0, store: 'remindedToday' },
]

/** Capability-id får bara innehålla a–z, 0–9 och _. */
const capabilityFor = (fraction: string) => PREFIX + fraction.toLowerCase().replace(/[^a-z0-9_]/g, '_')

export default class AddressDevice extends Homey.Device {
  private nextFetch = 0

  async onInit() {
    await this.migrate()
    this.homey.setInterval(() => this.tick(), TICK_MS)
    this.homey.setInterval(() => this.remind().catch(this.error), REMINDER_TICK_MS)
    await this.tick()
  }

  /** Äldre enheter saknar nyare rader. Fraktionsraderna läggs om så att de hamnar sist. */
  private async migrate() {
    const missing = BASE_CAPABILITIES.filter((capability) => !this.hasCapability(capability))
    if (!missing.length) return
    for (const capability of missing) await this.addCapability(capability)
    for (const capability of this.getCapabilities()) {
      if (capability.startsWith(PREFIX)) await this.removeCapability(capability)
    }
  }

  async onSettings({ newSettings }: { newSettings: Record<string, unknown> }) {
    for (const { setting } of REMINDERS) {
      const time = newSettings[setting]
      if (typeof time === 'string' && !isValidTime(time)) throw new Error(this.homey.__('device.badTime'))
    }
    // Inställningarna sparas när onSettings är klar. Rita om efter det, så att dolda fraktioner försvinner.
    this.homey.setTimeout(() => this.render().catch(this.error), 1000)
  }

  /** Triggerkorten "hämtas i morgon" och "hämtas i dag": en gång om dagen vid sin tid, om något hämtas. */
  private async remind() {
    const schedule = this.schedule
    if (!schedule) return
    const today = todayInStockholm()
    const now = stockholmTime()
    for (const reminder of REMINDERS) {
      const time = this.getSetting(reminder.setting) ?? reminder.fallback
      if (!reminderDue({ now, time, today, lastFired: this.getStoreValue(reminder.store) ?? null })) continue
      await this.setStoreValue(reminder.store, today)
      const fractions = fractionsOn(schedule, today, reminder.daysAhead)
      if (!fractions.length) continue
      const tokens = {
        fraktioner: fractions.map((id) => fractionName(schedule, id)).join(', '),
        antal: fractions.length,
        datum: shortDate(addDays(today, reminder.daysAhead)),
      }
      await this.homey.flow.getDeviceTriggerCard(reminder.card).trigger(this, tokens, { fractions })
    }
  }

  /** Triggern "Hämtschemat ändrades", en gång per fraktion vars nästa hämtning ändrats. */
  private async announceChanges(before: SoporSchedule, after: SoporSchedule) {
    const card = this.homey.flow.getDeviceTriggerCard('schema_andrat')
    for (const change of scheduleChanges(before, after, todayInStockholm())) {
      const tokens = {
        fraktion: fractionName(after, change.fraction),
        text: changeText(after, change),
        tidigare: change.from ? shortDate(change.from) : '',
        nytt: change.to ? shortDate(change.to) : '',
        orsak: change.reason ?? '',
      }
      await card.trigger(this, tokens, { fractions: [change.fraction] })
    }
  }

  /** Det sparade schemat utan de fraktioner som användaren dolt. */
  get schedule(): SoporSchedule | null {
    const schedule: SoporSchedule | null = this.getStoreValue('schedule') ?? null
    return schedule && withoutFractions(schedule, this.hiddenFractions(this.getSettings()))
  }

  private hiddenFractions(settings: Record<string, unknown>): string[] {
    return KNOWN_FRACTIONS.filter((id) => settings[`visa_${id}`] === false)
  }

  /** Hämtar när det är dags, och räknar alltid om texterna, så att "i dag" byts vid midnatt. */
  private async tick() {
    if (Date.now() >= this.nextFetch) await this.refresh().catch((error) => this.onFetchError(error))
    await this.render().catch(this.error)
  }

  /** Hämtar schemat direkt. Kastar vid fel, så att flödeskortet "Uppdatera schemat" visar det. */
  async refresh() {
    const { client } = this.homey.app as SoporApp
    const before = this.schedule
    await this.setStoreValue('schedule', await client.schedule(this.getStoreValue('url')))
    if (before) await this.announceChanges(before, this.schedule!).catch(this.error)
    this.nextFetch = Date.now() + REFRESH_MS
    await this.setAvailable()
    await this.render()
  }

  /** Behåller senaste svaret vid tillfälliga fel. Bara 404 och "inget svar än" gör enheten otillgänglig. */
  private async onFetchError(error: unknown) {
    this.nextFetch = Date.now() + RETRY_MS
    this.error('Hämtningen misslyckades:', error)
    if (error instanceof SoporError && error.status === 404) await this.setUnavailable(this.homey.__('device.gone'))
    else if (!this.schedule) await this.setUnavailable(this.homey.__('device.waiting'))
  }

  private async render() {
    const schedule = this.schedule
    if (!schedule) return
    const today = todayInStockholm()
    const wanted = new Map(fractionIds(schedule).map((id) => [capabilityFor(id), id]))

    for (const capability of this.getCapabilities()) {
      if (capability.startsWith(PREFIX) && !wanted.has(capability)) await this.removeCapability(capability)
    }
    for (const [capability, fraction] of wanted) {
      if (!this.hasCapability(capability)) {
        await this.addCapability(capability)
        const name = fractionName(schedule, fraction)
        await this.setCapabilityOptions(capability, { title: { en: name, sv: name } })
      }
      await this.setCapabilityValue(capability, nextText(schedule, today, fraction))
    }
    await this.setCapabilityValue('sopor_summary', summary(schedule, today))
    await this.setCapabilityValue('sopor_tomorrow', tomorrowText(schedule, today))
    await this.setCapabilityValue('sopor_days', daysToNext(schedule, today))
  }

  private requireSchedule(): SoporSchedule {
    const schedule = this.schedule
    if (!schedule) throw new Error(this.homey.__('device.waiting'))
    return schedule
  }

  isCollected(fraction: string | null, daysAhead: number): boolean {
    return collectedOn(this.requireSchedule(), todayInStockholm(), daysAhead, fraction)
  }

  whatIsCollected(daysAhead: number): { fraktioner: string; antal: number } {
    const schedule = this.requireSchedule()
    const fractions = fractionsOn(schedule, todayInStockholm(), daysAhead)
    return { fraktioner: fractions.map((id) => fractionName(schedule, id)).join(', '), antal: fractions.length }
  }
}
