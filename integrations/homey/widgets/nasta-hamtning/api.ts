import type Homey from 'homey'
import type AddressDevice from '../../drivers/adress/device.mjs'
import { todayInStockholm } from '../../lib/dates.mjs'
import { widgetRows, type WidgetRow } from '../../lib/widget.mjs'

export default {
  /** Raderna för vald adress (`?id=<källa>/<adress-id>`), eller för den första om inget är valt. */
  async getRows({ homey, query }: { homey: Homey.Homey; query: { id?: string } }): Promise<{ address: string | null; rows: WidgetRow[] }> {
    const devices = homey.drivers.getDriver('adress').getDevices() as AddressDevice[]
    const device = devices.find((d) => d.getData().id === query.id) ?? devices[0]
    const schedule = device?.schedule
    return { address: device?.getName() ?? null, rows: schedule ? widgetRows(schedule, todayInStockholm()) : [] }
  },
}
