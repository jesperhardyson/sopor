/// <reference types="vitest/config" />
import { existsSync } from 'node:fs'
import type { ServerResponse } from 'node:http'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/** Kör api/-funktionerna i dev-servern, så att `npm run dev` fungerar utan `vercel dev`. */
function soporApi(): Plugin {
  const routes: Record<string, string> = { sok: 'handleSearch', schema: 'handleSchedule', ics: 'handleIcs' }
  const v1Routes: Record<string, string> = { adress: 'handleV1Address', kallor: 'handleV1Sources' }
  return {
    name: 'sopor-api',
    configureServer(server) {
      const send = async (res: ServerResponse, response: Response) => {
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      }
      server.middlewares.use(async (req, res, next) => {
        // Riktig värd, så att url.origin stämmer för hämtningar mot sajten själv och för länkar
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

        // /api/v1/… som rewritesen i vercel.json (openapi.json serveras statiskt från public/)
        const v1 = url.pathname.match(/^\/api\/v1(?:\/(.*))?$/)
        const rest = v1?.[1] ?? ''
        if (v1 && rest !== 'openapi.json') {
          let name = Object.hasOwn(v1Routes, rest) ? v1Routes[rest] : 'handleV1NotFound'
          const adress = rest.match(/^adress\/([^/]+)\/([^/]+)$/)
          if (adress) {
            try {
              url.searchParams.set('source', decodeURIComponent(adress[1]))
              url.searchParams.set('id', decodeURIComponent(adress[2]))
              name = v1Routes.adress
            } catch {
              name = 'handleV1NotFound' // Trasig procentkod
            }
          }
          const mod = await server.ssrLoadModule('/src/server/v1.ts')
          return send(res, await mod.v1(mod[name])(new Request(url, { method: req.method })))
        }

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
        await send(res, await handlers[fn](url))
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
