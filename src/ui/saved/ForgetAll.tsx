import { Trash2 } from 'lucide-react'
import { useState } from 'react'

/** Knapp som glömmer alla sparade adresser, med bekräftelse direkt på sidan (ingen popup). */
export function ForgetAll({ label, onConfirm }: { label: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-2 self-start rounded-[14px] border border-border bg-surface px-4 py-2.5 text-[15px] font-bold text-warn hover:bg-warn-bg"
      >
        <Trash2 className="size-[18px]" aria-hidden />
        {label}
      </button>
    )
  }

  return (
    <div role="group" aria-label="Bekräfta" className="flex flex-col gap-2.5 rounded-[14px] bg-warn-bg p-3.5">
      <p className="text-sm font-semibold text-warn">Säker? Adresserna går inte att få tillbaka.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            onConfirm()
            setConfirming(false)
          }}
          className="rounded-xl bg-warn px-3.5 py-2 text-sm font-extrabold text-surface"
        >
          Ja, glöm alla
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded-xl border border-border bg-surface px-3.5 py-2 text-sm font-bold text-text"
        >
          Avbryt
        </button>
      </div>
    </div>
  )
}
