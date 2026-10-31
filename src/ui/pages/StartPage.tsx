import { MapPin } from 'lucide-react'
import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { supportedKommuner } from '@/sources'
import { FractionIcon } from '../components/FractionIcon'
import { SavedList } from '../saved/SavedList'
import { ContributeSection } from '../start/ContributeSection'
import { ServicesSection } from '../start/ServicesSection'
import { AddressSearch } from '../search/AddressSearch'

const HERO_FRACTIONS = ['rest', 'mat', 'papper', 'plast'] as const

function kommunLine(): string {
  const names = supportedKommuner().map((k) => k.name)
  if (names.length > 3) return `Just nu: ${names.length} kommuner. Fler kommer.`
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} och ${names.at(-1)}` : names[0]
  return `Just nu: ${list}. Fler kommuner kommer.`
}

/** Avstånd från fönstrets överkant till sökfältet i fokusläget: nära toppen på mobil, lugnare på desktop */
const focusTop = () => (window.matchMedia?.('(min-width: 1024px)').matches ? 96 : 16)

export function StartPage() {
  const searchRef = useRef<HTMLDivElement>(null)
  const [focus, setFocus] = useState(false)

  // Sidan scrollas i stället för att fältet flyttas med transform. Mobilen scrollar själv när
  // tangentbordet öppnas, och en transform ovanpå den scrollen skickade fältet ovanför skärmen.
  function activate() {
    if (focus || !searchRef.current) return
    setFocus(true)
    const top = searchRef.current.getBoundingClientRect().top + window.scrollY - focusTop()
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: Math.max(0, top), behavior: still ? 'instant' : 'smooth' })
  }

  function deactivate() {
    setFocus(false)
    ;(document.activeElement as HTMLElement | null)?.blur()
  }

  return (
    <>
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-6 px-5 pt-10 md:gap-7 md:px-0 md:pt-[72px] lg:max-w-[720px] lg:gap-9 lg:pt-[14vh] lg:pb-20">
      <div className="flex gap-2 lg:justify-center lg:gap-3" aria-hidden>
        {HERO_FRACTIONS.map((f) => (
          <FractionIcon key={f} fraction={f} className="size-9 rounded-[11px] [&_svg]:size-[18px] lg:size-12 lg:rounded-[14px] lg:[&_svg]:size-6" />
        ))}
      </div>
      <div className="flex flex-col gap-2.5 lg:gap-4 lg:text-center">
        <h1 className="text-[34px] leading-[1.1] font-extrabold tracking-[-0.8px] text-text md:text-[44px] lg:text-[60px] lg:tracking-[-1.5px]">
          När töms dina kärl?
        </h1>
        <p className="text-[17px] leading-[1.45] text-text-2 lg:mx-auto lg:max-w-[560px] lg:text-xl">
          Skriv in adressen så ser du vilket kärl som töms härnäst. Inget konto behövs.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        {focus && (
          <div
            data-testid="sok-fokus"
            aria-hidden
            onClick={deactivate}
            className="fixed inset-0 z-30 animate-in bg-bg/75 backdrop-blur-[3px] duration-200 fade-in motion-reduce:animate-none"
          />
        )}
        <div ref={searchRef} className={cn('relative', focus && 'z-40')}>
          <AddressSearch onActivate={activate} onDeactivate={deactivate} />
        </div>
        <p className="flex items-center gap-2 px-1 text-sm text-text-2 lg:justify-center lg:text-[15px]">
          <MapPin className="size-4 shrink-0 text-primary" aria-hidden />
          {kommunLine()}
        </p>
        <SavedList />
      </div>
    </div>
    <div data-testid="infoband" className="mt-12 border-t border-border bg-surface/45 lg:mt-4">
      <ServicesSection />
      <ContributeSection />
    </div>
    </>
  )
}
