# Sopor

**[sopor.hardyson.se](https://sopor.hardyson.se)**: skriv in din adress och se vilka sopkärl som töms vilket datum. Schemat kan läggas in i den egna kalendern eller i Homey och Home Assistant.

Sopor är en **inofficiell** hobbytjänst. Den är inte kopplad till någon kommun eller något avfallsbolag. Vid avvikelser gäller alltid kommunens information.

- **Inga konton och ingen databas.** Sparade adresser ligger bara i webbläsaren.
- **Bara publika källor.** Data hämtas från kommunernas egna hämtschema och söktjänster, aldrig från inloggade tjänster som Mina sidor.
- **Gratis att driva.** Sajten är statisk, och små Vercel-funktioner hämtar och cachar schemat. Allt ryms i Vercels gratisplan.

## Bidra

Det viktigaste bidraget är **fler kommuner**, och de flesta bidrag kräver ingen kod.

| Du vill … | Gör så här |
|---|---|
| tipsa om din kommun | Följ [guiden om att hitta kommunens data](docs/kommuner/hitta-kommunens-data.md) och öppna ett [ärende om ny kommun](https://github.com/jesperhardyson/sopor/issues/new?template=ny-kommun.md). |
| rapportera ett fel i schemat | Öppna ett [ärende om fel i schemat](https://github.com/jesperhardyson/sopor/issues/new?template=fel-i-schemat.md) med adress, datum och länk till kommunens uppgift. |
| lägga in en kommun själv | Följ [checklistan för att lägga till en kommun](docs/kommuner/lagga-till-kommun.md). |
| ändra i koden | Läs [`CONTRIBUTING.md`](CONTRIBUTING.md) och [utvecklarguiden](docs/utveckling.md). |

Det går också bra att mejla support@hardyson.se. Säkerhetsbrister rapporteras enligt [`SECURITY.md`](SECURITY.md).

## Kom igång

Kräver Node 22 eller senare.

```bash
npm install
npm run dev                                  # genererar data och startar http://localhost:5173
npm run lint && npm test && npm run build    # samma kontroller som CI
```

Hur koden hänger ihop, hur du provar med testdata och hur sajten driftsätts står i [utvecklarguiden](docs/utveckling.md).

## Integrationer och API

| | Vad | Dokumentation |
|---|---|---|
| **Homey** | Appen Sophämtning, testversion i Homey App Store | [`integrations/homey/`](integrations/homey/README.md) |
| **Home Assistant** | Integrationen Sophämtning, via HACS | [`integrations/home-assistant/`](integrations/home-assistant/README.md) |
| **Eget bygge** | Öppet JSON-API på `https://sopor.hardyson.se/api/v1` | [`docs/api.md`](docs/api.md) |

Integrationerna är egna paket som bara använder det publika API:t.

## Dokumenten

- [`CONTRIBUTING.md`](CONTRIBUTING.md): hur ett bidrag går till, och reglerna
- [`docs/kommuner/`](docs/kommuner/): hitta kommunens data, lägga till en kommun och dataformatet
- [`docs/utveckling.md`](docs/utveckling.md): arkitektur, testdata, nya typer av källor, versioner och driftsättning
- [`docs/api.md`](docs/api.md): det publika API:t
- [`docs/specs/`](docs/specs/) och [`docs/plans/`](docs/plans/): specifikationer och implementationsplaner
- [`AGENTS.md`](AGENTS.md): arkitekturreglerna. De är skrivna för AI-agenter men gäller alla.

## Licens

[MIT](LICENSE). Datan om tömningar kommer från respektive kommun.

Gatu- och ortnamn © [OpenStreetMaps bidragsgivare](https://www.openstreetmap.org/copyright), tillgängliga under ODbL. Indexet i `data/osm/` delas under samma licens.
