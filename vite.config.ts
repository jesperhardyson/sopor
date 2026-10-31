/// <reference types="vitest/config" />
import { existsSync } from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Kör api/-funktionerna i dev-servern, så att `npm run dev` fungerar utan `vercel dev`. */
function soporApi(): Plugin {
  const routes: Record<string, string> = { sok: 'handleSearch', schema: 'handleSchedule', ics: 'handleIcs' }
  return {
    name: 'sopor-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        let fn = routes[url.pathname.match(/^\/api\/(\w+)$/)?.[1] ?? '']
        // /ics/<källa>/<fil> för live-källor (statiska filer i public/ serveras av Vite)
        const ics = url.pathname.match(/^\/ics\/([^/]+)\/([^/]+)$/)
        if (!fn && ics && !existsSync(path.join(import.meta.dirname, 'public', decodeURIComponent(url.pathname)))) {
          fn = routes.ics
          url.searchParams.set('source', ics[1])
          url.searchParams.set('file', decodeURIComponent(ics[2]))
        }
        if (!fn) return next()
        const handlers = await server.ssrLoadModule('/src/server/handlers.ts')
        const response: Response = await handlers[fn](url)
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), soporApi()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
})
