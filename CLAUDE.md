@AGENTS.md

## Claude-specifikt

- Läs designen (`docs/design/sopor-design.pen`) via Pencil MCP-verktygen (`get_app_state`, `execute` med `Get`/`GetVariables`), aldrig med Read eller Grep.
- Använd Context7 för biblioteksdokumentation (Vite, Tailwind v4, shadcn/ui, react-router, Vitest) i stället för att gå på minnet.
- Vercel: använd Vercel MCP eller `vercel` CLI. Sajten och preview-adresserna är publika (Vercel Authentication avstängd). Ändra inte skyddet utan att användaren ber om det.
- Avesta har påhittad seed-data (`testData: true`) och sajten visar en varningsbanderoll. Ta inte bort flaggan förrän riktig data har lagts in.
