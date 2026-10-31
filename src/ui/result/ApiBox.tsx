import { ArrowUpRight, Braces, Link } from 'lucide-react'
import { useState } from 'react'
import { SITE } from '@/config'
import type { Address } from '@/domain/types'
import { apiUrl, defaultOrigin } from '@/lib/calendar-links'

export function ApiBox({ address, origin = defaultOrigin() }: { address: Address; origin?: string }) {
  const url = apiUrl(address, origin)
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Utan urklipp får man markera adressen själv.
    }
  }

  return (
    <aside className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-4">
      <div className="flex items-center gap-3.5">
        <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-[14px] bg-surface-2 text-text">
          <Braces className="size-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-[3px]">
          <h2 className="text-base font-extrabold text-text">API</h2>
          <p className="text-sm leading-[1.4] text-text-2">
            Hämta adressens schema som JSON, till exempel i Home Assistant eller Homey.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2.5 rounded-[14px] bg-surface-2 px-3.5 py-3">
        <Link className="size-[18px] shrink-0 text-text-2" aria-hidden />
        <span className="min-w-0 flex-1 text-[13px] break-all text-text-2">{url}</span>
        <button type="button" onClick={copy} className="shrink-0 text-sm font-extrabold text-primary">
          {copied ? 'Kopierad' : 'Kopiera'}
        </button>
      </div>
      <a href={SITE.apiGuideUrl} rel="noopener" className="inline-flex items-center gap-1.5 self-start text-sm font-extrabold text-primary">
        API-dokumentation
        <ArrowUpRight className="size-4" aria-hidden />
      </a>
    </aside>
  )
}
