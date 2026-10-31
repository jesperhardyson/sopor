import { Link } from 'react-router'
import { SITE } from '@/config'

// Tryckytan växer osynligt till 44 px utan att sidfoten blir högre.
const link = 'relative font-bold after:absolute after:-inset-x-2 after:-inset-y-3 hover:text-text'

export function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[920px] flex-col gap-2.5 px-6 pt-5 pb-7 text-[13px] leading-normal text-text-2">
        <p>Inofficiell tjänst. Vid avvikelser gäller kommunens information.</p>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <Link to="/om" className={link}>
            Om
          </Link>
          <Link to="/bidra" className={link}>
            Bidra
          </Link>
          <a href={`mailto:${SITE.contactEmail}`} className={link}>
            Kontakt
          </a>
          <span>{SITE.host}</span>
        </div>
      </div>
    </footer>
  )
}
