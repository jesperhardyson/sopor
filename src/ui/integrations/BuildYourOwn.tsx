import { Braces } from 'lucide-react'
import { SITE } from '@/config'

/** Raden under integrationskorten som leder utvecklare till API-guiden. */
export function BuildYourOwn() {
  return (
    <p className="flex items-center gap-2.5 text-[15px]">
      <Braces className="size-[18px] shrink-0 text-text-2" aria-hidden />
      <span className="font-bold text-text">Bygger du något eget?</span>
      <a href={SITE.apiGuideUrl} rel="noopener" className="font-extrabold text-primary">
        Läs API-guiden →
      </a>
    </p>
  )
}
