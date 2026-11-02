/** "Storgatan 1, Slite", eller bara gatan när källan saknar ort (som Lidköping). */
export function streetAndLocality(a: { street: string; locality: string }): string {
  return a.locality ? `${a.street}, ${a.locality}` : a.street
}
