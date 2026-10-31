# Sopor – hela Sverige (v2)

Datum: 2026-10-30
Status: godkänd 2026-10-30 (med NVDB/OSM i stället för Lantmäteriet)
Bygger på: `docs/specs/2026-10-30-sopor-design.md` (v1) och `docs/kommuner/undersokning-2026-10-adresser-och-hamtschema.md`

## Syfte

Sopor ska fungera för så många svenskar som möjligt. Målet är de cirka 120–140 kommuner som har en publik källa för hämtschema utan inloggning. Sökningen ska vara snabb och robust, och adressen man väljer ska alltid matcha kommunens schema.

## Beslut (från användaren)

- **Ingen kommunväljare.** Ett enda sökfält, som i dag.
- **Alla publika källor utan inloggning får användas**, även webbplatsernas odokumenterade bakomliggande tjänster, med cache och låg volym. Källor bakom inloggning eller apptoken används aldrig.
- **Kommande datum räknas fram** när källan bara ger nästa tömning och en frekvens (EDP), och märks **"beräknat"**.
- **Röda dagar och helgdagsaftnar visas i månadskalendern.**
- **Inget beroende till Lantmäteriet.** Adresser med husnummer kommer från källorna själva. Det nationella indexet behöver bara gatunamn.

## Mål

- Sök över alla kommuner med en källa, i ett fält, med träffar inom cirka 300 ms (med varm cache).
- Kommuner läggs till med konfiguration. En ny kommun på ett känt system (EDP med flera) är en rad i registret.
- Adressen som visas och schemat kommer alltid från samma källa, eller matchas med en exakt nyckel. Sopor gissar aldrig.
- Fortfarande gratis att drifta (Vercel Hobby), utan databas.

## Icke-mål

- En komplett nationell adresslista i v2. Den kommer om Lantmäteriets svar tillåter det.
- Källor som kräver inloggning, BankID eller apptoken.
- Påminnelser (oförändrat).

## Anti-mål

- Att anropa alla kommunservrar för varje tangenttryckning.
- Att visa ett framräknat datum utan att det syns att det är beräknat.
- Att matcha en adress mot fel kommuns schema.
- Att ändra eller återanvända befintliga adress-id eller ICS-UID.

## Arkitektur

### 1. Gatuindex för att hitta rätt kommun

Utan kommunväljare måste sökningen veta vilka kommuner som kan ha adressen. Det löses med ett **statiskt index över gatunamn per kommun**:

- **Källa:** OpenStreetMap via Overpass (gatunamn och ortnamn per kommun, `admin_level=7` och `ref:se:kommun:kod`). Vägnätet i OSM bygger till stor del på Trafikverkets NVDB (CC0) och kan hämtas utan konto. NVDB från Lastkajen kräver konto och manuell nedladdning, så den är bara reserv.
- **Ortnamn → kommun:** samma hämtning ger orter (`place=*`) per kommun. Den används för att ange kommun när en källa bara returnerar ort.
- **Innehåll:** normaliserat gatunamn → lista av kommunkoder. Bara kommuner som Sopor har en källa för tas med. Ortnamn tas också med, så att "Storgatan Krylbo" kan avgränsa.
- **Format:** delfiler per de två första bokstäverna (`/data/gator/st.json` med flera), några kB var, med lång cache på CDN:en.
- **Licens:** ODbL. Källan anges på Om-sidan och i README, och indexet ligger i repot och delas under samma licens.
- **Bygge:** ett skript (`scripts/build-street-index.ts`) som körs manuellt eller i en schemalagd GitHub Action en gång per kvartal, inte vid varje deploy. Resultatet checkas in.
- **Byte senare:** om Lantmäteriet godkänner publik visning byts källan till Belägenhetsadress. Indexets format är detsamma, men det kan då innehålla hela adresser med UUID.

### 2. Sökflödet

