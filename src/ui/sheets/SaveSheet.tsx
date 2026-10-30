import { Smartphone } from 'lucide-react'
import { useId, useState } from 'react'
import type { Address } from '@/domain/types'
import { findSaved, upsertSaved } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { NameIcon } from '../saved/NameIcon'
import { ResponsiveSheet } from './ResponsiveSheet'

const QUICK_NAMES = ['Hemma', 'Stugan', 'Jobbet']

export function SaveSheet({
  open,
  onOpenChange,
  address,
  kommunName,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  address: Address
  kommunName: string
  onSaved?: () => void
}) {
  const inputId = useId()
  const [name, setName] = useState(() => findSaved(address.sourceId, address.id)?.name ?? 'Hemma')
  const trimmed = name.trim()

  function save() {
    if (!trimmed) return
    upsertSaved({
      sourceId: address.sourceId,
      addressId: address.id,
      name: trimmed,
      street: address.street,
      locality: address.locality,
      savedAt: new Date().toISOString(),
    })
    onSaved?.()
    onOpenChange(false)
  }

  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Spara adress"
      description={`${address.street}, ${address.locality} · ${kommunName}`}
    >
      <form
        className="flex flex-col gap-[18px]"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="text-sm font-extrabold text-text">
            Ge adressen ett namn
          </label>
          <div className="flex h-14 items-center gap-2.5 rounded-[14px] border-2 border-border bg-surface px-4 focus-within:border-primary">
            <NameIcon name={name} className="size-5 shrink-0 text-primary" />
            <input
              id={inputId}
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[17px] font-bold text-text outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {QUICK_NAMES.map((q) => {
              const active = trimmed === q
              return (
                <button
                  key={q}
                  type="button"
                  onClick={() => setName(q)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-sm font-bold',
                    active ? 'border-primary bg-brand-soft text-brand-text' : 'border-border bg-surface text-text',
                  )}
                >
                  <NameIcon name={q} className={cn('size-3.5', !active && 'text-text-2')} />
                  {q}
                </button>
              )
            })}
          </div>
        </div>
        <p className="flex items-center gap-2.5 rounded-[14px] bg-surface-2 px-3.5 py-3 text-sm leading-[1.4] text-text-2">
          <Smartphone className="size-[18px] shrink-0" aria-hidden />
          Sparas bara på den här enheten. Inget konto behövs.
        </p>
        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={!trimmed}
            className="h-14 rounded-[14px] bg-primary text-base font-extrabold text-on-primary disabled:opacity-50"
          >
            Spara adress
          </button>
          <button type="button" onClick={() => onOpenChange(false)} className="h-12 text-base font-extrabold text-text-2">
            Avbryt
          </button>
        </div>
      </form>
    </ResponsiveSheet>
  )
}
