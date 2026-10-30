import { ChevronRight, Smartphone, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { daysBetween, formatShort, relativeDayLabel, todayInStockholm } from '@/domain/dates'
import { nextPickup } from '@/domain/schedule'
import { clearSaved, loadSaved, removeSaved, renameSaved, type SavedAddress } from '@/lib/storage'
import { FractionIcon } from '../components/FractionIcon'
import { useSchedule } from '../hooks/useSchedule'
import { ForgetAll } from './ForgetAll'
import { NameIcon } from './NameIcon'

function SavedCard({ saved, today }: { saved: SavedAddress; today: string }) {
  const [state] = useSchedule(saved.municipalityId, saved.addressId)
  const next = state.status === 'ok' ? nextPickup(state.schedule, today) : null
  return (
    <Link
      to={`/${saved.municipalityId}/${saved.addressId}`}
      className="flex items-center gap-3.5 rounded-[18px] border border-border bg-surface p-4 hover:border-primary"
    >
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-1.5">
          <NameIcon name={saved.name} className="size-4 shrink-0 text-primary" />
          <span className="truncate text-base font-extrabold text-text">{saved.name}</span>
        </span>
        <span className="truncate text-sm text-text-2">
          {saved.street}, {saved.locality}
        </span>
        {next && (
          <span className="flex flex-wrap items-center gap-x-1.5 pt-1 text-sm">
            <span className="font-extrabold text-brand-text">{formatShort(next.date)}</span>
            <span className="text-text-2">· {relativeDayLabel(daysBetween(today, next.date))}</span>
          </span>
        )}
      </span>
      {next && (
        <span className="flex shrink-0 items-center -space-x-2" aria-hidden>
          {next.fractions.map((f) => (
            <FractionIcon key={f} fraction={f} className="size-[34px] rounded-full border-2 border-surface [&_svg]:size-4" />
          ))}
        </span>
      )}
      <ChevronRight className="size-5 shrink-0 text-text-2" aria-hidden />
    </Link>
  )
}

export function SavedList({ today = todayInStockholm() }: { today?: string }) {
  const [saved, setSaved] = useState(loadSaved)
  const [editing, setEditing] = useState(false)

  if (saved.length === 0) return null

  return (
    <section id="mina-adresser" className="flex flex-col gap-2.5 pt-4" aria-labelledby="mina-adresser-rubrik">
      <div className="flex items-center justify-between px-1">
        <h2 id="mina-adresser-rubrik" className="text-[15px] font-extrabold text-text">
          Mina adresser
        </h2>
        <button type="button" onClick={() => setEditing((e) => !e)} className="text-sm font-bold text-primary">
          {editing ? 'Klar' : 'Hantera'}
        </button>
      </div>

      {saved.map((s) => {
        const key = `${s.municipalityId}/${s.addressId}`
        if (editing) {
          return (
            <div key={key} className="flex items-center gap-3 rounded-[18px] border border-border bg-surface p-4">
              <label className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="sr-only">Namn för {s.street}</span>
                <input
                  defaultValue={s.name}
                  onBlur={(e) => e.target.value.trim() && setSaved(renameSaved(s.municipalityId, s.addressId, e.target.value.trim()))}
                  className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-base font-extrabold text-text"
                />
                <span className="text-sm text-text-2">
                  {s.street}, {s.locality}
                </span>
              </label>
              <button
                type="button"
                aria-label={`Glöm ${s.name}`}
                onClick={() => setSaved(removeSaved(s.municipalityId, s.addressId))}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-warn hover:bg-warn-bg"
              >
                <Trash2 className="size-4" aria-hidden />
                Glöm
              </button>
            </div>
          )
        }
        return <SavedCard key={key} saved={s} today={today} />
      })}

      {editing && <ForgetAll label="Glöm alla adresser på den här enheten" onConfirm={() => setSaved(clearSaved())} />}

      <p className="flex items-center gap-1.5 px-1 py-0.5 text-[13px] text-text-2">
        <Smartphone className="size-3.5" aria-hidden />
        Sparas bara på den här enheten.
      </p>
    </section>
  )
}