1. Användaren skriver minst 3 tecken. Webbläsaren laddar gatuindexets delfil och tar fram vilka kommuner gatan finns i, oftast 1–5.
2. Webbläsaren anropar **`/api/sok?q=…&kommuner=…`**. Funktionen frågar bara de kommunernas providers parallellt, med en timeout på 3 s per källa, och slår ihop svaren.
3. Svaren cachas på CDN:en per normaliserad fråga (`s-maxage=86400, stale-while-revalidate`).
4. Kommuner med statiska datafiler (Avesta, Säter) söks lokalt, som i dag. De är ändå med i gatuindexet.
5. Svarar en kommunkälla inte visas övriga träffar, plus en rad om att "Uppsala svarar inte just nu" med länk till kommunens egen sida.
6. Saknas namnet i indexet frågas alla källor, men först när frågan har ett husnummer eller användaren trycker Enter. Det är den dyraste sökningen.
7. Webbläsaren sparar svaren per källa och fråga. Gav en källa färre än 10 träffar (EDP:s gräns) filtreras längre frågor ur det svaret i stället för att fråga igen, eftersom EDP matchar början av adressen. Servern frågas först efter 300 ms utan nya tangenttryck.

### 3. Providers

`WasteProvider` (v1) blir kvar. Nya implementationer bor i **`/api`** (Vercel Functions), eftersom de flesta källor saknar CORS och en del kräver att anropen formas på serversidan:

| Typ | Kommuner (exempel) | Ger |
|---|---|---|
| `static` (v1) | Avesta, Säter | Datumlista från datafiler |
| `edp` | Cirka 25 värdar, 45–55 kommuner | Nästa datum + frekvens, så **beräkning** krävs |
| `vasyd`, `nsr`, `srv`, `sysav`, `svoa`, `telge`, `msva`, … | Cirka 70–85 kommuner | Varierar: datumlistor, ICS eller frekvens |

- **Källregistret** (nytt) beskriver varje datakälla: id (används i URL:en, till exempel `vafab`), namn (till exempel "Vafab Miljö"), system (`static`, `edp` med flera), konfiguration (värd med mera) och vilka kommuner (SCB-koder) källan täcker. En källa kan täcka flera kommuner. En ny EDP-källa blir då bara en rad i registret.
- **Kommun i svaret:** EDP svarar med ort ("Storgatan 1, Grillby"). Kommunen slås upp från ortnamnet med indexets ort→kommun-tabell, avgränsat till källans kommuner. Går det inte att avgöra visas källans namn i stället.
- **Webbläsaren** pratar med en enda generisk provider, `api`, som anropar `/api/sok` och `/api/schema`. Gränssnittet mot UI:t är oförändrat.
- **Kalenderfiler** för kommuner med en live-källa genereras av `/api/ics/<kommun>/<id>.ics` och cachas i 12 timmar. Statiska kommuner behåller sina förgenererade filer.
- **Ordning:** först en generisk `edp`, därefter de största övriga i den prioritetsordning undersökningen gav (VA Syd, Stockholm, NSR, SRV …). Varje ny källtyp är en egen uppgift med tester mot sparade svar.

### 4. Adress-id och matchning

- **Id för en EDP-adress:** EDP:s svar innehåller ett byggnads-id i parentes, till exempel `"Storgatan 1, Grillby (909273)"`. Id:t blir till exempel `storgatan-1_grillby-909273`, och URL:en `/vafab/storgatan-1_grillby-909273`. Id:t går att översätta tillbaka till en sökning (mellanslag → `-`, `, ` → `_`, bindestreck → `~`, å/ä/ö behålls), och träffen med rätt byggnads-id väljs. Byggnads-id:t går inte att söka på direkt hos EDP. Om källan stavat om adressen prövas därför bredare sökningar i tur och ordning: gata med nummer, sedan bara gatunamnet. Hittas adressen ändå inte, till exempel för att gatan bytt namn, får kalenderfilen en händelse om att söka upp adressen igen, så att prenumerationen inte tyst slutar uppdateras. Samma gatuadress kan ha flera byggnads-id (flerbostadshus), och då visas de som separata träffar med byggnads-id:t som särskiljare.
- **Matchning** behövs bara när index och schema kommer från olika källor, alltså när Lantmäteriet kopplas in. Nyckeln är då kommunkod, normaliserat gatunamn, nummer och bokstav. Lantmäteriets UUID sparas i en översättningstabell.

### 5. Beräknade datum

