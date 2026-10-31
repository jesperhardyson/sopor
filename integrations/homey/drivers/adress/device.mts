import Homey from 'homey'
import type SoporApp from '../../app.mjs'
import { SoporError, type SoporSchedule } from '../../lib/api.mjs'
import { todayInStockholm } from '../../lib/dates.mjs'
import { collectedOn, fractionIds, fractionName, fractionsOn, nextText, summary } from '../../lib/schedule.mjs'

const TICK_MS = 15 * 60_000
const REFRESH_MS = 6 * 3_600_000
const RETRY_MS = 3_600_000
const PREFIX = 'sopor_next.'

/** Capability-id får bara innehålla a–z, 0–9 och _. */
const capabilityFor = (fraction: string) => PREFIX + fraction.toLowerCase().replace(/[^a-z0-9_]/g, '_')

export default class AddressDevice extends Homey.Device {
  private nextFetch = 0

  async onInit() {
    this.homey.setInterval(() => this.tick(), TICK_MS)
    await this.tick()
  }

  get schedule(): SoporSchedule | null {
    return this.getStoreValue('schedule') ?? null
  }

  /** Hämtar när det är dags, och räknar alltid om texterna, så att "i dag" byts vid midnatt. */
  private async tick() {
    if (Date.now() >= this.nextFetch) await this.refresh().catch((error) => this.onFetchError(error))
    await this.render().catch(this.error)
  }

  /** Hämtar schemat direkt. Kastar vid fel, så att flödeskortet "Uppdatera schemat" visar det. */
  async refresh() {
    const { client } = this.homey.app as SoporApp
    const schedule = await client.schedule(this.getStoreValue('url'))
    await this.setStoreValue('schedule', schedule)
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
