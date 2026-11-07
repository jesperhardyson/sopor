# Spec: Platser, dag och hjälptext för områden i API:t

Status: utkast, 2026-11-07. Issue [#119](https://github.com/jesperhardyson/sopor/issues/119).

## Bakgrund

Appen Sophämtning visar områdesval från `/api/v1/omraden`, men får bara namnet och `detail` ("Måndag, udda vecka · Trakt 1"). Webbens områdessida läser `public/data/<källa>/omraden.json` och visar etikett, dag, platser, sökning, förklaring och hjälptext.

## API:t

`/api/v1/omraden` läser redan `omraden.json`, så de nya fälten kommer från samma data som webben och kan inte glida isär.

- Varje träff får `area`: `day`, `label` (`null` utan etikett), `places`, `otherDays` och `searchTerms`. `searchTerms` är det webbens sökning matchar på, inklusive gator som inte står bland platserna.
- Svaret får `sources`: `id`, `name`, `explanation` och `help` per källa som svarade. En plats kan höra till fler än en källa, så det är en lista.
- Fälten finns med och utan `tomning`. `detail` och övriga fält är oförändrade.

## Beslut

1. **`area` är ett eget objekt, inte platta fält.** Träffarna har samma fält som adressträffarna i `/sok`, och objektet håller isär adressfälten och områdesfälten.
2. **Nya scheman i stället för att ändra `SearchHit`.** `/omraden` utan `tomning` svarar med `AreasResponse` och `AreaHit`, som är `SearchResponse` och `SearchHit` med de nya fälten. `/sok` är oförändrad.
3. **`help` tas som den står.** Den har redan källans telefonnummer. Kontaktuppgifterna i `/kallor` (#118) finns för den som vill länka numret.

## Utanför

- `/sok` får inte `area` för områdesträffar. Den läser adressfilen, inte `omraden.json`.
