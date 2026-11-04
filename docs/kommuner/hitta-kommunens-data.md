# Så hittar du din kommuns hämtschema

Den här guiden är för dig som vill få in din kommun i Sopor. Du behöver inte kunna programmera för att göra steg 1–4. Det räcker långt att ta reda på var datan finns och berätta det i ett [ärende om ny kommun](https://github.com/jesperhardyson/sopor/issues/new?template=ny-kommun.md).

## Vad Sopor behöver

För att visa tömningar för en adress behövs två saker:

1. **Schemat:** vilka datum som varje område töms, och vilka fraktioner (restavfall, matavfall, papper, plast och så vidare). Flyttade tömningar vid helgdagar behövs också.
2. **Kopplingen från adress till område:** vilket schema, eller vilken trakt, som gäller för en viss adress.

Ofta är schemat publikt men kopplingen inte. Då behöver kopplingen begäras från kommunen (se steg 4).

Sopor använder bara **publika källor**. Tjänster som kräver inloggning, som Mina sidor, BankID eller kundportaler, får inte användas, inte heller med ditt eget konto.

## Steg 1: Hitta schemat på kommunens webbplats

- Sök på kommunens namn tillsammans med *hämtschema*, *tömningsschema*, *hämtningsdagar* eller *sophämtning*.
- Ta reda på vem som sköter hämtningen: kommunen själv, ett kommunalt bolag (till exempel *X Vatten och Avfall*) eller ett kommunalförbund.
- Notera i vilken form schemat finns:
  - **PDF per område eller trakt**, ofta en ny fil varje år (som i Avesta).
  - **Webbsida med områden per veckodag** och jämn eller udda vecka (som i Säter).
  - **Söktjänst där man skriver sin adress** och får sitt schema. Kolla då steg 2.

## Steg 2: Finns en publik söktjänst per adress?

Många kommuner och VA-bolag använder kundsystemet **EDP Future**. Det har en publik modul för hämtschema, *SimpleWastePickup*, som inte kräver inloggning. Finns den med data kan Sopor hämta schemat direkt per adress, utan datafiler.

Kommunens "Mina sidor" ligger ofta på en adress som `minasidor.<bolag>.se`. Prova värden med skriptet `check:source` (kräver Node, se [Kom igång](../../README.md#kom-igång)). Det använder samma kod som sajten:

```bash
npm run check:source -- minasidor.vivab.info "Storgatan 1" --ort Varberg
```

Skriptet provar de kända sökvägarna (`/FutureWeb`, `/FutureWebBasic`, `/EDPFutureWeb`, `/EDP/FutureWebBasic` och, med `--ort`, `/<Ort>/FutureWeb`, `/FutureWeb<Ort>` med flera) och slutar vid den första som ger adresser. Sedan skriver det ut:

- **baseUrl** som fungerar, färdig att klistra in i registret, och om den redan finns där
- **adresserna** som söktjänsten hittade
- **fraktionerna** som varje avfallstyp blir, och **okända avfallstyper** som visas som "kärl" med källans egen text
- **svarstiden** för varje anrop

Svarar tjänsten men utan adresser för flera olika gator är modulen tom, och kommunen kan behöva fylla den (så är det i Avesta). Hittar skriptet ingen tjänst alls kan sökvägen ha ett eget namn (som `FutureWebVKFHus` hos Vafab). Öppna då "Mina sidor" i webbläsaren, se vad adressen slutar på och ge hela adressen till skriptet: `npm run check:source -- https://VÄRD/SÖKVÄG "Storgatan 1"`.

Kan du inte köra skriptet räcker det att skriva värden i ärendet, så provar någon annan.

**Andra system:** visar "Mina sidor" bara en inloggning, till exempel med BankID eller i en kundportal från CGI, finns det oftast ingen publik söktjänst. Då går du vidare till steg 3.

## Steg 3: Om bara schemat per område är publikt

Det är det vanligaste fallet. Schemat kan läggas in som datafiler i Sopor (se [checklistan](lagga-till-kommun.md#b-statisk-data)). Det som saknas är vilken adress som hör till vilket område.

Matcha inte adresser mot områden på egen hand utifrån ortnamn eller kartor. En gissning som blir fel får folk att missa sin tömning.

## Steg 4: Begär kopplingen från kommunen

Listan över vilka adresser som hör till vilket område är oftast en **allmän handling** som vem som helst kan begära ut (offentlighetsprincipen). Skicka en begäran till kommunens eller avfallsbolagets registrator, till exempel:

> Hej! Jag begär ut den förteckning som visar vilket hämtområde (trakt/tur) varje adress i kommunen tillhör för hushållsavfall, helst i ett maskinläsbart format som CSV eller Excel. Jag vill också fråga om ni har något emot att uppgifterna återpubliceras i den ideella tjänsten Sopor (sopor.hardyson.se), som visar hämtdagar per adress.
>
> Om ni har en publik söktjänst för hämtschema (till exempel EDP Futures modul SimpleWastePickup) vore det också bra att veta om den kan fyllas med data.

Berätta i ärendet att du har skickat en begäran, så att ingen annan gör samma sak. Myndigheter ska handlägga en begäran om allmän handling skyndsamt, men det kan ta några veckor.

## Steg 5: Berätta vad du hittat

Öppna ett [ärende om ny kommun](https://github.com/jesperhardyson/sopor/issues/new?template=ny-kommun.md) eller mejla support@hardyson.se med det du hittat. Kan du programmera får du gärna lägga in kommunen själv enligt [checklistan](lagga-till-kommun.md).

## Vad vi vet om kommunerna hittills

Kommunerna som redan är live på sajten listas på [Om-sidan](https://sopor.hardyson.se/om) och i `src/sources/index.ts`. Tabellen tar bara med kommuner som har undersökts men inte är live än.

| Kommun | Sköts av | Schema publikt | Söktjänst per adress | Adress → område | Läge |
|---|---|---|---|---|---|
| Säter | Kommunen ansvarar, Borlänge Energi hämtar | [Webbsida](https://sater.se/bygga-bo-miljo/avfall-och-atervinning/hamtningsdagar-sophamtning/) med områden per veckodag och jämn/ojämn vecka, plus fraktionernas veckor till och med vecka 53 | Nej. Borlänge Energis sökning har inte Säters adresser (20 gator, 2026-11-04). Mina sidor (`minasidorva.sater.se`) är en kundportal från CGI som kräver BankID | Saknas på webben. OpenStreetMap har inga gränser för områdena | Dold på sajten, med områdesval och riktig data. Väntar på schemat efter vecka 53 |
| Mölndal | – | – | EDP Future svarar men är tom (`future.molndal.se/FutureWeb`, 2026-11-03) | – | Inte med |
| Östersund | – | – | EDP Future svarar men är tom (`edp.ostersund.se/FutureWeb`, 2026-11-03) | – | Inte med |
| Upplands Väsby | Kommunen | – | EDP Future svarar men är tom (`edpfuture.upplandsvasby.se/FutureWeb`). Kommunen hänvisar till inloggning på Mina sidor | – | Inte med |
| Täby | Kommunen (Verdis) | – | Egen JSON i Sitevision-appen `garbageTruckFetcher` på taby.se (`/appresource/…/getAddresses` och `getContainer`), ger datum per fraktion ungefär ett år fram | – | Kandidat för egen källtyp (fas 3) |
| Vallentuna | Kommunen (PreZero) | – | Bara Avfallsapp (`vallentuna.avfallsapp.se`), som kräver en anonym enhetsregistrering | – | Inte med: Avfallsapp hoppas över (beslut 5 i `docs/plans/2026-11-03-fler-kommuner.md`) |
| Kristianstad | Renhållningen Kristianstad | – | Appbolaget (`api-universal.appbolaget.se`, `Unit` i sajtens `utility-bar.js`), ger nästa tömning och frekvensen | – | Med (Appbolaget, 2026-11-03) |
| Hässleholm | Hässleholm Miljö | – | Appbolaget (`Unit` i tömningskalenderns PDF-länk), ger hela årets tömningar | – | Med (Appbolaget, 2026-11-03) |
| Uddevalla | Uddevalla Energi | – | Egen JSON (`app.uddevallaenergi.se`), ger nästa tömning per kärl utan frekvens | – | Med (2026-11-04) |
| Borlänge | Borlänge Energi | – | Sitevision-appen `se.soleil.garbageTruckFetcher` (JSON, `borlange-energi.se/appresource/…`), ger nästa tömning per kärl utan frekvens och årtal. Täcker inte Säter | – | Med (2026-11-04) |
| Österåker, Ekerö, Vaxholm | Roslagsvatten | – | Egen tjänst (HTML i JSON, `roslagsvatten.se/schedule/search` och `/schedule/fetch`), ger nästa tömning och frekvensen per kärl. EDP (`edpmypage.roslagsvatten.se`) svarar 404 | – | Med (2026-11-04) |
| Lysekil, Sotenäs, Munkedal, Tanum | Rambo | – | Samma tjänst som Uddevalla, men 45 % av kärlen hade ett passerat datum (2026-11-04) | – | Inte med, fråga Rambo om schemat eller frekvensen |
| Tyresö | Kommunen (Verdis) | – | Bara app (Kretsloppsappen). Ingen publik webbsökning | – | Inte med |
| Järfälla | Kommunen | – | Nej, e-tjänsten kräver e-legitimation | – | Inte med |
| Sollentuna | SEOM | – | Nej, Mina sidor (`minasidor.seom.se`) kräver inloggning | – | Inte med |
| Sundbyberg | SAVAB | PDF för ReTuren, inget per adress | Nej, e-tjänsten kräver inloggning | – | Inte med |
| Solna | Staden (PreZero, Ragn-Sells) | – | Nej, hänvisar till entreprenörernas kundtjänst | – | Inte med |
| Trelleborg | – | – | EDP Future svarar men är tom (`futureweb.trelleborg.se/EDPFutureWeb`, 2026-11-03) | – | Inte med |
| Kävlinge | – | – | EDP Future svarar men är tom (`future.kavlinge.se/FutureWeb`, 2026-11-03) | – | Inte med |
| Mariestad | – | – | EDP Future svarar men är tom (`edp.mariestad.se/FutureWebMariestad`, 2026-11-03) | – | Inte med |
| Knivsta | – | – | EDP Future svarar men är tom (`futureweb.knivsta.se/FutureWeb`, 2026-11-03) | – | Inte med |
| Sjöbo | – | – | EDP Future svarar men är tom (`edp.sjobo.se/FutureWeb`, 2026-11-03) | – | Inte med |
| Håbo | – | – | EDP Future svarar men är tom (`edpmobile.habo.se/FutureWeb`, 2026-11-03) | – | Inte med |

Lärdomar så här långt:

- **Båda kommunerna landar i samma modell.** Schemat är publikt per område, och kommunen behöver lämna ut kopplingen från adress till område. Sopors statiska datafiler (`data/<kommun>/<år>/`) är byggda för just det.
- **En publik söktjänst är en bonus, inte regel.** Även när EDP:s modul finns kan den vara tom (Avesta och nio kommuner till vid svepet 2026-11-03). Det kan också finnas flera värdar: Stenungsund var tom hos Remondis men har data på kommunens egen värd.
- **Där EDP:s modul har data räcker en rad i registret** (och gatunamnen från OpenStreetMap). Ett 25-tal källor med ett 50-tal kommuner svarade med data vid kontrollen 2026-10-30. Modulen ger nästa tömning och en frekvens, så kommande datum räknas fram och märks *beräknat*.
- **En källas id behöver inte vara unikt.** NSR ger två olika adresser samma id, så adress-id:t där är gata, ort och id tillsammans. Kontrollera det innan en ny källtyp låser sitt adress-id.
- **En sökning med ett enda svar kan ha ett förslags-API bredvid sig.** SRV:s sökning ger bara den bästa träffen, men sidans förslag i sökrutan ger en lista med kundnummer. Läs sajtens JavaScript innan en källa avfärdas.
- **En områdeslista i ett schema ersätter inte kommunens tabell.** I Avesta står till exempel "Avesta tätort" och "Skogsbotätort" i olika trakter, samtidigt som en och samma gata kan gå genom båda, och enskilda gator i tätorten ligger i andra trakter. Listan är en ledtråd, men inget att bygga adressökning på.
- **Rendera PDF:er med kolumner innan du läser av dem.** I Avestas schema kom texten ut i fel ordning och två trakters listor flöt ihop när texten extraherades.
- **Avesta är live med områdesval.** Schemat kommer från [PDF:en](https://avestavatten.se/avfall/sortera-ratt-ar-latt/hamtningsschema/). EDP svarar men är tom (`minasidor.avestavatten.se/EDPFutureweb`, 2026-11-04), och begäran om tabellen har inte besvarats. Ett nytt verksamhetssystem för VA och avfall [annonserades ut 2026](https://ted.europa.eu/en/notice/298834-2026/html), så kontrollera söktjänsten igen om systemet byts.
- **Områdesval är ett alternativ när kopplingen saknas.** Är schemat publikt per område men kopplingen adress → område uteblir, kan besökaren välja område i stället (`selection: 'area'`, se [checklistan](lagga-till-kommun.md#områdesval-utan-adresser)). Det kräver att källan listar orter och gator per område.
- **Ett namn kan finnas i flera områden.** I Säter finns både "Forsbo" och "Forsbo – del av". Söks namnet utan förbehåll måste båda områdena visas, annars kan man få fel hämtdag. Undantag ("Åsen, förutom Falkgränd") får inte bli sökord till området de inte ingår i.
- **Lantmäteriets adressregister** säger vilka adresser som finns, men inte vilket område de tillhör. Licensen är dessutom oklar för återpublicering. Det ersätter alltså inte kommunens tabell.

En större genomgång av adresskällor och vilka kommuner som har publika källor för hämtschema finns i [undersökningen från oktober 2026](undersokning-2026-10-adresser-och-hamtschema.md).

*Uppdatera tabellen när du undersöker en ny kommun, och ta bort raden när kommunen blir live. Senast uppdaterad november 2026.*
