# Spec: Bevakning av källorna

Status: utkast, 2026-11-02. Punkt 11 i `docs/plans/2026-11-02-forbattringar.md`. Fyller i det som specen för hela Sverige (`2026-10-30-sopor-hela-sverige-design.md`, avsnittet om snabbhet och robusthet) lovar men lämnade öppet: "Hur övervakningen av källor ska se ut i detalj."

## Bakgrund

Sopor hämtar scheman live från 26 EDP-källor. Testerna körs mot sparade svar (`src/server/__fixtures__`), så de märker inte när en källa ändrar sig. `npm run check:source` gör en riktig kontroll, men bara när någon kör den. Homey-appens nattliga rökprov anropar sajtens API för en adress i Uppsala, så det kontrollerar API:t, inte källorna.

En trasig källa märks därför först när någon hör av sig. Den 2 november fick Lidköping timeout tre gånger, och det syntes bara i Vercels fellogg.

## Beslut

- **En gång i veckan**, natten mot måndag, och dessutom när som helst för hand (`workflow_dispatch`).
- **Ett GitHub-ärende per källa och problem.** Ärendet får kommentarer så länge problemet finns kvar och stängs av sig självt när källan fungerar igen.
- **Okända avfallstyper** ger också ett ärende, men med lägre prioritet (egen etikett), så att `src/server/fractions-map.ts` kan kompletteras.
- **Samma kod som sajten.** Bevakningen anropar `edpSearch` och `edpSchedule` i `src/server/edp.ts`, så att det som testas är det som körs i produktion.
- **Bara publika anrop**, som allt annat (AGENTS.md regel 4): User-Agent `Sopor/1.0 (+https://sopor.hardyson.se)`, en sökning och ett schema per källa, och ett nytt försök bara för källor som inte svarade.
- **Ingen ändring på sajten och inga anrop till Vercel.** Bevakningen körs i GitHub Actions och kostar ingenting.

## Utanför

- Att uppdatera fixtures automatiskt. När formatet har ändrats uppdaterar man fixturen för hand i samma PR som rättar koden.
- Bevakning av sajtens eget API. Det gör Homey-appens rökprov redan.
- Vercels fellogg och användning. Loggarna sparas bara en timme på Hobby.
- Källor som inte är EDP. När fas 3 lägger till ett nytt system får det en egen kontroll i samma skript.

## Vad som kontrolleras

För varje källa som syns på sajten (`SOURCES`, alltså inte `hidden`):

| Läge | Hur det upptäcks | Etikett |
|---|---|---|
| **Fungerar** | Sökningen ger adresser, och schemat har minst en tömning de närmaste 60 dagarna. | – |
| **Svarar inte** | Timeout, nätverksfel eller HTTP 5xx, även vid det nya försöket. | `källa` |
| **Nytt format** | Svaret är inte JSON, saknar `Buildings` eller `RhServices`, eller ingen adress går att tolka med `parseBuilding`. | `källa` |
| **Tom** | Sökningen svarar som vanligt men utan adresser för kontrolladressen. | `källa` |
| **Inga tömningar** | Schemat hämtas, men har ingen tömning de närmaste 60 dagarna. | `källa` |
| **Okända avfallstyper** | `classifyWasteTypes` (från `scripts/check-source.ts`) ger `okänd` för någon `WasteType`. | `källa`, `avfallstyp` |

En källa kan ha "Okända avfallstyper" samtidigt som den fungerar. De övriga lägena utesluter varandra.

Statiska källor anropar ingenting. För dem kontrolleras bara att datafilerna räcker: om det senaste årets `validTo` är mindre än 60 dagar bort blir läget **Schemat tar slut** (etikett `källa`). I dag är den enda statiska källan dold, så kontrollen gör ingenting förrän en statisk källa syns på sajten.

### Kontrolladress

Varje live-källa har en känd adress att söka på, i en lista i skriptet:

```ts
const PROBES: Record<string, string> = {
  uppsala: 'Storgatan 2, Uppsala',
  orebro: '…',
  // en per live-källa
}
```

- Ett test kräver att varje källa i `SOURCES` med `system: 'edp'` har en kontrolladress, så att en ny källa inte glöms bort. Checklistan i `docs/kommuner/lagga-till-kommun.md` får en rad om det.
- Adresserna väljs bland dem som `check:source` visar när källan läggs till. För befintliga källor tas de fram en gång när skriptet skrivs.
- Sökningen använder hela kontrolladressen, och schemat hämtas för den första adressen i svaret.

