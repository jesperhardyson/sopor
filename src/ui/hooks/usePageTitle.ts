import { useEffect } from 'react'

export const SITE_TITLE = 'Sopor – när töms dina kärl?'

/** Sidans titel i fliken, bokmärken och historiken. Utan titel gäller sajtens. */
export function usePageTitle(title?: string) {
  useEffect(() => {
    document.title = title ?? SITE_TITLE
  }, [title])
}
