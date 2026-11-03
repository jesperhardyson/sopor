import { ArrowUpRight, Building2 } from 'lucide-react'

/** Vem schemat kommer från, så att man vet vart man vänder sig när något är fel. */
export function SourceNote({ name, url }: { name: string; url: string }) {
  return (
    <section aria-label="Källa" className="flex flex-col gap-2.5 rounded-[20px] border border-border p-4">
      <div className="flex items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2">
          <Building2 className="size-[18px] text-text-2" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] text-text-2">Schemat kommer från</span>
          <a href={url} rel="noopener" className="inline-flex items-center gap-1 text-[15px] font-extrabold text-primary">
            {name}
            <ArrowUpRight className="size-4 shrink-0" aria-hidden />
          </a>
        </div>
      </div>
      <p className="text-[13px] leading-[1.4] text-text-2">
        Stämmer något inte? Kontakta {name}. Sopor är en inofficiell tjänst som visar deras schema.
      </p>
    </section>
  )
}
