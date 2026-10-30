import { TriangleAlert } from 'lucide-react'

export function Deviation({ label = 'Flyttad · helgdag' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full bg-warn-bg py-1 pr-2.5 pl-2 text-[13px] font-extrabold text-warn">
      <TriangleAlert className="size-3.5" aria-hidden />
      {label}
    </span>
  )
}
