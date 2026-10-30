import { FRACTIONS } from '@/domain/fractions'
import type { Bin } from '@/domain/types'
import { FractionIcon } from '../components/FractionIcon'

export function MyBins({ bins }: { bins: Bin[] }) {
  return (
    <section aria-labelledby="karl-rubrik" className="flex flex-col gap-3 pt-3">
      <h2 id="karl-rubrik" className="text-xl font-extrabold tracking-[-0.3px] text-text">
        Mina kärl
      </h2>
      <ul className="divide-y divide-border rounded-[20px] border border-border bg-surface">
        {bins.map((b) => (
          <li key={b.fraction} className="flex items-center gap-3.5 px-4 py-3.5">
            <FractionIcon fraction={b.fraction} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-base font-extrabold text-text">{FRACTIONS[b.fraction].name}</span>
              {b.frequencyText && <span className="text-sm text-text-2">{b.frequencyText}</span>}
            </span>
            {b.sizeLiters !== undefined && (
              <span className="rounded-lg bg-surface-2 px-2 py-1 text-sm font-extrabold text-text">{b.sizeLiters} l</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
