import { useEffect, useState } from 'react'
import type { KommunSummary } from '@/data/kommun-pages'
import { kommunPages } from '@/providers/registry'
import { usePageTitle } from '../hooks/usePageTitle'
import { BackLink, KommunColumn } from '../kommun/KommunContent'
import { KommunerContent } from '../kommun/KommunerContent'
import { embeddedData } from '../kommun/embedded'
import { ErrorState } from '../result/ResultStates'

export function KommunerRoute() {
  usePageTitle('Sophämtning i Sveriges kommuner – Sopor')
  const [kommuner, setKommuner] = useState(() => embeddedData<KommunSummary[]>('/kommuner'))
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (kommuner) return
    let current = true
    void kommunPages().then((pages) => {
      if (!current) return
      if (pages) setKommuner(pages)
      else setFailed(true)
    })
    return () => {
      current = false
    }
  }, [kommuner, attempt])

  if (kommuner) return <KommunerContent kommuner={kommuner} />
  return (
    <KommunColumn>
      <BackLink to="/">Startsidan</BackLink>
      {failed ? <ErrorState onRetry={() => { setFailed(false); setAttempt((a) => a + 1) }} /> : <div aria-busy className="h-40 rounded-[20px] bg-surface" />}
    </KommunColumn>
  )
}
