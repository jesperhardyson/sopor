import { usePageTitle } from '../hooks/usePageTitle'
import { PrivacyContent } from '../privacy/PrivacyContent'

export function PrivacyPage() {
  usePageTitle('Integritetspolicy – Sopor')
  return <PrivacyContent />
}
