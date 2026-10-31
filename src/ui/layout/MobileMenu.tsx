import { ArrowUpRight, Bookmark, ChevronRight, HeartHandshake, Info, Mail, Menu, type LucideIcon } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { SITE } from '@/config'
import { GitHubMark } from '../components/GitHubMark'

const row = 'flex h-14 items-center gap-3.5 border-b border-border px-1 text-[17px] font-bold text-text last:border-b-0'
const icon = 'size-5 shrink-0 text-text-2'

/** Menyknappen och bottenarket med sidorna, för skärmar under md (som i designen). */
export function MobileMenu() {
  const [open, setOpen] = useState(false)
  // Efter ett val ska fokus inte tillbaka till knappen, då hoppar sidan upp i stället för till ankaret.
  const navigated = useRef(false)

  function choose() {
    navigated.current = true
    setOpen(false)
  }

  function internal(to: string, label: string, Icon: LucideIcon, iconClass = icon) {
    return (
      <Link to={to} onClick={choose} className={row}>
        <Icon className={iconClass} aria-hidden />
        <span className="flex-1">{label}</span>
        <ChevronRight className="size-[18px] text-text-2" aria-hidden />
      </Link>
    )
  }

  function external(href: string, label: string, mark: ReactNode) {
    return (
      <a href={href} rel="noopener" onClick={choose} className={row}>
        {mark}
        <span className="flex-1">{label}</span>
        <ArrowUpRight className="size-[18px] text-text-2" aria-hidden />
      </a>
    )
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        aria-label="Öppna menyn"
        className="inline-flex size-11 items-center justify-center rounded-full border border-border text-text-2 transition-colors hover:bg-surface md:hidden"
      >
        <Menu className="size-5" aria-hidden />
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          if (navigated.current) e.preventDefault()
          navigated.current = false
        }}
        className="top-auto bottom-0 left-0 flex max-h-[92dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-3 overflow-y-auto rounded-t-[28px] rounded-b-none bg-surface px-5 pt-2.5 pb-7 text-text ring-0 sm:max-w-none"
      >
        <span className="mx-auto h-[5px] w-10 rounded-[3px] bg-border" aria-hidden />
        <DialogTitle className="text-[22px] font-extrabold tracking-[-0.3px] text-text">Meny</DialogTitle>
        <nav aria-label="Meny" className="flex flex-col">
          {internal('/#mina-adresser', 'Mina adresser', Bookmark, 'size-5 shrink-0 text-primary')}
          {internal('/om', 'Om', Info)}
          {internal('/bidra', 'Bidra', HeartHandshake)}
          {external(`mailto:${SITE.contactEmail}`, 'Kontakt', <Mail className={icon} aria-hidden />)}
          {external(SITE.repoUrl, 'GitHub', <GitHubMark className="shrink-0 text-text-2" />)}
        </nav>
        <DialogClose className="h-12 text-base font-extrabold text-text-2">Stäng</DialogClose>
      </DialogContent>
    </Dialog>
  )
}
