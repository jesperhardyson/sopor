export type FractionId = 'rest' | 'mat' | 'papper' | 'plast' | 'glas' | 'metall'

export interface Address {
  id: string
  street: string
  locality: string
  sourceId: string
  /** Kommunens namn, t.ex. "Avesta kommun" */
  kommun: string
}

export interface Bin {
  fraction: FractionId
  sizeLiters?: number
  pickupsPerYear?: number
  frequencyText?: string
}

export interface PickupEvent {
  /** Lokalt datum, YYYY-MM-DD */
  date: string
  fractions: FractionId[]
  deviation?: { originalDate?: string; reason: string }
}

export interface Schedule {
  bins: Bin[]
  events: PickupEvent[]
  note?: string
  updatedAt: string
}

/** Schemat för en adress under ett års giltighetsperiod. */
export interface SchedulePart extends Schedule {
  validFrom: string
  validTo: string
}
