@AGENTS.md

## Claude-specifikt

- Läs designen (`docs/design/sopor-design.pen`) via Pencil MCP-verktygen (`get_app_state`, `execute` med `Get`/`GetVariables`), aldrig med Read eller Grep.
- Använd Context7 för biblioteksdokumentation (Vite, Tailwind v4, shadcn/ui, react-router, Vitest) i stället för att gå på minnet.
- Vercel: använd Vercel MCP eller `vercel` CLI. Sajten och preview-adresserna är publika (Vercel Authentication avstängd). Ändra inte skyddet utan att användaren ber om det.
- Avesta har områdesval (`selection: 'area'`). Schemat täcker bara det som PDF:en anger, så nästa års schema läggs in för hand enligt `docs/kommuner/lagga-till-kommun.md`. Avesta har meddelandet `nya-rutter-2026` (rutterna läggs om, gäller till 2027-03-31). Ta bort det när det nya schemat läggs in.
- Säter har också områdesval. Schemat täcker bara vecka 45–53 2026, så fortsättningen läggs in för hand när kommunen har publicerat den (se `docs/specs/2026-11-04-sater-omradesval.md`).
