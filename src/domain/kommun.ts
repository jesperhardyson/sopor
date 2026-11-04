/**
 * Kommunens namn i löpande text: "Avesta kommun" → "Avesta". Namn på s behåller hela namnet,
 * eftersom genitivet i "Säters kommun" inte går att skilja från namnet i "Borås kommun".
 */
export function kommunInText(kommun: string): string {
  const short = kommun.replace(/ kommun$/, '')
  return short.endsWith('s') ? kommun : short
}
