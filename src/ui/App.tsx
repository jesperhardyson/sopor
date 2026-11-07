import { Analytics } from '@vercel/analytics/react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { beforeSend } from '@/lib/analytics'
import { Layout } from './layout/Layout'
import { AreaRoute } from './pages/AreaPage'
import { AboutPage } from './pages/AboutPage'
import { BidraPage } from './pages/BidraPage'
import { KommunerRoute } from './pages/KommunerPage'
import { KommunRoute } from './pages/KommunPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ResultRoute } from './pages/ResultPage'
import { StartPage } from './pages/StartPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<StartPage />} />
          <Route path="om" element={<AboutPage />} />
          <Route path="integritet" element={<PrivacyPage />} />
          <Route path="bidra" element={<BidraPage />} />
          <Route path="kommuner" element={<KommunerRoute />} />
          <Route path="kommuner/:slug" element={<KommunRoute />} />
          <Route path=":sourceId/omraden" element={<AreaRoute />} />
          <Route path=":sourceId/:addressId" element={<ResultRoute />} />
          <Route path="*" element={<StartPage />} />
        </Route>
      </Routes>
      <Analytics beforeSend={beforeSend} />
    </BrowserRouter>
  )
}
