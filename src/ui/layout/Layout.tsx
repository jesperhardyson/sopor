import { Outlet } from 'react-router'
import { Footer } from './Footer'
import { Header } from './Header'
import { ScrollManager } from './ScrollManager'
import { TestDataBanner } from './TestDataBanner'

export function Layout() {
  return (
    <div className="bg-live flex min-h-dvh flex-col">
      <ScrollManager />
      <TestDataBanner />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
