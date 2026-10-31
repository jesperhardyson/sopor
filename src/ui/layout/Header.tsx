import { Bookmark } from 'lucide-react'
import { Link } from 'react-router'
import { SITE } from '@/config'
import { GitHubMark } from '../components/GitHubMark'
import { Logo } from '../components/Logo'
import { ThemeToggle } from '../components/ThemeToggle'
import { MobileMenu } from './MobileMenu'

const navItem = 'inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[15px] font-bold text-text hover:bg-surface'

export function Header() {
  return (
    <header className="border-border md:border-b">
      <div className="mx-auto flex items-center justify-between px-5 py-3.5 md:px-8 md:py-4 lg:px-12 lg:py-[18px]">
        <Link to="/" aria-label="Sopor – till startsidan">
          <Logo />
        </Link>
        <nav className="flex items-center gap-2" aria-label="Huvudmeny">
          <div className="hidden items-center gap-2 md:flex">
            <Link to="/#mina-adresser" className={navItem}>
              <Bookmark className="size-[18px] text-primary" aria-hidden />
              Mina adresser
            </Link>
            <Link to="/om" className={navItem}>
              Om
            </Link>
            <Link to="/bidra" className={navItem}>
              Bidra
            </Link>
            <a href={`mailto:${SITE.contactEmail}`} className={navItem}>
              Kontakt
            </a>
            <span className="h-6 w-px bg-border" aria-hidden />
          </div>
          <a
            href={SITE.repoUrl}
            rel="noopener"
            aria-label="Sopor på GitHub"
            className="hidden size-11 items-center justify-center rounded-full border border-border text-text-2 hover:bg-surface md:inline-flex"
          >
            <GitHubMark />
          </a>
          <ThemeToggle />
          <MobileMenu />
        </nav>
      </div>
    </header>
  )
}
