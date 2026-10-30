import { Link } from 'react-router'
import { SITE } from '@/config'
import { MUNICIPALITIES } from '@/municipalities'

const link = 'font-bold hover:text-text'

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[920px] flex-col gap-2.5 px-6 pt-5 pb-7 text-[13px] leading-normal text-text-2">
        <p>Inofficiell tjänst. Vid avvikelser gäller kommunens information.</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link to="/om" className={link}>
            Om
          </Link>
          <a href={`mailto:${SITE.contactEmail}`} className={link}>
            Kontakt
          </a>
          {MUNICIPALITIES.map((m) => (
            <a key={m.id} href={m.operator.url} className={link} rel="noopener">
              {m.operator.name}
            </a>
          ))}
          <span>{SITE.host}</span>
        </div>
      </div>
    </footer>
  )
}
