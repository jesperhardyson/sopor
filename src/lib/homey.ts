import type { Address } from '@/domain/types'

/** Det man skriver i Homey-appen för att hitta adressen: "gata, ort", som appen filtrerar på. */
export function homeySearchText(address: Address): string {
  return `${address.street}, ${address.locality || address.kommun}`
}
