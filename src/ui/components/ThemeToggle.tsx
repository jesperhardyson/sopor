import { Moon, Sun } from 'lucide-react'
import { useState } from 'react'
import { currentTheme, setTheme, type Theme } from '@/lib/theme'

export function ThemeToggle() {
  const [theme, setState] = useState<Theme>(() => currentTheme())
  const next = theme === 'dark' ? 'light' : 'dark'
  return (
    <button
      type="button"
      onClick={() => {
        setTheme(next)
        setState(next)
      }}
      aria-label={next === 'dark' ? 'Byt till mörkt läge' : 'Byt till ljust läge'}
      className="inline-flex size-11 items-center justify-center rounded-full border border-border text-text-2 transition-colors hover:bg-surface"
    >
      {theme === 'dark' ? <Sun className="size-5" aria-hidden /> : <Moon className="size-5" aria-hidden />}
    </button>
  )
}
