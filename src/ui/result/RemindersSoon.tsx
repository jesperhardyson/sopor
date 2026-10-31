import { BellRing } from 'lucide-react'

export function RemindersSoon() {
  return (
    <aside className="flex items-center gap-3.5 rounded-[20px] bg-earth-soft p-4">
      <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-surface text-earth">
        <BellRing className="size-5" aria-hidden />
      </span>
      <span className="flex flex-col gap-[3px]">
        <span className="flex items-center gap-2">
          <span className="text-base font-extrabold text-text">Påminnelser</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-extrabold whitespace-nowrap text-earth">Kommer snart</span>
        </span>
        <span className="text-sm leading-[1.4] text-text-2">
          Notis kvällen innan, e-post eller sms. Tills dess: lägg till i kalendern.
        </span>
      </span>
    </aside>
  )
}
