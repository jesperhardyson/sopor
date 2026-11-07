# Spec: Kontaktuppgifter för källorna i API:t

Status: utkast, 2026-11-07. Issue [#118](https://github.com/jesperhardyson/sopor/issues/118).

## Bakgrund

Appen Sophämtning vill visa vem som ansvarar för hämtningen och hur man når dem. `/api/v1/kallor` ger i dag bara `id`, `name`, `url`, `kommuner` och `testData`.

## Datamodellen

Varje källa i `src/sources/index.ts` kan ha ett valfritt `contact`:

```ts
contact?: {
  phone?: { number: string; display: string } // E.164 och svenskt format att visa
  email?: string // kundtjänst, aldrig en person
  page?: string // källans kontaktsida
  checked: { url: string; date: string } // sidan uppgifterna kommer från och när de kontrollerades
}
```

- Minst en av `phone`, `email` och `page` finns, annars saknas `contact`.
- `checked.url` och `page` ligger på källans egen webbplats: samma domän som `url`, eller en underdomän till den.
- Delade organisationer (Roslagsvatten, VIVAB) har samma uppgifter för alla sina källor.

## API:t

`/api/v1/kallor` får fältet `contact` per källa, med samma delar som modellen men platt:

```json
"contact": {
  "phone": { "number": "+46226645500", "display": "0226-64 55 00" },
  "email": "avestavatten@avesta.se",
  "page": "https://www.avestavatten.se/support/",
  "checkedAt": "2026-11-07",
  "checkedUrl": "https://avestavatten.se/support/"
}
```

- `contact` är `null` när inget är känt, och `phone`, `email` och `page` är `null` var för sig. Issuet föreslog att utelämna fälten, men API:t lovar att fält utan värde skickas som `null` (`docs/api.md`, och ett test kräver att alla fält i schemana är obligatoriska). Fältet är nytt, så befintliga klienter påverkas inte.
- `checkedAt` och `checkedUrl` finns alltid när `contact` finns, så att klienten kan visa varifrån uppgifterna kommer och hur gamla de är.
- OpenAPI-beskrivningen och `docs/api.md` uppdateras. Kontraktstestet täcker en källa med och en utan `contact`.

## Källorna (kontrollerade 2026-11-07)

- 41 av 44 källor har uppgifter. Kommunerna har kommunens kontaktcenter, eftersom det är dit man vänder sig om sophämtningen.
- Lycksele har LAVAB:s kundtjänst (avfallsbolaget, under lycksele.se/lavab).
- E-post saknas för Kretslopp Sydost (bara ett formulär), VIVAB (adressen syns bara med JavaScript), Lidingö (bara registrator) och Hässleholm Miljö (texten och länken visar olika adresser).
- Danderyd har ingen telefon i det som gick att läsa.
- Utan uppgifter: VA Syd (webbplatsen spärrar automatisk hämtning), Telge Återvinning (sidan visar inget utan JavaScript) och Remondis i Herrljunga och Vårgårda (remondis.se leder till remondis.com). De fylls i för hand.
- Två källor har bytt webbplats, så `url` ändras: Nacka (`nvoa.se` → `nacka.se/nackavattenavfall`) och VIVAB (`vivab.info` → `vivab.se`).

## Tester

- Alla källors uppgifter valideras: E.164 (`+46` följt av siffror), e-postformat, `https`, källans egen domän och datum som `YYYY-MM-DD`.
- `/kallor` ger `contact` för en källa som har det och `null` för en som saknar det.

## Utanför

- Webbplatsen visar inte uppgifterna än. Kortet "Schemat kommer från" (`SourceNote`) är den naturliga platsen, men designen i `docs/design/sopor-design.pen` behöver visa det först.
- Automatisk bevakning av att uppgifterna fortfarande stämmer. Datumet gör det synligt när de är gamla.
