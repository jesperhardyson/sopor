import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Typsnitten från egen server i stället för Google Fonts: bara vikterna och teckenuppsättningarna som används.
import '@fontsource/fredoka/latin-600.css'
import '@fontsource/fredoka/latin-ext-600.css'
import '@fontsource/nunito/latin-400.css'
import '@fontsource/nunito/latin-ext-400.css'
import '@fontsource/nunito/latin-600.css'
import '@fontsource/nunito/latin-ext-600.css'
import '@fontsource/nunito/latin-700.css'
import '@fontsource/nunito/latin-ext-700.css'
import '@fontsource/nunito/latin-800.css'
import '@fontsource/nunito/latin-ext-800.css'
import './styles/theme.css'
import { App } from './ui/App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Bara i bygget: i dev-servern skulle den sparade sidan dölja ändringar.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => void navigator.serviceWorker.register('/sw.js').catch(() => {}))
}
