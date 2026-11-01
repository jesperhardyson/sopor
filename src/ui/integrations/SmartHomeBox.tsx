import { ArrowUpRight, Braces, HouseWifi } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { SITE } from '@/config'
import type { Address } from '@/domain/types'
import { apiUrl, defaultOrigin } from '@/lib/calendar-links'
import { homeySearchText } from '@/lib/homey'
import { StatusBadge } from './StatusBadge'

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Utan urklipp får man markera texten själv.
    }
  }

  return (
    <button type="button" onClick={copy} aria-label={label} className="shrink-0 text-sm font-extrabold text-primary">
      {copied ? 'Kopierad' : 'Kopiera'}
    </button>
  )
}

function Row({ name, status, soon, href, action, actionLabel, children }: {
  name: string
  status: string
  soon?: boolean
  href: string
  action: string
  actionLabel: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-2 rounded-[14px] bg-surface-2 px-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span className="text-[15px] font-extrabold whitespace-nowrap text-text">{name}</span>
          <StatusBadge soon={soon} onSurface2>{status}</StatusBadge>
        </span>
        <a href={href} rel="noopener" aria-label={actionLabel} className="inline-flex items-center gap-1 text-sm font-extrabold text-primary">
          {action}
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </div>
      {children}
    </div>
  )
}

/** Adressidans ruta om Homey och Home Assistant, med API-länken för utvecklare längst ner. */
export function SmartHomeBox({ address, origin = defaultOrigin() }: { address: Address; origin?: string }) {
  const search = homeySearchText(address)
  const api = apiUrl(address, origin)

  return (
    <aside className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-4">
      <div className="flex items-center gap-3.5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-2 text-text">
          <HouseWifi className="size-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-[3px]">
          <h2 className="text-base font-extrabold text-text">Smarta hem</h2>
          <p className="text-sm leading-[1.4] text-text-2">Få en påminnelse kvällen innan, i Homey eller Home Assistant.</p>
        </div>
      </div>
      <Row name="Homey" status="Testversion" href={SITE.homeyAppUrl} action="Installera" actionLabel="Installera Sophämtning i Homey">
        <p className="text-[13px] text-text-2">Sök på den här adressen i appen Sophämtning:</p>
        <div className="flex items-center justify-between gap-2 rounded-[10px] bg-surface px-3 py-2">
          <span className="min-w-0 text-sm font-bold break-words text-text">{search}</span>
          <CopyButton text={search} label="Kopiera söktexten" />
        </div>
      </Row>
      <Row name="Home Assistant" status="Kommer snart" soon href={SITE.homeAssistantGuideUrl} action="Guide" actionLabel="Guide för Home Assistant">
        <p className="text-[13px] text-text-2">Tills dess: en REST-sensor med adressens API-länk.</p>
      </Row>
      <div className="flex items-center gap-2 px-0.5">
        <Braces className="size-4 shrink-0 text-text-2" aria-hidden />
        <a href={api} rel="noopener" className="min-w-0 flex-1 text-sm font-bold text-text-2">
          API-länk för utvecklare
        </a>
        <CopyButton text={api} label="Kopiera API-länken" />
      </div>
    </aside>
  )
}
