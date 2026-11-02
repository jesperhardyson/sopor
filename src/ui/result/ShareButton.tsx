import { Check, Share2 } from 'lucide-react'
import { useState } from 'react'

/**
 * Delar adressidan: telefonens delningsmeny där den finns, annars kopieras länken.
 * Meddelandet "Länken är kopierad" läses upp av skärmläsare via role="status".
 */
export function ShareButton({ title, url }: { title: string; url: string }) {
  const [copied, setCopied] = useState(false)

  async function share() {
    if (navigator.share) {
      // Avbryter man delningen kastas ett fel. Det är inget att visa.
      await navigator.share({ title: `${title} – Sopor`, url }).catch(() => {})
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Utan urklipp får man kopiera adressfältet själv.
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={share}
        aria-label="Dela"
        className="inline-flex shrink-0 items-center gap-2 rounded-[14px] border border-border bg-surface px-[13px] py-3 text-[15px] font-bold text-text"
      >
        {copied ? <Check className="size-[18px] text-primary" aria-hidden /> : <Share2 className="size-[18px]" aria-hidden />}
        {/* Texten bara på bredare skärmar: på mobil skulle knappen tränga ihop adressen. Telefoner har oftast delningsmenyn. */}
        {copied && (
          <span aria-hidden className="hidden md:inline">
            Länken är kopierad
          </span>
        )}
      </button>
      <span role="status" className="sr-only">
        {copied ? 'Länken är kopierad' : ''}
      </span>
    </>
  )
}
