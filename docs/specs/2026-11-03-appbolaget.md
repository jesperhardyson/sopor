# Spec: Kristianstad och Hässleholm (Appbolaget)

Status: utkast, 2026-11-03. Tredje källtypen i fas 2 i `docs/plans/2026-11-03-fler-kommuner.md` (Avfallsapp/Nova hoppas över, beslut 5).

## Bakgrund

Renhållningen Kristianstad och Hässleholm Miljö visar tömningsschemat med Appbolagets plattform, `api-universal.appbolaget.se`. Plattformen har flera kunder, och kunden anges med ett id (`Unit`) som kundernas egna sajter skickar med. Det är ingen inloggning, kaka eller nyckel. Kristianstad har cirka 86 000 invånare och Hässleholm cirka 53 000.

Kontrollerat 2026-11-03, med Sopors User-Agent:

```
GET https://api-universal.appbolaget.se/waste/addresses/search?query=Storgatan 1&limit=100
    Module: universal
    Unit: e34d7050-1b2a-4917-a921-0ea7742d0a6e      (Hässleholm Miljö)
→ {"status":200,"data":[{"uuid":"4fcea803-…","alias":"hmab-storgatan-1-vinsloev","address":"STORGATAN 1","city":"VINSLÖV","designation":"LOKET 3"}, …],
   "pagination":{"next":false,"page":"1"}}

GET …/waste/addresses/4fcea803-1a26-49a1-b66f-b41a631ed823   (samma huvuden)
→ {"data":{"uuid":"4fcea803-…","address":"STORGATAN 1","city":"VINSLÖV","property_id":"0712403013","services":null, …}}

GET …/@universal/waste/properties/0712403013/?unit=e34d7050-1b2a-4917-a921-0ea7742d0a6e
→ {"data":{"services":[{"collection_at":null,"code":{"description":"Kärl1","description_verbose":"Fyrfack kärl 1 Plast och Pappersförpackningar"},
                        "collections":[{"collection_at":"2026-11-11 23:00:00"}, …], "route":{"exceptions":[…]}}, …]}}
```

Kristianstads `Unit` är `dd905ce7-b16d-4422-be36-564169af4035`.

- **Sökningen** ger 25 träffar, eller upp till 100 med `limit=100`. Med orten i frågan ("Storgatan 1, Vinslöv") blir det inga träffar, och inte heller med en bokstav efter numret ("Västra Storgatan 1A"). Utan `Unit` blir det inga träffar alls.
- **Adressen** har ett uuid och `property_id`, fastigheten som schemat hänger på.
- **Fastigheten** har en lista `services`, en per kärl eller avgift:
  - **Hässleholm** har hela årets tömningar i `collections`, som tidsstämplar i UTC: `2026-11-11 23:00:00` är den 12 november i Sverige.
  - **Kristianstad** har bara nästa tömning (`collection_at`) och frekvensen i texten: "1 gång/vecka", "varannan vecka", "var 4:e vecka", "var 8:e vecka", "2 ggr/vecka". Turens flyttade tömningar står i `route.exceptions` (`old_date`, `new_date`).
- **Avgifter är inga tömningar.** Hässleholm har raderna "Budad hämtning" ("Grundavgift, per lägenhet", "Avgift för tömning av fyrfackskärl, helår") med datum en gång i månaden.
- **Avfallstyper** (`code.description`) i ett svep över 64 adresser:
  - Kristianstad: `Matavfall`, `Restavfall`, `Pappersförp`, `Plastförp`, `Metallförp`, `Tidningar`, `Färgat Glas`, `Ofärgat Glas`, `Kärl 1`, `Kärl 2` (fyrfackskärl), `Trädgårdsavfall` och `Batterier`.
  - Hässleholm: samma och `Kärl1`, `Kärl2`, `Brännbart`, `Metall`, `Returpapper`, `Plast/Papper`, `Deponi` och `PK`.
- **Personuppgifter:** `route.exceptions[].meta` har namn på den som ändrade. Sopor läser aldrig `meta`.

## Beslut

- **Regel 4.** `Unit` är kundens id på plattformen och står i klartext på kundens sajt (`pdfUrl` i Hässleholms tömningskalender, och Kristianstads `utility-bar.js` skickar det i varje anrop). Det räknas som en publik källa, som Affärsverken (beslut 3). Skulle Appbolaget börja kräva inloggning tas källorna bort.
- **En ny källtyp, `appbolaget`**, med kunden som inställning: `{ system: 'appbolaget', unit: '<uuid>' }`. Nästa kund på plattformen blir en rad i registret.
- **Två källor:**
  - `{ id: 'kristianstad', name: 'Renhållningen Kristianstad', url: 'https://renhallningen-kristianstad.se', kommuner: [Kristianstad 1290] }`
  - `{ id: 'hassleholm', name: 'Hässleholm Miljö', url: 'https://hassleholmmiljo.se', kommuner: [Hässleholm 1293] }`
  
  Id:na får aldrig ändras.
- **Samma skydd som NSR och SRV:** okänd form ger ett fel, aldrig en tom lista. Ett id utan träff ger 502, inte 404.
- **Hässleholms datum är källans egna.** Kristianstads räknas fram ur nästa tömning och frekvensen och märks *beräknade*, som för EDP. Flyttade tömningar i turen läggs in och får en varning.

