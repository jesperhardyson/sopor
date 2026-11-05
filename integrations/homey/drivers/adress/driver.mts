import Homey from 'homey'
import type SoporApp from '../../app.mjs'
import type { SoporSearchHit } from '../../lib/api.mjs'
import { areaLinks, findHits, kommunNames, notices, parseQuery, placeCovered, placeKey, places } from '../../lib/pairing.mjs'
import { ANY, fractionChoices } from '../../lib/schedule.mjs'
import type AddressDevice from './device.mjs'

/** Autocomplete-valet, där "Någon fraktion" blir null */
const chosenFraction = (choice?: { id: string }) => (!choice || choice.id === ANY ? null : choice.id)

interface CardArgs {
  device: AddressDevice
  fraktion?: { id: string }
  nar: string
  dagar: number
}

/** Fraktionsfiltret i triggerkorten: "Någon fraktion" släpper igenom allt. */
const matchesFraction = (args: CardArgs, state: { fractions: string[] }) => {
  const fraction = chosenFraction(args.fraktion)
  return fraction === null || state.fractions.includes(fraction)
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

    for (const id of ['hamtas_i_morgon', 'hamtas_i_dag', 'schema_andrat']) {
      const trigger = this.homey.flow.getDeviceTriggerCard(id)
      trigger.registerArgumentAutocompleteListener('fraktion', autocomplete)
      trigger.registerRunListener(async (args: CardArgs, state: { fractions: string[] }) => matchesFraction(args, state))
    }

    const hamtas = this.homey.flow.getConditionCard('hamtas')
    hamtas.registerArgumentAutocompleteListener('fraktion', autocomplete)
    hamtas.registerRunListener(async (args: CardArgs) => args.device.isCollected(chosenFraction(args.fraktion), Number(args.nar)))

    const hamtasOm = this.homey.flow.getConditionCard('hamtas_om')
    hamtasOm.registerArgumentAutocompleteListener('fraktion', autocomplete)
    hamtasOm.registerRunListener(async (args: CardArgs) => args.device.isCollected(chosenFraction(args.fraktion), Math.round(args.dagar)))

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
    // Kommunerna hämtas en gång per parning. Utan svar visar vyn bara länken.
    const kommuner = client.sources().then(kommunNames, () => [])

    session.setHandler('coverage', async () => ({ count: (await kommuner).length }))

    // Svarar med resultatet, och med orterna när träffarna är för många. Vyn visar texten.
    // Utan träff säger `covered` om orten är en kommun som finns, så att vyn vet om det är stavningen.
    session.setHandler('search', async (input: string) => {
      const { q, place } = parseQuery(input)
      const outcome = await findHits(client, q, place)
      hits = outcome.hits
      const names = await kommuner
      return {
        result: outcome.result,
        places: outcome.result === 'places' ? places(hits) : [],
        notices: outcome.result === 'found' || outcome.result === 'areas' ? notices(hits) : [],
        areaLinks: areaLinks(hits),
        street: q,
        place,
        covered: place && names.length ? placeCovered(names, place) : null,
      }
    })

    // Användaren valde en ort bland många träffar. Svarar med varningarna för den ortens träffar.
    session.setHandler('place', async (key: string) => {
      hits = hits.filter((hit) => placeKey(hit) === key)
      return { notices: notices(hits), areaLinks: areaLinks(hits) }
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
