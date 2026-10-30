import { Outlet } from 'react-router'
import { Footer } from './Footer'
import { Header } from './Header'
import { ScrollManager } from './ScrollManager'

export function Layout() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <ScrollManager />
      <Header />
      <main className="flex-1">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}