## Klienten (`src/server/appbolaget.ts`)

```ts
export const APPBOLAGET_URL = 'https://api-universal.appbolaget.se'
export async function appbolagetSearch(unit: string, q: string, fetchFn?, timeoutMs?): Promise<AppbolagetAddress[]>
export async function appbolagetFind(unit: string, id: string, fetchFn?, timeoutMs?): Promise<AppbolagetAddress | null>
export async function appbolagetSchedule(unit: string, address: AppbolagetAddress, fetchFn?, timeoutMs?, today?): Promise<Schedule>
```

- **Adress-id som EDP:** adressen blir en `EdpBuilding` (`street` och `locality` med stor bokstav först, `buildingId` = uuid:t utan bindestreck), och adress-id:t blir `edpAddressId`: `storgatan-1_vinslöv-4fcea8031a2649a1b66fb41a631ed823`. Formatet får aldrig ändras (regel 3), och ett test låser exemplet.
- **Uppslaget** hämtar adressen direkt med uuid:t i id:t. Ingen sökning behövs, och ett nytt gatunamn bryter inte id:t.
- **Sökningen** tar bort bokstaven efter numret och orten (de ger inga träffar), med `limit=100`. Sajten filtrerar på orten efteråt, som för NSR.
- **Särskiljare:** flera träffar med samma gata och ort får fastighetsbeteckningen ("Loket 3").
- **Form:** sökningen måste ha listan `data` med `uuid`, `address` och `city` (som får vara null). Adressen måste ha `property_id`. Fastigheten måste ha listan `services`, där varje rad har `code.description` och antingen listan `collections` eller `collection_at`. Allt annat kastar `SourceError('api-universal.appbolaget.se svarade med ett okänt format')`. En adress utan `property_id` får ett tomt schema.
- **Schemat:**
  - Rader med `code.description` "Budad hämtning" hoppas över.
  - Har raden `collections` blir tidsstämplarna datum i Europe/Stockholm, från i dag (`estimated: false`).
  - Annars räknas tömningarna fram med `expandEvery` ur `collection_at` och frekvensen i `description_verbose` (varje vecka 7 dagar, varannan vecka 14, var n:e vecka n · 7). Okänd frekvens, som "2 ggr/vecka", ger bara nästa tömning.
  - Ett framräknat datum som är `old_date` i turens `exceptions` flyttas till `new_date` och får varningen "Flyttad tömning."

### Fraktioner

`mapWasteType(code.description, '', code.description_verbose)`, med ett tillägg i `src/server/fractions-map.ts`:

| Text | Fraktioner |
|---|---|
| `Pappersförp`, `Plastförp`, `Metallförp`, `Metall`, `Färgat Glas`, `Ofärgat Glas`, `Tidningar`, `Brännbart`, `Plast/Papper` | finns redan |
| `Returpapper` | `tidningar` (nytt) |
| `Kärl 1`, `Kärl1`, `Kärl 2`, `Kärl2` | `karl` med texten "Fyrfackskärl 1" och "Fyrfackskärl 2" ("Fyrfack" i beskrivningen) |
| `Trädgårdsavfall`, `Batterier` | `karl` med källans text, kända kärl (finns redan) |
| `Deponi`, `PK` | `karl` med källans text, rapporteras av bevakningen |

## Sökning, uppslag och sajten

- `searchLiveSource` får en gren för `appbolaget`: `appbolagetSearch` utan orten, `matchesPlace` med orten, som NSR.
- `lookupAddress` får en gren för `appbolaget`: `appbolagetFind` → `appbolagetSchedule`. Ingen träff ger **502**.
- **En kommun per källa**, så ingen ortindex behövs.
- **Gatuindex:** `data/osm/1290.json` och `1293.json` med `npm run build:streets`.

## Bevakningen

- `checkAppbolagetSource` i `scripts/source-checks.ts`, med samma lägen och samma fallback via sajten som de andra.
- Kontrolladresserna i `PROBES` är adress-id: Hovrätten i Kristianstad (`västra-storgatan-1_kristianstad-…`) och Storgatan 1 i Vinslöv (`storgatan-1_vinslöv-…`). Hittas de inte blir läget `nytt-format`.
- Okända avfallstyper (utom `isKnownBin` och "Budad hämtning") rapporteras.

## Test

- Sparade svar i `src/server/__fixtures__/`: sökningen, adressen och fastigheten för en adress i varje kommun.
- `appbolagetSearch`, `appbolagetFind` och `appbolagetSchedule` mot de sparade svaren och för okänd form.
- Schemat: UTC-tid blir svenskt datum, avgifter hoppas över, Kristianstads frekvenser räknas fram, och en flyttad tömning flyttas.
- Adress-id:t är låst, och `Unit` skickas med i varje anrop.
- `handleSearch`, `handleSchedule`, `handleIcs` och `handleV1Search` med en `appbolaget`-källa. Ett id utan träff ger 502.
- Bevakningen: fungerar, svarar inte, nytt format, tom och ett id som inte längre finns.

## Dokumentation

- `docs/kommuner/lagga-till-kommun.md`, avsnitt D: Appbolaget, och hur en ny kund läggs till (`Unit` från kundens sajt).
- Planen för fler kommuner: Appbolaget klar i fas 2.
- `docs/kommuner/hitta-kommunens-data.md`: Kristianstad och Hässleholm.
