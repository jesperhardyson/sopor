import { randomUUID } from 'node:crypto'
import Homey from 'homey'
import { binId, iconPath, suggestedIcon, suggestedName } from '../../lib/bin.mjs'
import { KNOWN_FRACTIONS, fractionIds, fractionName } from '../../lib/schedule.mjs'
import type AddressDevice from '../adress/device.mjs'
import type BinDevice from './device.mjs'

interface CardArgs {
  device: BinDevice
  nar: string
  lage: string
}

interface NewBin {
  fractions: string[]
  name: string
  icon: string
}

const idOf = (device: Homey.Device) => (device.getData() as { id: string }).id

export default class BinDriver extends Homey.Driver {
  async onInit() {
    this.homey.flow.getConditionCard('karl_toms').registerRunListener(async (args: CardArgs) => args.device.isEmptied(Number(args.nar)))
    this.homey.flow.getConditionCard('karl_utstallt').registerRunListener(async (args: CardArgs) => args.device.isPutOut())
    this.homey.flow.getActionCard('karl_satt_utstallt').registerRunListener(async (args: CardArgs) => {
      await args.device.setPutOut(args.lage === 'ute')
    })
  }

  async onPair(session: Homey.Driver.PairSession) {
    const addresses = () => this.homey.drivers.getDriver('adress').getDevices() as AddressDevice[]
    let address: AddressDevice | undefined

    // Vyn "adress": adressenheterna, och om de har hunnit hämta schemat
    session.setHandler('addresses', async () =>
      addresses().map((device) => ({ id: idOf(device), name: device.getName(), ready: Boolean(device.storedSchedule) })),
    )

    session.setHandler('address', async (id: string) => {
      address = addresses().find((device) => idOf(device) === id)
    })

    const schedule = () => {
      const stored = address?.storedSchedule
      if (!stored) throw new Error(this.homey.__('pairKarl.notReady'))
      return stored
    }

    // Vyn "fraktioner": adressens avfallstyper i schemats ordning
    session.setHandler('fractions', async () => {
      const stored = schedule()
      return fractionIds(stored).map((id) => ({ id, name: fractionName(stored, id) }))
    })

    session.setHandler('suggest', async (fractions: string[]) => ({
      name: suggestedName(schedule(), fractions),
      icon: suggestedIcon(fractions),
    }))

    // Enheten som vyn skapar med Homey.createDevice
    session.setHandler('device', async ({ fractions, name, icon }: NewBin) => {
      if (!address || !fractions.length) throw new Error(this.homey.__('karl.noFraction'))
      const addressId = idOf(address)
      return {
        name: name.trim() || suggestedName(schedule(), fractions),
        data: { id: binId(addressId, randomUUID().replaceAll('-', '').slice(0, 8)) },
        store: { address: addressId, fractions, putOutFor: null },
        settings: Object.fromEntries(KNOWN_FRACTIONS.map((id) => [`ingar_${id}`, fractions.includes(id)])),
        icon: iconPath(icon),
      }
    })
  }
}
