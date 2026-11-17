import { ArrowUpRight, Megaphone } from 'lucide-react'
import { useState } from 'react'
import type { SourceMessage } from '@/domain/messages'
import { cn } from '@/lib/utils'

/**
 * Källans tillfälliga besked, i samma stil som rutan om att schemat snart tar slut. `collapsible` visar bara
 * början av texten tills man fäller ut den, för sidor där schemat ska synas först.
 */
export function SourceMessages({ messages, sourceName, collapsible = false }: { messages: SourceMessage[]; sourceName: string; collapsible?: boolean }) {
  if (messages.length === 0) return null
  return (
    <>
      {messages.map((m) => (
        <MessageBox key={m.id} message={m} sourceName={sourceName} collapsible={collapsible} />
      ))}
    </>
  )
}

function MessageBox({ message: m, sourceName, collapsible }: { message: SourceMessage; sourceName: string; collapsible: boolean }) {
  const [open, setOpen] = useState(!collapsible)
  return (
    <div role="status" className="flex gap-3 rounded-[14px] bg-warn-bg px-4 py-3.5 text-warn">
      <Megaphone className="size-[22px] shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <h2 className="text-[15px] font-extrabold">{m.title}</h2>
        <p className={cn('text-sm leading-[1.4]', !open && 'line-clamp-2')}>{m.text}</p>
        {open && m.url && (
          <a href={m.url} rel="noopener" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-extrabold underline underline-offset-2">
            Läs mer hos {sourceName}
            <ArrowUpRight className="size-4" aria-hidden />
          </a>
        )}
        {collapsible && (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="inline-flex min-h-11 items-center self-start text-sm font-extrabold underline underline-offset-2"
          >
            {open ? 'Visa mindre' : 'Visa hela meddelandet'}
          </button>
        )}
      </div>
    </div>
  )
}
