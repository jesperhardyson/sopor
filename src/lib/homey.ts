import type { Address } from '@/domain/types'

/**
 * Det man skriver i Homey-appen för att hitta adressen: "gata, ort", som appen filtrerar på.
 * Ett områdes namn har ofta kommatecken, och appen läser allt efter det första som plats.
 */
export function homeySearchText(address: Address, byArea = false): string {
  if (byArea) return `${address.street.split(',')[0]}, ${address.kommun}`
  return `${address.street}, ${address.locality || address.kommun}`
}
