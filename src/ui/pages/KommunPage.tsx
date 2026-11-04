import { SearchX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router'
import type { KommunPage as KommunPageData } from '@/data/kommun-pages'
import { kommunPage } from '@/providers/registry'
import { usePageTitle } from '../hooks/usePageTitle'
import { AllKommunerLink, BackLink, KommunColumn, KommunContent } from '../kommun/KommunContent'
import { embeddedData } from '../kommun/embedded'
import { ErrorState } from '../result/ResultStates'
import { AddressSearch } from '../search/AddressSearch'

export function KommunRoute() {
  const { slug = '' } = useParams()
  return <KommunView key={slug} slug={slug} />
}

type State = { status: 'loading' } | { status: 'error' } | { status: 'missing' } | { status: 'ready'; page: KommunPageData }

function KommunView({ slug }: { slug: string }) {
  const { pathname } = useLocation()
  const [state, setState] = useState<State>(() => {
    const page = embeddedData<KommunPageData>(pathname)
    return page ? { status: 'ready', page } : { status: 'loading' }
  })
  const [attempt, setAttempt] = useState(0)
  const ready = state.status === 'ready'

  useEffect(() => {
    if (ready) return
    let current = true
    void kommunPage(slug).then((page) => {
      if (!current) return
      if (page === null) setState({ status: 'error' })
      else setState(page ? { status: 'ready', page } : { status: 'missing' })
    })
    return () => {
      current = false
    }
  }, [slug, attempt, ready])

  usePageTitle(ready ? `Sophämtning i ${state.page.name} – Sopor` : state.status === 'missing' ? 'Kommunen finns inte – Sopor' : undefined)

  if (ready) return <KommunContent page={state.page} search={<AddressSearch />} />
  return (
    <KommunColumn>
      <BackLink to="/">Startsidan</BackLink>
      {state.status === 'loading' && <div aria-busy className="h-40 rounded-[20px] bg-surface" />}
      {state.status === 'error' && <ErrorState onRetry={() => { setState({ status: 'loading' }); setAttempt((a) => a + 1) }} />}
      {state.status === 'missing' && <UnknownKommun />}
    </KommunColumn>
  )
}

function UnknownKommun() {
  return (
    <div role="status" className="flex flex-col gap-3.5 rounded-[20px] border border-border bg-surface p-5">
      <div className="flex items-start gap-3.5">
        <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-2xl bg-earth-soft text-earth">
          <SearchX className="size-6" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <h1 className="text-xl font-extrabold tracking-[-0.3px] text-text">Kommunen finns inte</h1>
          <p className="text-[15px] leading-[1.45] text-text-2">Vi hittade ingen kommun på den här adressen.</p>
        </div>
      </div>
      <AllKommunerLink />
    </div>
  )
}
