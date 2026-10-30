import { cn } from '@/lib/utils'
import { LOGO_PATHS } from './logo-paths'

export function LogoSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 156 156" className={cn('size-8 fill-primary', className)} aria-hidden>
      {LOGO_PATHS.map((p) => (
        <path key={p.d} transform={`translate(${p.x} ${p.y})`} d={p.d} />
      ))}
    </svg>
  )
}

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoSymbol />
      <span className="font-brand text-[30px] leading-none font-semibold tracking-[-0.5px] text-text">sopor</span>
    </span>
  )
}
