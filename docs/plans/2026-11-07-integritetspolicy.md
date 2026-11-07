# Plan: Integritetspolicy på /integritet

Spec: `docs/specs/2026-11-07-integritetspolicy.md`. Tester först i varje steg, och `npm run lint && npm test && npm run build` före commit.

- [x] `PrivacyContent` och `PrivacyPage`, med route i `src/ui/App.tsx`.
- [x] `renderPrivacyHtml` och sitemap i `scripts/prerender.ts`.
- [x] Rewrite i `vercel.json` och undantag i `public/sw.js`.
- [x] Länkar från sidfoten och `/om`, och rättad text på `/om`.
- [ ] Kontrollera `dist/integritet/index.html` efter bygget, och prova i ljust och mörkt läge och utan JavaScript på förhandsversionen.
- [ ] Jämför sidan med designen när Pencil går att läsa igen.
