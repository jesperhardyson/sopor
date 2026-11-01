# Sopkärl i Homey-appen – implementationsplan

**Mål:** Drivrutinen `karl` enligt specen: kärl som användaren lägger till per adress, med "Nästa tömning", "Dagar kvar", "Utställt" och egna flödeskort.

**Arkitektur:** Ren logik i `lib/bin.mts` (Vitest). Kärlet hämtar ingenting själv utan läser adressenhetens sparade schema. Adressenheten meddelar nya scheman genom appen (`app.schedules.emit('schedule', adressId)`), så kärlen slipper hålla reda på när adressenheten startas om. Påminnelsetiderna delas genom `REMINDER_TIMES` i `lib/reminder.mts`.

**Spec:** `docs/specs/2026-11-01-homey-karl.md`. Design: sidan "Homey · Sopkärl" i `docs/design/sopor-design.pen`.

## Globala krav

- Allt i `integrations/homey/`. Ingen kod från `src/`.
- Texter på svenska och engelska. Avfallstypernas namn kommer från API:t.
- Adressenhetens beteende ändras inte.
- Versionen ändras inte för hand. Releasen görs separat med `npm run release`.
- Kör `npm test && npm run typecheck && npm run validate` i `integrations/homey` före varje commit.

## Uppgifter

- [x] **1. `lib/bin.mts` med tester först:** `binFractions`, `binSchedule`, `binNextText`, `binDaysToNext`, `putOutDate`, `shouldReset`, `suggestedName`, `suggestedIcon`, `binId`. `joinShort` och `KNOWN_FRACTIONS` exporteras från `lib/schedule.mts`.
- [x] **2. Adressenheten:** `storedSchedule` (ofiltrerat), `app.schedules.emit('schedule', id)` efter lyckad hämtning, och `REMINDER_TIMES` i `lib/reminder.mts`.
- [x] **3. Capability `sopor_utstallt`** (boolean, setable, toggle, snabbknapp) med ikon.
- [x] **4. Drivrutinen `karl`:** `driver.compose.json` (inställningar `ingar_<id>`), `driver.flow.compose.json` (sex kort), `device.mts` och `driver.mts`.
- [x] **5. Parning:** vyerna `adress.html` och `fraktioner.html` med `Homey.createDevice`.
- [x] **6. Ikoner och bilder:** SVG för de nio kärlen och `sopor_utstallt` byggs från designens banor. PNG 75/500/1000 för drivrutinsbilden exporteras från designen.
- [x] **7. Texter, README och validering:** `locales/*.json`, README-texterna och `homey app validate`.

## Fokus vid granskning

1. **Återställning av "Utställt":** av natten efter tömningsdagen, inte samma dag. Test i uppgift 1.
2. **Flerfackskärl:** en tömning räknas när någon av kärlets avfallstyper hämtas. Test i uppgift 1.
3. **Adressen tas bort:** kärlet blir otillgängligt och kraschar inte. Kontrolleras på riktig Homey.
4. **Okända avfallstyper** som bara finns i `store.fractions` följer med när inställningarna ändras. Test i uppgift 1.
