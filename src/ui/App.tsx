import { Analytics } from '@vercel/analytics/react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { beforeSend } from '@/lib/analytics'
import { Layout } from './layout/Layout'
import { AboutPage } from './pages/AboutPage'
import { BidraPage } from './pages/BidraPage'
import { ResultRoute } from './pages/ResultPage'
import { StartPage } from './pages/StartPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<StartPage />} />
          <Route path="om" element={<AboutPage />} />
          <Route path="bidra" element={<BidraPage />} />
          <Route path=":sourceId/:addressId" element={<ResultRoute />} />
          <Route path="*" element={<StartPage />} />
        </Route>
      </Routes>
      <Analytics beforeSend={beforeSend} />
    </BrowserRouter>
  )
}
