import { Map, MapPinPlus } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

/** "A", "A och B", "A, B och C" */
const list = (names: string[]) => (names.length > 1 ? `${names.slice(0, -1).join(', ')} och ${names.at(-1)}` : names[0])

/** Designens "Kommunen stöds inte", utan e-postformuläret (se specen v1). */
export function MissingKommun({ kommuner, className }: { kommuner: string[]; className?: string }) {
  const one = kommuner.length === 1
  return (
    <div role="status" className={cn('flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5', className)}>
      <div className="flex items-start gap-3.5">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-soft text-brand-text">
          <Map className="size-6" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-xl font-extrabold tracking-[-0.3px] text-text">
            {one ? `Vi finns inte i ${kommuner[0]} än` : 'Vi finns inte där än'}
          </h2>
          <p className="text-[15px] leading-[1.45] text-text-2">
            {one ? 'Adressen' : 'Orten'} ligger i {list(kommuner)}, som Sopor inte har än. Berätta var kommunen publicerar
            sitt hämtschema, så kan vi lägga in den.
          </p>
        </div>
      </div>
      <ContributeLink className="self-start" />
    </div>
  )
}

export function ContributeLink({ className }: { className?: string }) {
  return (
    <Link
      to="/bidra"
      className={cn(
        'inline-flex items-center gap-2 rounded-xl bg-brand-soft px-3.5 py-2.5 text-[15px] font-extrabold text-brand-text',
        className,
      )}
    >
      <MapPinPlus className="size-4" aria-hidden />
      Tipsa om din kommun
    </Link>
  )
}