### Nytt försök

Källor som är **Svarar inte** efter den första omgången prövas igen efter fem minuter. Först om de inte svarar då heller räknas läget. Tillfälliga avbrott, som Lidköpings, ger alltså inget ärende.

## Ärenden

- **Titel:** källans namn och läget, till exempel "Källa: Lidköpings kommun svarar inte" eller "Källa: Region Gotland har nytt format".
- **Text:** källans namn och id, `baseUrl`, kontrolladressen, felet som det kom (till exempel `futureweb.lidkoping.se svarade 502`) och datum. För okända avfallstyper listas typerna. Sist står hur man provar själv: `npm run check:source -- <baseUrl> "<kontrolladress>"`.
- **Nyckel:** en dold markering i texten, `<!-- sopor-bevakning: lidkoping svarar-inte -->`, så att skriptet hittar sitt eget ärende utan att lita på titeln.
- **Redan öppet ärende för samma källa och läge:** en kommentar med veckans datum och felet. Inget nytt ärende.
- **Källan fungerar igen:** ärendet får en kommentar ("Fungerar igen 2026-11-09") och stängs.
- **Byter läge** (till exempel från "Svarar inte" till "Nytt format"): det gamla ärendet stängs och ett nytt öppnas.
- **Ärenden som inte kommer från bevakningen**, till exempel en felrapport från en användare, rörs aldrig, eftersom de saknar markeringen.

Etiketterna `källa` och `avfallstyp` skapas av skriptet om de saknas.

## Arbetsflöde

`.github/workflows/sources.yml`:

- `schedule: cron '15 3 * * 1'` (måndag 04.15 eller 05.15 svensk tid) och `workflow_dispatch`.
- Jobbet heter `sources`. Inget jobb får heta `test`, eftersom det namnet är den obligatoriska checken för `main`.
- `permissions: contents: read, issues: write`. Inga hemligheter utöver det inbyggda `GITHUB_TOKEN`.
- Steg: checkout, setup-node 22, `npm ci`, `npm run monitor:sources`.
- Jobbet lyckas även när källor är trasiga, eftersom ärendena är signalen. Det fallerar bara om skriptet självt kraschar, och då mejlar GitHub som vanligt.
- GitHub stänger av schemalagda arbetsflöden i publika repon efter 60 dagar utan aktivitet i repot. Dependabot håller repot aktivt, men det är värt att känna till om bevakningen tystnar.

## Skriptet

`scripts/monitor-sources.ts`, `npm run monitor:sources`. Uppdelat så att allt utom nätverket går att testa:

1. **`checkEdpSource(source, probe, fetchFn)`** → ett resultat med läge, fel och avfallstyper. Testas med sparade svar, som `check-source.test.ts`.
2. **`checkStaticSource(source, years, today)`** → läge för statiska källor. Ren funktion.
3. **`planIssues(results, openIssues, today)`** → en lista med åtgärder: öppna, kommentera eller stänga. Ren funktion, och det är här reglerna ovan testas.
4. **`applyIssues(actions)`**: anropar GitHubs REST-API med `fetch` och `GITHUB_TOKEN`. Inga nya beroenden.
5. **Utskrift:** en tabell med en rad per källa i jobbets logg och i `GITHUB_STEP_SUMMARY`.

Utan `GITHUB_TOKEN` (lokalt) körs bara kontrollen och utskriften, och planerade åtgärder skrivs ut i stället för att utföras. Då går det att köra `npm run monitor:sources` på sin egen dator.

## Test

- Varje läge i tabellen, med sparade svar och ett falskt `fetch`.
- Nytt försök: en källa som svarar andra gången ger inget ärende.
- `planIssues`: öppna, kommentera, stänga, byta läge och att ärenden utan markering lämnas orörda.
- Att varje synlig EDP-källa har en kontrolladress.
- Arbetsflödena: ett nytt test, `scripts/workflows.test.ts`, läser alla filer i `.github/workflows/` och kräver att inget jobb heter `test` utom i `ci.yml`. Regeln står i AGENTS.md men kontrolleras inte i dag. Jobben hittas med ett enkelt mönster (två blanksteg, namn, kolon direkt under `jobs:`), så att inget YAML-bibliotek behövs.

## Dokumentation

- `docs/utveckling.md`: ett stycke om bevakningen, hur man läser ärendena och hur man kör den själv.
- `docs/kommuner/lagga-till-kommun.md`: "Lägg till en kontrolladress i `PROBES`".
- Förbättringslistan: punkt 11 bockas av.
