import Homey from 'homey'
import { createClient, type SoporClient } from './lib/api.mjs'

export default class SoporApp extends Homey.App {
  client!: SoporClient

  async onInit() {
    const userAgent = `Sopor-Homey/${this.manifest.version} (+https://sopor.hardyson.se)`
    this.client = createClient({ fetch: globalThis.fetch, userAgent })
    this.log('Sopor startad')
  }
}
