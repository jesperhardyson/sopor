import { TriangleAlert } from 'lucide-react'
import { useLocation } from 'react-router'
import { SOURCES, type Source } from '@/sources'

const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} och ${names.at(-1)}` : names[0])

/**
 * Varning så länge någon källa visar påhittad data. Döljs på resultatsidor för källor med
 * riktiga data, så att den inte gäller fel adress.
 */
export function TestDataBanner({ sources = SOURCES }: { sources?: Source[] }) {
  const { pathname } = useLocation()
  const current = sources.find((s) => s.id === pathname.split('/')[1])
  if (current && !current.testData) return null
  const kommuner = [...new Set(sources.filter((s) => s.testData).flatMap((s) => s.kommuner.map((k) => k.name)))]
  if (kommuner.length === 0) return null
  return (
    <p role="status" className="flex items-start justify-center gap-2 bg-warn-bg px-5 py-2.5 text-center text-sm font-semibold text-warn">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      Testversion – datumen för {list(kommuner)} är påhittade och gäller inte. Kolla alltid din kommuns hämtschema.
    </p>
  )
}
