# Spec: Gagnef, Leksand, Rättvik och Vansbro (Dala Vatten och Avfall)

Status: byggd, 2026-11-17. Gagnef och Vansbro syns i besöksstatistiken för kommunsidorna. Leksand och Rättvik följer med, eftersom samma bolag publicerar dem på samma sida.

## Bakgrund

Dala Vatten och Avfall (DVAA) sköter sophämtningen i Gagnef, Leksand, Rättvik och Vansbro. Sidan [Sophämtningsschema](https://www.dalavattenavfall.se/avfall-och-atervinning/sophamtningsschema.html) har en tabell per kommun för helårskunder med egna kärl. Kontrollerat 2026-11-17:

- **En rad per trakt:** nummer, veckodag, jämn eller udda vecka, byar och gator, och fyra kolumner med datum för 2026: matavfall (var 14:e dag), restavfall, plastförpackningar och pappersförpackningar (var 6:e vecka, förskjutna två veckor från varandra). Gagnef och Leksand har 10 trakter, Rättvik 8 och Vansbro 7.
- **Hämtning också på helgdagar:** tabellerna har tömningar på juldagen och nyårsdagen.
- **Ingen koppling adress → trakt** är publik. Den finns bara i appen Mitt DVA och på Mina sidor.
- **Fritidshus** (maj–september) finns inte i tabellerna, bara i appen.
- **Bara 2026 är publicerat.** Schemat för 2027 läggs in för hand när det kommer.
- Domänen `dalavattenochavfall.se` är en parkerad sida. Rätt adress är `dalavattenavfall.se`.

## Beslut

- **Statiska källor med områdesval**, som Säter: `dvaa-gagnef`, `dvaa-leksand`, `dvaa-rattvik` och `dvaa-vansbro`, en per kommun, med `selection: 'area'`. Id:na får aldrig ändras.
- **Områdenas id** följer dag och vecka (`jamn-tisdag`, `udda-fredag`), som i Säter, inte traktens nummer. Dag och vecka är unika i varje kommun. Numret står i `label` ("Område 1") och i `searchTerms` ("trakt 1").
- **Platserna** räknas upp som källan gör det. Gator (slutar på -vägen, -väg eller -gatan) läggs i `streets`. Utskrivna förkortningar: "Vansbro C" blir "Vansbro centrum", "RV 70" blir "riksväg 70", och "Norr och Söder | Bergsäng" blir "Norr och Söder Bergsäng". "Hedslund/Nyheden" blir två platser.
- **Delade namn:** är en plats i ett område slutet på en plats i ett annat ("Tjärna" och "Nedre Tjärna", "Heden" och "Övre Heden"), får det andra området det korta namnet i `searchTerms`. Annars döljer den exakta träffen det. Gäller Heden och Tällberg i Leksand, Boda i Rättvik och Tjärna i Gagnef.
- **Datumen** skrivs in som källan anger dem, utan framräkning. Ett datum i januari efter ett senare datum hör till nästa år ("1 januari" sist i listan är 2027-01-01).
- **Källans skrivfel rättas,** när datumet strider mot både traktens veckodag och fraktionens steg, och rätt datum är entydigt:

| Kommun | Trakt | Fraktion | Källan | Rättat |
|---|---|---|---|---|
| Gagnef | 8 (fredag) | Restavfall | 10 mars (tisdag) | 10 april |
| Gagnef | 8 (fredag) | Plast | 1 december (tisdag) | 1 januari 2027 |
| Gagnef | 10 (torsdag) | Matavfall | 28 januari, före 22 januari | 8 januari |
| Leksand | 7 (tisdag) | Restavfall | 24 december, mellan 13 januari och 7 april | 24 februari |
| Leksand | 8 (onsdag) | Restavfall | 6 april (måndag) | 6 maj |
| Vansbro | 2 (tisdag) | Papper | 7 februari (lördag) | 17 februari |

  Testerna kontrollerar veckodag och steg för alla trakter, så ett nytt skrivfel i nästa års schema syns. Bara rättningen för Gagnef trakt 8 (plast) ligger i framtiden.
- **Källornas text:** `areaNotice` säger att besökaren väljer trakten själv och att schemat inte gäller fritidshus. `emptyScheduleNote` säger att nästa års schema inte är publicerat än och hänvisar till appen.

## Ett kommunnamn betyder kommunen

Leksand har en by som heter Stockholm. Sökningen "Stallgatan 5, Stockholm" visade därför Leksands områdesval. `namesSource` följer nu samma regel som `sourcesAtPlace`: är platsen ett kommunnamn gäller bara källor i den kommunen. Det rättar också "Leksand", som tidigare inte kändes igen som Leksands kommun (genitiv-s). Sajtens sökning och API v1 (`/omraden?plats=`) använder regeln.

## Test

- `src/data/dvaa.test.ts`: alla fyra kommunernas filer, veckodag och steg per fraktion, områdenas id och rättningarna.
- `namesSource` i `src/data/street-index.test.ts`, och testet "ger ingen rad för områdesval när platsen är en annan" i `src/providers/area-search.test.ts` med Sveriges orter.
