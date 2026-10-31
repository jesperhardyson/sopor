import Homey from 'homey'
import { createClient, type SoporClient } from './lib/api.mjs'

export default class SoporApp extends Homey.App {
  client!: SoporClient

  async onInit() {
    const userAgent = `Sopor-Homey/${this.manifest.version} (+https://sopor.hardyson.se)`
    this.client = createClient({ fetch: globalThis.fetch, userAgent })

    // Widgetens adressval: enheterna från drivrutinen "adress"
    this.homey.dashboards.getWidget('nasta-hamtning').registerSettingAutocompleteListener('adress', async (query: string) => {
      const q = query.toLocaleLowerCase('sv')
      return this.homey.drivers
        .getDriver('adress')
        .getDevices()
        .map((device) => ({ name: device.getName(), id: (device.getData() as { id: string }).id }))
        .filter((device) => device.name.toLocaleLowerCase('sv').includes(q))
    })
    this.log('Sopor startad')
  }
}
