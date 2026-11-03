import { ViewTransition } from 'react'
import { Outlet } from 'react-router'
import { Footer } from './Footer'
import { Header } from './Header'
import { ScrollManager } from './ScrollManager'

export function Layout() {
  return (
    <div className="bg-live flex min-h-dvh flex-col">
      <ScrollManager />
      <Header />
      {/* Router-navigeringar körs som React-övergångar, så sidbyten animeras här (se theme.css) */}
      <ViewTransition default="sida">
        <main className="flex-1">
          <Outlet />
        </main>
      </ViewTransition>
      <Footer />
    </div>
  )
}