- Frekvenstexten är fritext som skiljer sig mellan bolagen ("Torsdag varje vecka", "14-dag onsdag jämn vecka", "enligt körlista" …). Beräkningen bygger därför på `WastePickupsPerYear`: 52 ger varje vecka, 26 varannan, 13 var 4:e och 104 två gånger i veckan. Vid 104 tas veckodagarna ur texten ("Måndag, Torsdag"). Står det 0, ett okänt antal eller "körlista" visas bara nästa datum, utan beräkning.
- Datum räknas framåt i 12 månader från `NextWastePickup`. Tjänster med ogiltigt datum (`0001-01-01`, till exempel slam) hoppas över.
- **Avfallstyper** mappas till fraktionsregistret med en tabell över källornas texter: "Restavfall"/"RESTAVFALL" blir rest, "Pappersförp." blir papper, "Glasförp.färg"/"Glasförp.ofärg" blir glas, "Tidningar" blir den nya fraktionen tidningar, och så vidare. Kärl med flera fraktioner ("Fyrfack 1", "Kärl 2", "FNI Kärl 1") får fraktionen `kärl` och visar källans egen text.
- Varje händelse får `estimated: true`.
  - **I UI:t** står det "beräknat" vid datumet, och kortet för nästa tömning visar "Nästa tömning (bekräftad)" när datumet kommer direkt från källan.
  - **I ICS-filen** står "(beräknat)" i titeln, och beskrivningen säger "Beräknat datum – helgdagar kan flytta tömningen. Kolla kommunens besked."
- Ett beräknat datum som hamnar på en röd dag eller en helgdagsafton får en varning: **"Infaller på juldagen – kan flyttas."** Datumet flyttas inte på egen hand.

### 6. Röda dagar och helgdagsaftnar

- Domänfunktionen `swedishHolidays(year)` returnerar alla svenska allmänna helgdagar enligt lag (1989:253), med påsk och rörliga helger uträknade, och helgdagsaftnar som är de facto lediga: julafton, nyårsafton och midsommarafton, samt påskafton.
- **Månadskalendern** markerar röda dagar med röd siffra och visar namnet vid hovring eller tryck. Aftnar markeras svagare.
- Ett test kontrollerar alla helgdagar för 2026 och 2027 mot en fast lista.

## Snabbhet och robusthet

- Gatuindexet är statiskt, så kommun-uppslaget är omedelbart och har ingen extern beroendekedja.
- Funktionerna har en timeout per källa, kör parallellt, cachar på CDN:en och använder `stale-while-revalidate`, så ett tidigare svar visas om källan ligger nere.
- User-Agent: `Sopor/1.0 (+https://sopor.hardyson.se)`. Inga upprepade försök i loop.
- Debounce på 250 ms och minst 3 tecken innan sökningen startar.
- Vercel Hobby tillåter 1 miljon funktionsanrop per månad. Det räcker gott med cache, och användningen övervakas i Vercel.
- Varje provider testas mot **sparade svar** (fixtures), inte mot live-servrar. Ett schemalagt GitHub Action-jobb anropar varje källa en gång per vecka och öppnar ett ärende om formatet har ändrats.

## Spec v1 som ändras

- "Ingen backend" blir "ingen databas, och Vercel Functions bara som proxy och cache mot publika källor".
- "Vi räknar inte ut helgdagar" gäller fortfarande för datafiler. Helgdagar visas dock i kalendern och används för varningar.
- AGENTS.md regel 2 och 4 uppdateras därefter.

## Faser

1. **Grund:** systemfält i kommunregistret, helgdagar i kalendern, `/api/sok` och `/api/schema` med den statiska providern bakom, och gatuindexet för de kommuner som finns.
2. **EDP:** en generisk provider, beräknade datum, ICS från funktionen och de cirka 25 EDP-värdarna i registret.
3. **Övriga källor**, en i taget efter folkmängd.
4. **Lantmäteriet** (om villkoren tillåter): fullständigt adressindex.

## Kvar åt den som bygger

- Exakt hur gatuindexet packas, och hur gatunamn normaliseras (till exempel "St Göransgatan" och "S:t Göransgatan").
- Hur många månader framåt beräkningen ska gå (förslag: 12).
- Hur övervakningen av källor ska se ut i detalj.
