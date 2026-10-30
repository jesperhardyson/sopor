import { TriangleAlert } from 'lucide-react'
import { MUNICIPALITIES, type Municipality } from '@/municipalities'

/** Varning överst på sajten så länge någon kommun visar påhittad data. */
export function TestDataBanner({ municipalities = MUNICIPALITIES }: { municipalities?: Municipality[] }) {
  const affected = municipalities.filter((m) => m.testData)
  if (affected.length === 0) return null
  return (
    <p role="status" className="flex items-start justify-center gap-2 bg-warn-bg px-5 py-2.5 text-center text-sm font-semibold text-warn">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        Testversion – datumen är påhittade och gäller inte. Kolla hämtschemat hos{' '}
        {affected.map((m, i) => (
          <span key={m.id}>
            {i > 0 && ', '}
            <a href={m.operator.url} rel="noopener" className="underline underline-offset-2">
              {m.operator.name}
            </a>
          </span>
        ))}
        .
      </span>
    </p>
  )
}
