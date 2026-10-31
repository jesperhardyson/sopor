export type FractionId = 'rest' | 'mat' | 'papper' | 'plast' | 'glas' | 'metall' | 'tidningar' | 'karl'

export interface Address {
  id: string
  street: string
  locality: string
  sourceId: string
  /** Kommunens namn, t.ex. "Avesta kommun" */
  kommun: string
  /** Skiljer träffar med samma gata och ort åt, t.ex. "Byggnad 78838" i ett flerbostadshus */
  detail?: string
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
  /** Källans egen text per fraktion, t.ex. "Fyrfack 1" för kärl med flera fraktioner */
  labels?: Partial<Record<FractionId, string>>
  /** Framräknat ur källans frekvens, inte bekräftat av källan */
  estimated?: boolean
  /** T.ex. "Infaller på julafton – kan flyttas." */
  warning?: string
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
