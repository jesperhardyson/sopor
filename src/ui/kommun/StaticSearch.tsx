import { Search } from 'lucide-react'

/** Sökfältet i den statiska HTML-filen, tills appen har laddats och ersatt det med AddressSearch. */
export function StaticSearch() {
  return (
    <div className="flex h-[62px] items-center gap-2.5 rounded-[18px] border-[1.5px] border-border bg-surface pr-4 pl-[18px] shadow-[0_4px_16px_#1B231F0D] lg:h-[76px] lg:gap-3.5 lg:rounded-[22px] lg:pr-5 lg:pl-6">
      <Search className="size-5 shrink-0 text-text-2 lg:size-6" aria-hidden />
      <input
        type="text"
        disabled
        aria-label="Din adress"
        placeholder="Skriv din adress, t.ex. Storgatan 12"
        className="min-w-0 flex-1 bg-transparent text-base font-bold text-text outline-none placeholder:font-normal placeholder:text-text-2 lg:text-xl"
      />
    </div>
  )
}
