@AGENTS.md

## Claude-specifikt

- Läs designen (`docs/design/sopor-design.pen`) via Pencil MCP-verktygen (`get_app_state`, `execute` med `Get`/`GetVariables`), aldrig med Read eller Grep.
- Använd Context7 för biblioteksdokumentation (Vite, Tailwind v4, shadcn/ui, react-router, Vitest) i stället för att gå på minnet.
- Vercel: använd Vercel MCP eller `vercel` CLI. Sajten är låst med Vercel Authentication (All Deployments) tills riktig datakälla finns. Ändra inte skyddet utan att användaren ber om det.
