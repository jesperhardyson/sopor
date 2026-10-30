import type { Address, Schedule } from '@/domain/types'

/**
 * Datakällan för en kommun. UI:t pratar bara med det här gränssnittet och vet
 * aldrig var datan kommer ifrån (statiska filer, EDP eller annat).
 */
export interface WasteProvider {
  searchAddresses(query: string, signal?: AbortSignal): Promise<Address[]>
  /** Förslag för "Menade du:" när sökningen inte gav träff */
  suggestAddresses(query: string, signal?: AbortSignal): Promise<Address[]>
  getAddress(addressId: string, signal?: AbortSignal): Promise<Address | null>
  getSchedule(addressId: string, signal?: AbortSignal): Promise<Schedule | null>
  /** När kommunens data senast uppdaterades (YYYY-MM-DD), om det är känt */
  dataUpdatedAt(signal?: AbortSignal): Promise<string | null>
  /** Sökväg till adressens kalenderfil, relativ till sajten */
  icsUrl(addressId: string): string
}
