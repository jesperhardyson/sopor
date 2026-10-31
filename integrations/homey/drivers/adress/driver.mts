import Homey from 'homey'
import type SoporApp from '../../app.mjs'
import type { SoporSearchHit } from '../../lib/api.mjs'
import { parseQuery, placeKey, places, searchOutcome } from '../../lib/pairing.mjs'
import { ANY, fractionChoices } from '../../lib/schedule.mjs'
import type AddressDevice from './device.mjs'

/** Autocomplete-valet, där "Någon fraktion" blir null */
const chosenFraction = (choice?: { id: string }) => (!choice || choice.id === ANY ? null : choice.id)

interface CardArgs {
  device: AddressDevice
  fraktion?: { id: string }
  nar: string
}

function deviceName(hit: SoporSearchHit): string {
  return `${hit.street}, ${hit.locality || hit.kommun}${hit.detail ? ` – ${hit.detail}` : ''}`
}

export default class AddressDriver extends Homey.Driver {
  async onInit() {
    const autocomplete = async (query: string, args: CardArgs) => {
      const schedule = args.device.schedule
      return schedule ? fractionChoices(schedule, query, this.homey.__('anyFraction')) : []
    }

    const imorgon = this.homey.flow.getDeviceTriggerCard('hamtas_i_morgon')
    imorgon.registerArgumentAutocompleteListener('fraktion', autocomplete)
    imorgon.registerRunListener(async (args: CardArgs, state: { fractions: string[] }) => {
      const fraction = chosenFraction(args.fraktion)
      return fraction === null || state.fractions.includes(fraction)
    })

    const hamtas = this.homey.flow.getConditionCard('hamtas')
    hamtas.registerArgumentAutocompleteListener('fraktion', autocomplete)
    hamtas.registerRunListener(async (args: CardArgs) => args.device.isCollected(chosenFraction(args.fraktion), Number(args.nar)))

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

    // Svarar med resultatet, och med orterna när träffarna är för många. Vyn visar texten.
    session.setHandler('search', async (input: string) => {
      const { q, place } = parseQuery(input)
      const outcome = searchOutcome(await client.search(q), place)
      hits = outcome.hits
      return { result: outcome.result, places: outcome.result === 'places' ? places(hits) : [] }
    })

    // Användaren valde en ort bland många träffar
    session.setHandler('place', async (key: string) => {
      hits = hits.filter((hit) => placeKey(hit) === key)
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
