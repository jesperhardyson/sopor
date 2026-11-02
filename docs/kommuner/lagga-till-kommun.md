# Lägga till en kommun

Checklistan för att få in en ny kommun i Sopor. Att leta upp kommunens data, och att begära ut det som saknas, beskrivs mer utförligt i [guiden om att hitta kommunens data](hitta-kommunens-data.md).

Sopor använder bara **publika källor**. Tjänster som kräver inloggning, som Mina sidor, BankID eller kundportaler, får aldrig användas.

## Vilken väg?

```
Har kommunen en EDP-söktjänst med data?          npm run check:source -- <värd> "Storgatan 1"
├─ Ja ─────────────────────────────────────────► A. EDP: en rad i registret
└─ Nej
   Finns schemat publikt per område (trakt, tur, veckodag)?
   ├─ Nej ─────────────────────────────────────► Öppna ett ärende om ny kommun och berätta vad du hittat
   └─ Ja
      Finns kopplingen adress → område publikt?
      ├─ Ja ───────────────────────────────────► B. Statisk data
      └─ Nej ──────────────────────────────────► C. Begär ut kopplingen, sedan B
```

Svarar EDP-tjänsten men utan adresser för flera gator är den tom. Då gäller grenen *Nej*. Det är så i Avesta.

## A. EDP med data

EDP Future har en publik modul, SimpleWastePickup, som Sopor frågar direkt per adress. Ingen datafil behövs.

- [ ] Kör `npm run check:source -- <värd> "<en gata i kommunen>"`. Ange `--ort <Ort>` om sökvägen kan innehålla ortnamnet (`/Uppsala/FutureWeb`, `/FutureWebVarberg`), eller hela adressen om den har ett eget namn (`https://services.vafabmiljo.se/FutureWebVKFHus`). Skriptet skriver ut den baseUrl som fungerar.
- [ ] Titta på fraktionerna i utskriften. Blir en vanlig fraktion "okänd" (och därmed `karl`), lägg till ett mönster i `src/server/fractions-map.ts`, med ett test i `fractions-map.test.ts`.
- [ ] Lägg till källan i `ALL_SOURCES` i `src/sources/index.ts`:
  - `id`: kort, gemener, bindestreck (`kretslopp-sydost`). Den används i URL:er och kalenderprenumerationer och får **aldrig** ändras.
  - `name` och `url`: bolaget eller kommunen som sköter hämtningen.
  - `kommuner`: alla kommuner källan täcker, med SCB:s fyrsiffriga kommunkod och namnet ("Varbergs kommun").
  - `grannkommuner`: bara om söktjänsten också har en del adresser i andra kommuner (se Kretslopp Sydost).
  - `config: { system: 'edp', baseUrl: '…' }` från skriptet.
- [ ] Kör `npm run build:streets` och checka in de nya filerna i `data/osm/`. Utan dem hittar sökningen inte källan förrän man skrivit ett husnummer, och testet i `scripts/build-street-index.test.ts` fallerar.
- [ ] Kör `npm run lint && npm test && npm run build`, och sök på några adresser i `npm run dev`.
- [ ] Stod kommunen i [tabellen](hitta-kommunens-data.md#vad-vi-vet-om-kommunerna-hittills) i guiden, ta bort raden. Live-kommunerna visas på [Om-sidan](https://sopor.hardyson.se/om).

EDP ger nästa tömning och en frekvens. Sopor räknar fram kommande datum i 12 månader och märker dem *beräknat*. Datum som infaller på röda dagar får en varning.

## B. Statisk data

Schemat och kopplingen adress → område läggs in som filer i repot. Formatet beskrivs i [README](../../README.md#dataformatet).

- [ ] Lägg till källan i `ALL_SOURCES` i `src/sources/index.ts` som ovan, men med `config: { system: 'static' }`.
- [ ] Skapa `data/<id>/<år>/schedules.json` och `data/<id>/<år>/addresses.csv`. Skriv in flyttade tömningar vid helgdagar som de står i kommunens schema.
- [ ] Kör `npm run build:streets` och checka in de nya filerna i `data/osm/`.
- [ ] Kör `npm run lint && npm test && npm run build`. Build-skriptet stoppar vid okända fraktioner, ogiltiga datum, dubbletter av id och adresser som pekar på ett schema som saknas.
- [ ] Prova några adresser i `npm run dev`.
- [ ] Ta bort kommunens rad ur tabellen i guiden, som för A.

Varje år behöver schemat förnyas, se [Uppdatera årets schema](../../README.md#uppdatera-årets-schema).

## C. Begär ut kopplingen

Listan över vilka adresser som hör till vilket område är oftast en allmän handling. Skicka en begäran till kommunens eller avfallsbolagets registrator, med exempeltexten i [guiden](hitta-kommunens-data.md#steg-4-begär-kopplingen-från-kommunen). Matcha aldrig adresser mot områden på egen hand utifrån ortnamn eller kartor. En gissning som blir fel får folk att missa sin tömning.

Skriv in kommunen i tabellen i guiden med läget "Begärd som allmän handling", så att ingen annan gör samma sak. När tabellen har kommit fortsätter du med B.

## Pull request

Öppna en pull request och fyll i mallen, med länk till kommunens publika källa. GitHub Actions kör samma kontroller, och stoppar ändringar som tar bort eller byter namn på ett befintligt adress-id.
