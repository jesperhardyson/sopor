import { ArrowUpRight, Megaphone } from 'lucide-react'
import type { SourceMessage } from '@/domain/messages'

/** Källans tillfälliga besked, i samma stil som rutan om att schemat snart tar slut. */
export function SourceMessages({ messages, sourceName }: { messages: SourceMessage[]; sourceName: string }) {
  if (messages.length === 0) return null
  return (
    <>
      {messages.map((m) => (
        <div key={m.id} role="status" className="flex gap-3 rounded-[14px] bg-warn-bg px-4 py-3.5 text-warn">
          <Megaphone className="size-[22px] shrink-0" aria-hidden />
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-[15px] font-extrabold">{m.title}</h2>
            <p className="text-sm leading-[1.4]">{m.text}</p>
            {m.url && (
              <a href={m.url} rel="noopener" className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-extrabold underline underline-offset-2">
                Läs mer hos {sourceName}
                <ArrowUpRight className="size-4" aria-hidden />
              </a>
            )}
          </div>
        </div>
      ))}
    </>
  )
}
