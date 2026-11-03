# Lägga till en kommun

Checklistan för att få in en ny kommun i Sopor. Att leta upp kommunens data, och att begära ut det som saknas, beskrivs mer utförligt i [guiden om att hitta kommunens data](hitta-kommunens-data.md).

Sopor använder bara **publika källor**. Tjänster som kräver inloggning, som Mina sidor, BankID eller kundportaler, får aldrig användas.

## Vilken väg?

```
Har kommunen en EDP-söktjänst med data?          npm run check:source -- <värd> "Storgatan 1"
├─ Ja ─────────────────────────────────────────► A. EDP: en rad i registret
└─ Nej
   Har kommunen en annan publik söktjänst per adress (utan inloggning)?
   ├─ Ja ──────────────────────────────────────► D. Ny källtyp (som Stockholm)
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
- [ ] Titta på fraktionerna i utskriften. Blir en vanlig fraktion "okänd" (och därmed `karl`), lägg till ett mönster i `src/server/fractions-map.ts`, med ett test i `fractions-map.test.ts`. Delade kärl ("Papper/Plast") mappas del för del, och kärl som ska visas med källans egen text utan att vara en fraktion (trädgårdsavfall, batterier) läggs i `KNOWN_BINS`. Välj en kontrolladress som är en bostad, inte en återvinningsstation.
- [ ] Lägg till källan i `ALL_SOURCES` i `src/sources/index.ts`:
  - `id`: kort, gemener, bindestreck (`kretslopp-sydost`). Den används i URL:er och kalenderprenumerationer och får **aldrig** ändras.
  - `name` och `url`: bolaget eller kommunen som sköter hämtningen.
  - `kommuner`: alla kommuner källan täcker, med SCB:s fyrsiffriga kommunkod och namnet ("Varbergs kommun").
  - `grannkommuner`: bara om söktjänsten också har en del adresser i andra kommuner (se Kretslopp Sydost).
  - `config: { system: 'edp', baseUrl: '…' }` från skriptet.
- [ ] Lägg till en kontrolladress för källan i `PROBES` i `scripts/monitor-sources.ts`: en vanlig adress ur skriptets utskrift, med ett riktigt schema. Bevakningen av källorna söker på den varje vecka, och ett test fallerar om den saknas.
- [ ] Kör `npm run build:streets` och checka in de nya filerna i `data/osm/`. Utan dem hittar sökningen inte källan förrän man skrivit ett husnummer, och testet i `scripts/build-street-index.test.ts` fallerar.
- [ ] Kör `npm run lint && npm test && npm run build`, och sök på några adresser i `npm run dev`.
- [ ] Stod kommunen i [tabellen](hitta-kommunens-data.md#vad-vi-vet-om-kommunerna-hittills) i guiden, ta bort raden. Live-kommunerna visas på [Om-sidan](https://sopor.hardyson.se/om).

EDP ger nästa tömning och en frekvens. Sopor räknar fram kommande datum och märker dem *beräknat*: jämna och udda veckor i 12 månader, men tömningar utan paritet bara till årets slut (se [specen om vecka 53](../specs/2026-11-03-vecka-53.md)). Ger en ny kommun en frekvenstext som `edpRule` i `src/server/edp.ts` inte läser rätt, visas bara källans datum. Datum som infaller på röda dagar får en varning.

## B. Statisk data

Schemat och kopplingen adress → område läggs in som filer i repot. Formatet beskrivs [längre ner](#dataformatet).

- [ ] Lägg till källan i `ALL_SOURCES` i `src/sources/index.ts` som ovan, men med `config: { system: 'static' }`.
- [ ] Skapa `data/<id>/<år>/schedules.json` och `data/<id>/<år>/addresses.csv`. Skriv in flyttade tömningar vid helgdagar som de står i kommunens schema.
- [ ] Kör `npm run build:streets` och checka in de nya filerna i `data/osm/`.
- [ ] Kör `npm run lint && npm test && npm run build`. Build-skriptet stoppar vid okända fraktioner, ogiltiga datum, dubbletter av id och adresser som pekar på ett schema som saknas.
- [ ] Prova några adresser i `npm run dev`.
- [ ] Ta bort kommunens rad ur tabellen i guiden, som för A.

Varje år behöver schemat förnyas, se [Uppdatera årets schema](#uppdatera-årets-schema).

## C. Begär ut kopplingen

Listan över vilka adresser som hör till vilket område är oftast en allmän handling. Skicka en begäran till kommunens eller avfallsbolagets registrator, med exempeltexten i [guiden](hitta-kommunens-data.md#steg-4-begär-kopplingen-från-kommunen). Matcha aldrig adresser mot områden på egen hand utifrån ortnamn eller kartor. En gissning som blir fel får folk att missa sin tömning.

Skriv in kommunen i tabellen i guiden med läget "Begärd som allmän handling", så att ingen annan gör samma sak. När tabellen har kommit fortsätter du med B.

## D. Ny källtyp

Stockholm Vatten och Avfall (`src/server/svoa.ts`, spec `docs/specs/2026-11-02-stockholm.md`) och VA Syd (`src/server/vasyd.ts`, spec `docs/specs/2026-11-03-malmo-vasyd.md`) är mönstret för en källa med en egen söktjänst. Liknar svaren EDP:s (byggnad med id, nästa tömning), som VA Syd:s, kan klienten ge `EdpBuilding` och återanvända `edpAddressId`, `withDetails` och ortindexet.

NSR (`src/server/nsr.ts`, spec `docs/specs/2026-11-03-nsr.md`) är exemplet på en källa med en ICS-fil per adress: riktiga datum för hela året, inga beräknade. Kontrollera att källans id är unikt. NSR:s är det inte, så där pekar gata, ort och id ut adressen tillsammans.

SRV återvinning (`src/server/srv.ts`, spec `docs/specs/2026-11-03-srv.md`) är exemplet på en källa vars sökning bara ger ett svar. Förslagen (`getSuggestions`) ger listan, och kundnumret slår upp schemat. Skriver källan postorten, och postorten saknas bland OpenStreetMaps orter eller finns i flera av källans kommuner, lägg den i källans `postorter` (ort → kommunkod).

- [ ] En klient i `src/server/<system>.ts` med sökning, schema och adress-id, testad mot sparade svar i `src/server/__fixtures__/`. Okänd form på svaret kastar `SourceError`, aldrig en tom lista.
- [ ] En ny variant i `SourceConfig` och en gren i `searchLiveSource` (`src/server/handlers.ts`) och `lookupAddress` (`src/server/lookup.ts`). Ett id som inte längre ger träff ska ge 502, inte 404, så att kalenderprenumerationer inte töms.
- [ ] En kontroll i bevakningen (`scripts/source-checks.ts`) och en kontrolladress i `PROBES`.
- [ ] `npm run build:streets` för källans kommuner.
- [ ] Berätta för källan att Sopor använder deras publika tjänst, med en kontaktadress (för Stockholm: ett mejl till SVOA:s kundtjänst, som förvaltaren skickar).

## Dataformatet

Gäller bara statiska källor (B).

### `data/<id>/<år>/schedules.json`

```json
{
  "year": 2026,
  "source": "Avesta Vatten och Avfall, hämtschema 2026",
  "validFrom": "2026-01-01",
  "validTo": "2027-01-10",
  "updatedAt": "2026-10-29",
  "note": "Påminnelse: ställ ut kärlen senast 06.00 på tömningsdagen.",
  "schedules": {
    "onsdag-jamn": {
      "name": "Trakt 4 – onsdag, varannan vecka",
      "bins": [{ "fraction": "rest", "sizeLiters": 190, "frequencyText": "Var 6:e vecka · onsdagar" }],
      "events": [
        { "date": "2026-11-11", "fractions": ["rest", "mat"] },
        { "date": "2027-01-07", "fractions": ["papper", "mat"],
          "deviation": { "originalDate": "2027-01-06", "reason": "trettondedag jul" } }
      ]
    }
  }
}
```

- `fractions` får vara `rest`, `mat`, `papper`, `plast`, `glas`, `metall`, `tidningar` eller `karl` (kärl med flera fraktioner, som fyrfack). Listan finns i `src/domain/fractions.ts`.
- `bins` är valfritt och visas inte på sajten, eftersom vi inte vet vilket abonnemang varje hushåll har.
- Avvikelser, till exempel vid helgdagar, skrivs in som de står i kommunens schema. Sopor räknar inte ut helgdagar själv.
- `validFrom` och `validTo` anger vilka datum filen gäller. Ett schema kan gå över årsskiftet.

### `data/<id>/<år>/addresses.csv`

```csv
# Rader som börjar med # är kommentarer
id,street,locality,schedule
krylbo-storgatan-12b,Storgatan 12 B,Krylbo,onsdag-jamn
```

- `id` är adressens stabila id, `<ort>-<gata>-<nummer><bokstav>` utan å, ä och ö. Det används i URL:en och i kalenderprenumerationen. **Ett id får aldrig ändras eller återanvändas**, inte heller om stavningen av gatan rättas.
- `schedule` pekar på en nyckel i samma års `schedules.json`.

## Uppdatera årets schema

Gäller statiska källor. EDP-källorna hämtas live och behöver inget.

- [ ] Skapa `data/<id>/<nytt år>/` med `schedules.json` och `addresses.csv`.
- [ ] Sätt `validFrom` till det datum då det nya schemat börjar gälla. Från det datumet ersätter den nya filen den gamla, även för adresser som byter trakt.
- [ ] Behåll samma adress-id som förra året. Nya adresser får nya id.
- [ ] Låt förra årets mapp ligga kvar, eftersom kalendrar visar historiken.
- [ ] Kör `npm run lint && npm test && npm run build` och kontrollera några adresser i `npm run dev`.

Prenumererade kalendrar hämtar den nya filen själva.

## Pull request

Öppna en pull request och fyll i mallen, med länk till kommunens publika källa. GitHub Actions kör samma kontroller, och stoppar ändringar som tar bort eller byter namn på ett befintligt adress-id.
