import { ArrowUpRight, Building2, Mail, MessageCircle, Phone, type LucideIcon } from 'lucide-react'
import type { SourceContact } from '@/sources'

function ContactLink({ href, icon: Icon, children }: { href: string; icon: LucideIcon; children: string }) {
  return (
    <li>
      <a href={href} rel="noopener" className="inline-flex min-h-11 items-center gap-2.5 text-[15px] font-bold break-all text-primary">
        <Icon className="size-[18px] shrink-0" aria-hidden />
        {children}
      </a>
    </li>
  )
}

/** Vem schemat kommer från och hur man når dem, så att man vet vart man vänder sig när något är fel. */
export function SourceNote({ name, url, contact }: { name: string; url: string; contact?: SourceContact }) {
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
      {contact && (
        <ul aria-label={`Kontakta ${name}`} className="flex flex-col">
          {contact.phone && (
            <ContactLink href={`tel:${contact.phone.number}`} icon={Phone}>
              {contact.phone.display}
            </ContactLink>
          )}
          {contact.email && (
            <ContactLink href={`mailto:${contact.email}`} icon={Mail}>
              {contact.email}
            </ContactLink>
          )}
          {contact.page && (
            <ContactLink href={contact.page} icon={MessageCircle}>
              Kontaktsida
            </ContactLink>
          )}
        </ul>
      )}
    </section>
  )
}
