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

Kommunens "Mina sidor" ligger ofta på en adress som `minasidor.<bolag>.se`. Prova värden med skriptet `check:source` (kräver Node, se [CONTRIBUTING.md](../../CONTRIBUTING.md)). Det använder samma kod som sajten:

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

Det är det vanligaste fallet. Schemat kan läggas in som datafiler i Sopor (se [README](../../README.md#lägga-till-en-kommun)). Det som saknas är vilken adress som hör till vilket område.

Matcha inte adresser mot områden på egen hand utifrån ortnamn eller kartor. En gissning som blir fel får folk att missa sin tömning.

## Steg 4: Begär kopplingen från kommunen

Listan över vilka adresser som hör till vilket område är oftast en **allmän handling** som vem som helst kan begära ut (offentlighetsprincipen). Skicka en begäran till kommunens eller avfallsbolagets registrator, till exempel:

> Hej! Jag begär ut den förteckning som visar vilket hämtområde (trakt/tur) varje adress i kommunen tillhör för hushållsavfall, helst i ett maskinläsbart format som CSV eller Excel. Jag vill också fråga om ni har något emot att uppgifterna återpubliceras i den ideella tjänsten Sopor (sopor.hardyson.se), som visar hämtdagar per adress.
>
> Om ni har en publik söktjänst för hämtschema (till exempel EDP Futures modul SimpleWastePickup) vore det också bra att veta om den kan fyllas med data.

Berätta i ärendet att du har skickat en begäran, så att ingen annan gör samma sak. Myndigheter ska handlägga en begäran om allmän handling skyndsamt, men det kan ta några veckor.

## Steg 5: Berätta vad du hittat

Öppna ett [ärende om ny kommun](https://github.com/jesperhardyson/sopor/issues/new?template=ny-kommun.md) eller mejla support@hardyson.se med det du hittat. Kan du programmera får du gärna lägga in schemat själv enligt [CONTRIBUTING.md](../../CONTRIBUTING.md).

## Vad vi vet om kommunerna hittills

| Kommun | Sköts av | Schema publikt | Söktjänst per adress | Adress → område | Läge |
|---|---|---|---|---|---|
| Avesta | Avesta Vatten och Avfall AB | PDF per trakt (1–10), en per år | EDP Future SimpleWastePickup finns men är tom | Begärd som allmän handling | Dold på sajten (påhittad testdata), väntar på tabellen |
| Säter | Kommunen själv (inte Dala Vatten och Avfall) | Webbsida med områden per veckodag och jämn/udda vecka, plus veckoschema för fraktionerna | Nej. Mina sidor (`minasidorva.sater.se`) är en kundportal från CGI som kräver inloggning | Saknas, behöver begäras | Inte påbörjad |
| Uppsala | Uppsala Vatten | Via söktjänsten | EDP Future SimpleWastePickup med data (`futureweb.uppsalavatten.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Örebro | Örebro kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`futureweb.orebro.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Västerås, Enköping, Heby, Sala, Fagersta, Köping, Arboga, Kungsör, Hallstahammar, Norberg, Skinnskatteberg, Surahammar | Vafab Miljö | Via söktjänsten | EDP Future SimpleWastePickup med data (`services.vafabmiljo.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Jönköping, Habo, Mullsjö | June Avfall & Miljö | Via söktjänsten | EDP Future SimpleWastePickup med data (`minasidor.juneavfall.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Borås | Borås Energi och Miljö | Via söktjänsten | EDP Future SimpleWastePickup med data (`kundportal.borasem.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Lund | Lunds kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`eservice431601.lund.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Nacka | Nacka vatten och avfall | Via söktjänsten | EDP Future SimpleWastePickup med data (`futureweb.nvoa.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Gotland | Region Gotland | Via söktjänsten | EDP Future SimpleWastePickup med data (`edpfuture.gotland.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Skellefteå | Skellefteå kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`wwwtk2.skelleftea.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Växjö, Alvesta, Lessebo, Tingsryd, Uppvidinge | SSAM | Via söktjänsten | EDP Future SimpleWastePickup med data (`edpfuture.ssam.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Kalmar, Nybro, Emmaboda, Torsås, Mörbylånga, Borgholm | Kretslopp Sydost | Via söktjänsten | EDP Future SimpleWastePickup med data (`kundportal.kretsloppsydost.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Varberg | VIVAB Varberg | Via söktjänsten | EDP Future SimpleWastePickup med data (`minasidor.vivab.info`) | Behövs inte | Live på sajten (beräknade datum) |
| Falkenberg | VIVAB Falkenberg | Via söktjänsten | EDP Future SimpleWastePickup med data (`minasidor.vivab.info`) | Behövs inte | Live på sajten (beräknade datum) |
| Partille | Partille kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`vatjanst.partille.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Kungälv | Kungälvs kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`minasidor-va-avfall.kungalv.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Boden | Bodens kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`edpmobile.boden.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Danderyd | Danderyds kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`future.danderyd.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Lycksele | Lycksele kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`future.lycksele.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Kiruna | Tekniska Verken i Kiruna | Via söktjänsten | EDP Future SimpleWastePickup med data (`kund.tekniskaverkenikiruna.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Lidköping | Lidköpings kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`futureweb.lidkoping.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Orust | Orust kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`va-renhallning-minasidor.orust.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Ljungby | Ljungby kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`edpwebb.ljungby.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Mark | Marks kommun | Via söktjänsten | EDP Future SimpleWastePickup med data (`va-renhallning.mark.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Herrljunga, Vårgårda | Remondis (Herrljunga och Vårgårda) | Via söktjänsten | EDP Future SimpleWastePickup med data (`edpfuture.remondis.se`) | Behövs inte | Live på sajten (beräknade datum) |
| Stenungsund | – | – | EDP Future SimpleWastePickup svarar men är tom (2026-10-30) | – | Inte med |

Lärdomar så här långt:

- **Båda kommunerna landar i samma modell.** Schemat är publikt per område, och kommunen behöver lämna ut kopplingen från adress till område. Sopors statiska datafiler (`data/<kommun>/<år>/`) är byggda för just det.
- **En publik söktjänst är en bonus, inte regel.** Även när EDP:s modul finns kan den vara tom (Avesta, Stenungsund).
- **Där EDP:s modul har data räcker en rad i registret.** Ett 25-tal källor med ett 50-tal kommuner svarade med data vid kontrollen 2026-10-30. Modulen ger nästa tömning och en frekvens, så kommande datum räknas fram och märks *beräknat*.
- **Lantmäteriets adressregister** säger vilka adresser som finns, men inte vilket område de tillhör. Licensen är dessutom oklar för återpublicering. Det ersätter alltså inte kommunens tabell.

En större genomgång av adresskällor och vilka kommuner som har publika källor för hämtschema finns i [undersökningen från oktober 2026](undersokning-2026-10-adresser-och-hamtschema.md).

*Uppdatera tabellen när du undersöker en ny kommun. Senast uppdaterad oktober 2026.*
