# Spec: Från adress till områdesval i apparna

Status: utkast, 2026-11-04. Bygger på `docs/specs/2026-11-04-avesta-omradesval.md`, där apparna bara fick en hjälptext. Det visade sig vara en återvändsgränd vid provning på en riktig Homey: "Bergslagsvägen, Avesta" gav bara en förklaring.

## Mål

- Den som söker sin adress i Homey eller Home Assistant, med en ort i Avesta eller Säter, får välja bland kommunens områden.
- Sopor gissar fortfarande inte vilket område en adress hör till. Användaren väljer, och källans varning visas före valet.
- Apparna vet inte vilka kommuner som har områdesval. En ny kommun med områden kräver ingen ny appversion.

## API

`GET /api/v1/omraden?plats=<ort>` är en ny endpoint, och befintliga fält ändras inte.

- `plats` är kommunens namn, med eller utan "kommun", eller en ort i kommunen enligt gatuindexet: "Avesta", "Säters kommun" och "Krylbo".
- Svaret har samma form som `/sok`: `addresses` och `failed`. Varje område är en träff med `selection: "area"`, `notice` och `url`.
- Områdena kommer i källans ordning. En plats utan områdesval ger en tom lista, inte ett fel.
- `plats` kortare än två tecken ger 400.

## Apparna

1. Apparna söker som förut med `/sok` och filtrerar på orten.
2. Ger det inga träffar, och frågan har en ort, frågar de `/omraden`. Fel där behandlas som "inga områden", så att användaren får vanlig text.
3. Finns områden blir de träffar. Varningen visas före valet, som för andra områdesträffar.

Utan ort frågas inte `/omraden`, eftersom samma gatunamn finns i många kommuner. Hjälptexten säger därför att man ska skriva orten efter gatan.

**Homey:** knappen "Fortsätt" tas bort från sökskärmen, eftersom den syntes utan något att välja. Sökningen går vidare av sig själv, och varningen har en egen knapp.

## Utanför

- Att räkna ut område från adress, koordinater eller kartor.
- Att spara vilket område en gata hör till i apparna.
- Att ändra sajten, som redan har raden "Välj område".

## Lansering

API:t driftsätts först, eftersom apparna frågar produktionen. Sedan provas parningen på en riktig Homey och i Home Assistant, och därefter släpps apparna med sina releaseskript. Äldre appversioner fungerar som förut.
