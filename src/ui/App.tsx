import { BrowserRouter, Route, Routes } from 'react-router'
import { Layout } from './layout/Layout'
import { AboutPage } from './pages/AboutPage'
import { ResultPage } from './pages/ResultPage'
import { StartPage } from './pages/StartPage'

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<StartPage />} />
          <Route path="om" element={<AboutPage />} />
          <Route path=":municipalityId/:addressId" element={<ResultPage />} />
          <Route path="*" element={<StartPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
