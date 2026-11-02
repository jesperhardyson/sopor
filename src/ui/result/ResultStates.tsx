import { LoaderCircle, Map, TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

export const Skeleton = ({ className }: { className: string }) => (
  <span className={cn('block animate-pulse rounded-lg bg-surface-2', className)} aria-hidden />
)

export function LoadingState({ sourceName }: { sourceName: string }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3.5 rounded-3xl bg-surface p-5" aria-hidden>
        <div className="flex justify-between">
          <Skeleton className="h-3.5 w-[120px]" />
          <Skeleton className="h-[26px] w-[90px] rounded-full" />
        </div>
        <Skeleton className="h-[18px] w-[90px]" />
        <Skeleton className="h-10 w-[220px]" />
        <div className="flex gap-2">
          <Skeleton className="h-[34px] w-[110px] rounded-full" />
          <Skeleton className="h-[34px] w-[100px] rounded-full" />
        </div>
      </div>
      <Skeleton className="h-14 w-full rounded-[14px]" />
      <p role="status" className="flex items-center justify-center gap-2 text-sm font-semibold text-text-2">
        <LoaderCircle className="size-[18px] animate-spin text-primary" aria-hidden />
        Hämtar schemat från {sourceName}…
      </p>
      <div className="flex flex-col gap-3" aria-hidden>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3.5">
            <Skeleton className="h-16 w-14 rounded-[14px]" />
            <div className="flex flex-1 flex-col justify-center gap-2">
              <Skeleton className="h-4 w-3/5" />
              <Skeleton className="h-4 w-2/5" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3.5 rounded-[20px] border border-border bg-surface p-5">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-warn-bg text-warn">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-extrabold tracking-[-0.3px] text-text">Schemat gick inte att hämta</h2>
        <p className="text-[15px] leading-[1.45] text-text-2">Kontrollera anslutningen och försök igen.</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-[14px] border border-border bg-surface px-4 py-3 text-[15px] font-bold text-text"
      >
        Försök igen
      </button>
    </div>
  )
}

/** Källan svarar inte, så sidan visar schemat som sparades senast för den sparade adressen. */
export function StaleNotice({
  sourceName,
  fetchedAt,
  onRetry,
}: {
  sourceName: string
  fetchedAt: { day: number; month: string }
  onRetry: () => void
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-warn-bg px-4 py-3"
    >
      <p className="flex min-w-0 flex-1 items-start gap-2 text-[15px] font-semibold text-warn">
        <TriangleAlert className="mt-0.5 size-[18px] shrink-0" aria-hidden />
        {sourceName} svarar inte just nu. Du ser schemat som hämtades {fetchedAt.day} {fetchedAt.month}.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-bold text-text"
      >
        Försök igen
      </button>
    </div>
  )
}

export function UnsupportedState() {
  return (
    <div className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
      <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-brand-soft text-brand-text">
        <Map className="size-6" aria-hidden />
      </span>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-xl font-extrabold tracking-[-0.3px] text-text">Den här adressen finns inte hos Sopor</h2>
        <p className="text-[15px] leading-[1.45] text-text-2">
          Länken pekar på en kommun eller ett avfallsbolag som Sopor inte har än. Sök på din adress nedan.
        </p>
      </div>
    </div>
  )
}

/** Inga kommande tömningar. En källa kan ha en egen förklaring, som Stockholm för lägenheter. */
export function EmptyState({ note }: { note?: { title: string; text: string } }) {
  return (
    <div className="rounded-[20px] border border-border bg-surface p-5">
      <h2 className="text-lg font-extrabold text-text">{note?.title ?? 'Inga kommande tömningar i schemat än'}</h2>
      <p className="mt-1 text-[15px] leading-[1.45] text-text-2">
        {note?.text ?? 'Nästa års schema läggs in så snart kommunen har publicerat det.'}
      </p>
    </div>
  )
}
