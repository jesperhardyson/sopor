import Homey from 'homey'
import type SoporApp from '../../app.mjs'
import type { SoporSearchHit } from '../../lib/api.mjs'
import { ANY, fractionChoices } from '../../lib/schedule.mjs'
import type AddressDevice from './device.mjs'

interface CardArgs {
  device: AddressDevice
  fraktion?: { id: string }
  nar: string
}

function deviceName(hit: SoporSearchHit): string {
  return `${hit.street}, ${hit.locality}${hit.detail ? ` – ${hit.detail}` : ''}`
}

export default class AddressDriver extends Homey.Driver {
  async onInit() {
    const hamtas = this.homey.flow.getConditionCard('hamtas')
    hamtas.registerArgumentAutocompleteListener('fraktion', async (query: string, args: CardArgs) => {
      const schedule = args.device.schedule
      return schedule ? fractionChoices(schedule, query, this.homey.__('anyFraction')) : []
    })
    hamtas.registerRunListener(async (args: CardArgs) => {
      const fraction = !args.fraktion || args.fraktion.id === ANY ? null : args.fraktion.id
      return args.device.isCollected(fraction, Number(args.nar))
    })

    this.homey.flow.getActionCard('uppdatera').registerRunListener(async (args: CardArgs) => {
      await args.device.refresh()
    })
    this.homey.flow.getActionCard('vad_hamtas').registerRunListener(async (args: CardArgs) => {
      return args.device.whatIsCollected(Number(args.nar))
    })
  }

  async onPair(session: Homey.Driver.PairSession) {
    const { client } = this.homey.app as SoporApp
    let hits: SoporSearchHit[] = []

    // Svarar 'found', 'failed' (källor svarade inte) eller 'none'. Vyn visar texten.
    session.setHandler('search', async (q: string) => {
      const result = await client.search(q)
      hits = result.addresses
      if (hits.length) return 'found'
      return result.failed.length ? 'failed' : 'none'
    })

    session.setHandler('list_devices', async () =>
      hits.map((hit) => ({
        name: deviceName(hit),
        data: { id: `${hit.source}/${hit.id}` },
        store: { url: hit.url },
      })),
    )
  }
}
