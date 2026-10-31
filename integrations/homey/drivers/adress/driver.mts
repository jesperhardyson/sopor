import Homey from 'homey'
import type SoporApp from '../../app.mjs'
import type { SoporSearchHit, SoporSource } from '../../lib/api.mjs'
import { kommunChoices, parseKommun, searchOutcome } from '../../lib/pairing.mjs'
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
    let sources: SoporSource[] = []

    session.setHandler('kommuner', async () => {
      sources = await client.sources()
      return kommunChoices(sources)
    })

    // Svarar med ett SearchResult. Vyn visar texten.
    session.setHandler('search', async ({ q, kommun }: { q: string; kommun: string }) => {
      const choice = parseKommun(kommun)
      const source = sources.find((s) => s.id === choice?.source)
      if (!choice || !source) throw new Error(this.homey.__('pair.noKommun'))
      const outcome = searchOutcome(await client.search(q, choice.source), choice.kommun, source)
      hits = outcome.hits
      return outcome.result
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
