import { ArrowLeft, ArrowUpRight, Check, Copy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import { SITE } from '@/config'
import { GitHubMark } from '../components/GitHubMark'
import { ContributeWays, MunicipalityStatusList } from '../start/ContributeSection'

/** Exempeltext för att begära ut kopplingen adress → område. Samma text som i guiden på GitHub. */
export const REQUEST_TEXT = `Hej! Jag begär ut den förteckning som visar vilket hämtområde (trakt/tur) varje adress i kommunen tillhör för hushållsavfall, helst i ett maskinläsbart format som CSV eller Excel. Jag vill också fråga om ni har något emot att uppgifterna återpubliceras i den ideella tjänsten Sopor (sopor.hardyson.se), som visar hämtdagar per adress.

Om ni har en publik söktjänst för hämtschema (till exempel EDP Futures modul SimpleWastePickup) vore det också bra att veta om den kan fyllas med data.`

const STEPS: { title: string; text: string }[] = [
  {
    title: 'Hitta kommunens hämtschema',
    text: 'Sök på kommunens webbplats efter hämtschema, tömningsschema eller hämtningsdagar. Notera om det är en PDF per område, en webbsida med veckodagar eller en söktjänst.',
  },
  {
    title: 'Se om det finns en söktjänst per adress',
    text: 'Kan du skriva in din adress och få ditt schema utan att logga in? Skriv i så fall det i tipset, då kan Sopor hämta schemat direkt. Kräver den inloggning, som Mina sidor eller BankID, kan Sopor inte använda den.',
  },
  {
    title: 'Be kommunen om adresslistan',
    text: 'Ofta finns schemat per område men inte vilken adress som hör till vilket område. Den listan är oftast en allmän handling som vem som helst kan begära ut. Använd gärna texten nedan.',
  },
  {
    title: 'Tipsa oss',
    text: 'Berätta vad du hittat, med länkar, i ett tips på GitHub eller via mejl. Säg till om du har begärt ut listan, så att ingen annan gör samma sak.',
  },
]

const h2 = 'text-xl font-extrabold tracking-[-0.3px] text-text'
const body = 'text-[15px] leading-normal text-text-2'

function CopyRequest() {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(REQUEST_TEXT)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      // Utan urklipp (t.ex. äldre webbläsare) får man markera texten själv.
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-border bg-surface p-5">
      <p className="text-sm leading-relaxed whitespace-pre-line text-text">{REQUEST_TEXT}</p>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-2 self-start rounded-[14px] border border-border bg-surface px-4 py-2.5 text-[15px] font-bold text-text"
      >
        {copied ? <Check className="size-[18px] text-primary" aria-hidden /> : <Copy className="size-[18px]" aria-hidden />}
        {copied ? 'Kopierad!' : 'Kopiera texten'}
      </button>
      <p className="text-[13px] text-text-2">
        Skicka den till kommunens eller avfallsbolagets registrator. Kommunen ska svara skyndsamt, men det kan ta några
        veckor.
      </p>
    </div>
  )
}

export function BidraPage() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-9 px-5 pt-1 pb-10 md:px-0 md:pt-6 md:pb-20">
      <div className="flex flex-col gap-3">
        <Link to="/" className="inline-flex items-center gap-1.5 self-start py-1.5 text-[15px] font-extrabold text-primary">
          <ArrowLeft className="size-[18px]" aria-hidden />
          Tillbaka
        </Link>
        <h1 className="text-[34px] leading-[1.1] font-extrabold tracking-[-0.8px] text-text">
          Hjälp till att få in din kommun
        </h1>
        <p className="text-[17px] leading-[1.45] text-text-2">
          Sopor är ett öppet hobbyprojekt. Varje kommun publicerar sitt hämtschema på sitt eget sätt, så vi lägger till
          dem en i taget. Du behöver inte kunna programmera. Det räcker långt att ta reda på var datan finns.
        </p>
      </div>

      <section className="flex flex-col gap-4" aria-labelledby="steg-rubrik">
        <h2 id="steg-rubrik" className={h2}>
          Så tar du reda på var datan finns
        </h2>
        <ol aria-label="Så tar du reda på var datan finns" className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-4">
              <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[15px] font-extrabold text-brand-text">
                {i + 1}
              </span>
              <span className="flex flex-col gap-1 pt-1">
                <span className="text-base font-extrabold text-text">{step.title}</span>
                <span className={body}>{step.text}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="begaran-rubrik">
        <h2 id="begaran-rubrik" className={h2}>
          Exempel på begäran till kommunen
        </h2>
        <CopyRequest />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="satt-rubrik">
        <h2 id="satt-rubrik" className={h2}>
          Tipsa eller bidra
        </h2>
        <ContributeWays />
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="kommuner-rubrik">
        <h2 id="kommuner-rubrik" className={h2}>
          Kommuner hittills
        </h2>
        <MunicipalityStatusList />
      </section>

      <section className="flex flex-col items-start gap-3 border-t border-border pt-6" aria-labelledby="utv-rubrik">
        <h2 id="utv-rubrik" className="text-base font-extrabold text-text">
          För utvecklare
        </h2>
        <p className={body}>
          Hur du testar om kommunen har en publik söktjänst, dataformatet och vad vi vet om varje kommun finns i den
          tekniska guiden.
        </p>
        <a
          href={SITE.dataGuideUrl}
          rel="noopener"
          className="inline-flex items-center gap-2 rounded-[14px] border border-border bg-surface px-4 py-3 text-[15px] font-bold text-text"
        >
          <GitHubMark className="size-[18px]" />
          Läs den tekniska guiden
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      </section>
    </div>
  )
}
