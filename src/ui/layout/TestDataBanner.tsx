import { TriangleAlert } from 'lucide-react'

/** Allmän varning på alla sidor så länge Sopor är en testversion. */
export function TestDataBanner() {
  return (
    <p role="status" className="flex items-start justify-center gap-2 bg-warn-bg px-5 py-2.5 text-center text-sm font-semibold text-warn">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      Testversion – Sopor är under utveckling. Kolla alltid din kommuns hämtschema.
    </p>
  )
}
