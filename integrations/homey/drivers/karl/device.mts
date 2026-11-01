import Homey from 'homey'
import type SoporApp from '../../app.mjs'
import type { SoporSchedule } from '../../lib/api.mjs'
import { binDaysToNext, binFractions, binNextText, binSchedule, putOutDate, shouldReset } from '../../lib/bin.mjs'
import { addDays, languageOf, shortDate, stockholmTime, todayInStockholm } from '../../lib/dates.mjs'
import { REMINDER_TIMES, reminderDue } from '../../lib/reminder.mjs'
import { collectedOn, fractionName, fractionsOn } from '../../lib/schedule.mjs'
import type AddressDevice from '../adress/device.mjs'

const TICK_MS = 15 * 60_000
const REMINDER_TICK_MS = 60_000

/** Triggerkorten som går vid adressens tider. */
const REMINDERS = [
  { card: 'karl_toms_i_morgon', store: 'reminded', ...REMINDER_TIMES.tomorrow },
  { card: 'karl_toms_i_dag', store: 'remindedToday', ...REMINDER_TIMES.today },
]

type Lookup = { schedule: SoporSchedule; address: AddressDevice } | { error: string }

export default class BinDevice extends Homey.Device {
  private timers: NodeJS.Timeout[] = []

  /** Adressenheten säger till när den har hämtat ett nytt schema. */
  private onSchedule = (addressId: string) => {
    if (addressId === this.addressId) this.render().catch(this.error)
  }

  async onInit() {
    this.registerCapabilityListener('sopor_utstallt', (value: boolean) => this.putOut(value))
    this.app.schedules.on('schedule', this.onSchedule)
    this.timers = [
      this.homey.setInterval(() => this.render().catch(this.error), TICK_MS),
      this.homey.setInterval(() => this.remind().catch(this.error), REMINDER_TICK_MS),
    ]
    if (this.getCapabilityValue('sopor_utstallt') === null) await this.setCapabilityValue('sopor_utstallt', false)
    await this.render()
  }

  async onUninit() {
    this.app.schedules.off('schedule', this.onSchedule)
  }

  async onDeleted() {
    for (const timer of this.timers) this.homey.clearInterval(timer)
    this.timers = []
    this.app.schedules.off('schedule', this.onSchedule)
  }

  async onSettings({ newSettings }: { newSettings: Record<string, unknown> }) {
    if (!binFractions(newSettings, this.getStoreValue('fractions') ?? []).length) throw new Error(this.homey.__('karl.noFraction'))
    this.homey.setTimeout(() => this.render().catch(this.error), 1000)
  }

  private get app() {
    return this.homey.app as SoporApp
  }

  private get addressId(): string {
    return this.getStoreValue('address')
  }

  private get lang() {
    return languageOf(this.homey.i18n.getLanguage())
  }

  /** Adressenheten som kärlet står vid. Letas upp varje gång, så att kopplingen klarar att adressen läggs till igen. */
  private get address(): AddressDevice | null {
    const devices = this.homey.drivers.getDriver('adress').getDevices() as AddressDevice[]
    return devices.find((device) => (device.getData() as { id: string }).id === this.addressId) ?? null
  }

  /** Kärlets schema ur adressens, eller varför det saknas. */
  private lookup(): Lookup {
    const address = this.address
    if (!address) return { error: this.homey.__('karl.addressGone') }
    const stored = address.storedSchedule
    if (!stored) return { error: this.homey.__('device.waiting') }
    if (!address.getAvailable()) return { error: this.homey.__('device.gone') }
    const fractions = binFractions(this.getSettings(), this.getStoreValue('fractions') ?? [])
    return { schedule: binSchedule(stored, fractions), address }
  }

  private async render() {
    const found = this.lookup()
    if ('error' in found) return this.setUnavailable(found.error)
    await this.setAvailable()
    const today = todayInStockholm()
    if (shouldReset(this.getStoreValue('putOutFor') ?? null, today)) {
      await this.setStoreValue('putOutFor', null)
      await this.setCapabilityValue('sopor_utstallt', false)
    }
    await this.setCapabilityValue('sopor_next', binNextText(found.schedule, today, this.lang))
    await this.setCapabilityValue('sopor_days', binDaysToNext(found.schedule, today))
  }

  /** Triggerkorten "töms i morgon" och "töms i dag", vid adressens tider. */
  private async remind() {
    const found = this.lookup()
    if ('error' in found) return
    const { schedule, address } = found
    const today = todayInStockholm()
    const now = stockholmTime()
    for (const reminder of REMINDERS) {
      const time = address.getSetting(reminder.setting) ?? reminder.fallback
      if (!reminderDue({ now, time, today, lastFired: this.getStoreValue(reminder.store) ?? null })) continue
      await this.setStoreValue(reminder.store, today)
      const fractions = fractionsOn(schedule, today, reminder.daysAhead)
      if (!fractions.length) continue
      const tokens = {
        fraktioner: fractions.map((id) => fractionName(schedule, id)).join(', '),
        datum: shortDate(addDays(today, reminder.daysAhead), this.lang),
      }
      await this.homey.flow.getDeviceTriggerCard(reminder.card).trigger(this, tokens)
    }
  }

  /** Sparar vilken tömning "Utställt" gäller, så att det slås av natten efter. */
  private async putOut(on: boolean) {
    const was = this.getCapabilityValue('sopor_utstallt') === true
    const found = this.lookup()
    const today = todayInStockholm()
    await this.setStoreValue('putOutFor', on ? ('error' in found ? today : putOutDate(found.schedule, today)) : null)
    if (on && !was) await this.homey.flow.getDeviceTriggerCard('karl_stalldes_ut').trigger(this).catch(this.error)
  }

  /** Handlingskortet. Capability-lyssnaren går inte när appen själv sätter värdet. */
  async setPutOut(on: boolean) {
    await this.putOut(on)
    await this.setCapabilityValue('sopor_utstallt', on)
  }

  isPutOut(): boolean {
    return this.getCapabilityValue('sopor_utstallt') === true
  }

  isEmptied(daysAhead: number): boolean {
    const found = this.lookup()
    if ('error' in found) throw new Error(found.error)
    return collectedOn(found.schedule, todayInStockholm(), daysAhead, null)
  }
}
