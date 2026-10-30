# Undersökning: adresser och hämtschema i hela Sverige

Datum: 2026-10-30
Syfte: ta reda på hur Sopors sökning kan täcka hela landet med öppna data eller API:er, så att den är snabb och robust, och så att adresserna matchar kommunernas hämtschema.

Källhänvisningar finns i slutet. Det som inte kunde verifieras är markerat.

## Sammanfattning

1. **Det finns ingen nationell källa för hämtschema.** Varje kommun eller avfallsbolag har sin egen. Ungefär **120–140 av 290 kommuner** (40–48 %) har en publik källa utan inloggning som går att anropa programmatiskt. Det är en grov uppskattning.
2. **EDP Futures SimpleWastePickup svarar live hos cirka 25 värdar, som täcker 45–55 kommuner.** Bland dem finns Uppsala, Örebro, Vafab, June, Borås, Lund, Nacka, Gotland, Skellefteå, SSAM och Kretslopp Sydost. Alla har samma format, så **en generell EDP-provider med konfigurerbar värd** ger störst täckning per arbetsinsats.
3. **EDP ger ingen lista med datum.** Svaret innehåller nästa tömning (`NextWastePickup`), en frekvenstext som "Torsdag varje vecka" och antal tömningar per år. Kommande datum måste räknas ut, och helgdagsflyttar syns inte i förväg.
4. **Lantmäteriet är den enda kompletta adresskällan.** Den har cirka 3,7 miljoner adresser med kommun, ett stabilt UUID och strukturerade fält, och kostar 0 kr sedan februari 2025. Den kräver dock särskilda användarvillkor och en prövning enligt fastighetsregisterlagen och GDPR. Om adresserna får återpubliceras, till exempel i en sökning, är **inte verifierat**.
5. **Sökmotorer byggda på OpenStreetMap räcker inte.** OSM har cirka 830 000 av 3,7 miljoner svenska adresser, och landsbygden är glest täckt. Photon anger inte kommun, och Nominatim förbjuder autocomplete.
6. **Matchningen löser sig själv om sökningen går mot samma källa som schemat.** Söker vi i kommunens egen tjänst, till exempel EDP:s `SearchAdress`, är adresssträngen exakt den som schemat kräver. Problemet uppstår bara när en nationell adresslista ska kopplas mot kommunens data.

## Del 1: Adresser

| Källa | Täckning | Kommun i svaret | Stabilt id | Licens och villkor | Snabbhet och robusthet |
|---|---|---|---|---|---|
| **Lantmäteriet Belägenhetsadress Nedladdning** (GeoPackage per kommun via STAC) | Komplett, cirka 3,7 miljoner | Ja (kommunkod, kommundel) | **Ja, UUID som aldrig ändras** | 0 kr, men särskilda villkor, FRL/GDPR-prövning och personuppgiftsansvar. Återpublicering är inte verifierad | Om det är tillåtet: statiska delfiler på CDN:en, snabbast möjliga |
| **Lantmäteriet Belägenhetsadress Direkt** (API) | Komplett | Ja | Ja | Som ovan, plus nyckel (OAuth2) bakom en Vercel-funktion | Uppslag med filter, **ingen autocomplete**. Kvoter och SLA ej verifierade |
| Photon (komoot) | OSM, cirka 25 % | Nej (postort och län), kräver punkt-i-polygon | Nej | Fair use, kan strypas | CORS `*`, cirka 0,3–0,6 s, ingen SLA |
| Nominatim | OSM | Ja | Nej | **Förbjuder autocomplete**, 1 anrop/s | Bara reserv vid enstaka uppslag |
| Geoapify, LocationIQ, Stadia | OSM | Ej verifierat | Nej | Gratisnivåer (3 000–5 000/dygn, Stadia ej kommersiellt), nyckel krävs | Proxy krävs, OSM-luckorna kvarstår |
| Kommunala öppna data (Sandviken, Uppsala: CC0) | Enstaka kommuner | Ja | Varierar | CC0 | Statiska delfiler |
| SCB | Kommunlista och koder (290) | – | Kommunkod | Öppen | Statisk fil |
| Postnummer (PostNord) | – | Nej, ett postnummer kan spänna över flera kommuner | – | Oklar | Bara till för att skilja lika namn åt |
| Google Places | Bra | Ja | place_id | Förbjuder lagring och cache, kostar | Olämplig |

## Del 2: Hämtschema

**EDP Future SimpleWastePickup** (publik, ingen inloggning, JSON). Live 2026-10-30:

- Uppsala Vatten
- Örebro
- Vafab Miljö (Västmanland, Enköping, Heby med flera)
- June (Jönköping, Habo, Mullsjö)
- Borås Energi och Miljö
- Lund
- Nacka (NVOA)
- Region Gotland
- Skellefteå
- SSAM (Växjö med flera)
- Kretslopp Sydost (Kalmar län med flera)
- VIVAB (Varberg, Falkenberg)
- Partille
- Kungälv
- Boden
- Danderyd
- Lycksele
- Kiruna
- Lidköping
- Stenungsund
- Orust
- Ljungby
- Mark
- Herrljunga och Vårgårda (Remondis)

Oklara: Mölndal, Lerum, Roslagsvattens EDP-värd och Hudiksvall (EDP via en GIS-proxy). Avesta har modulen men den är tom.

**Andra publika källor** (utan inloggning, men **inte dokumenterade som öppna API:er**, utan webbplatsernas egna bakomliggande tjänster):

| Kommun eller bolag | Typ |
|---|---|
| VA Syd (Malmö, Lund, Lomma, Eslöv, Burlöv) | JSON |
| NSR (Helsingborg med fem till) | JSON och **ICS** |
| Sysav | JSON |
| SRV återvinning (Huddinge, Botkyrka, Haninge, Nynäshamn, Salem) | JSON |
| Stockholm Vatten och Avfall | JSON, bara dokumenterad av användare |
| Telge (Södertälje) | JSON |
| MSVA (Sundsvall) | JSON |
| Lumire (Luleå) | JSON |
| Affärsverken (Karlskrona) | JSON |
| Ökrab | JSON |
| LSR | JSON |
| Kristianstad, Hässleholm (Appbolaget) | JSON |
| Avfallsapp/Nova (Sigtuna, Upplands-Bro, Motala, Söderköping, Skaraborg) | JSON |
| Rambo, Uddevalla, Hedemora, Borlänge, Norrtälje, Kungsbacka, Roslagsvatten | JSON |
| Falun, Östersund, Värmdö, Älvsbyn, Västervik, Indecta-kommuner, VMAB | HTML, skrapning |

**Kräver inloggning, och kan därför inte användas:**

- Gästrike Återvinnare (Gävle med flera), som numera bara har Mina sidor
- Aneby
- Säter (CGI)
- Avfallsapp-kommuner som kräver en apptoken: Norrköping (Nodra, gråzon), Vänersborg och Teknik i Väst

**Ingen publik källa hittades för:** Göteborg, Linköping, Umeå, Karlstad, Halmstad och Eskilstuna.

**Nationella dataset för hämtschema:** inga (dataportal.se: 0 träffar). Inga kommunala iCal-flöden hittades, förutom NSR:s API.

Källa: den öppna Home Assistant-integrationen *Waste Collection Schedule*, där varje svensk källa granskades, plus egna anrop till EDP-värdarna.

## Del 3: Rekommendation

### Princip: sök där schemat finns

Det snabbaste och robustaste sättet att få adresser som matchar schemat är att söka i **samma källa som schemat kommer från**. Datakällorna ger då två typer av kommuner:

- **Kommuner med söktjänst (EDP med flera):** adressökningen går mot kommunens egen tjänst via en Vercel-funktion som cachar svaren. Adressen kommer därifrån, så den matchar per definition.
- **Kommuner med statiska datafiler (Avesta, Säter):** sökningen sker i den egna adresslistan, som i dag.

### Hur sökningen hittar rätt kommun

Att anropa 25+ kommunservrar för varje tangenttryckning är varken snabbt, robust eller hyggligt mot kommunerna. Det finns tre sätt att lösa det:

| | Hur | Fördel | Nackdel |
|---|---|---|---|
| **A. Nationellt adressindex från Lantmäteriet** | Statiska delfiler per början av gatunamnet, med kommunkod och UUID. Sökningen är lokal och omedelbar. När man väljer en adress frågas bara den kommunens källa | Snabbast, ett enda sökfält, täcker hela landet (även "stöds inte än") | Kräver Lantmäteriets godkännande, och att återpublicering är tillåten |
| **B. Välj kommun först, sedan sök** | Kommunlista från SCB som minns i webbläsaren. Sökningen går bara mot den kommunens källa | Kräver inga licenser, robust och tydligt | Ett extra steg, och strider mot "ingen separat kommunväljare" |
| **C. Ort i sökningen** | Man skriver "Storgatan 12 Uppsala". Orten, via en ort→kommun-tabell, avgör vilken källa som frågas | Ett fält, inga licenser | Kräver att användaren skriver orten, och orter kan finnas i flera kommuner |

**Förslag:**

- Ansök om Lantmäteriets villkor nu (A). Det är det enda sättet till ett komplett och snabbt sök över hela landet.
- Tills svaret kommer: bygg B kombinerat med C. Sökfältet känner igen kommun- och ortnamn, och om ingen kommun framgår visas en diskret kommunväljare som minns valet.
- Bygg om sökningen så att A kan kopplas in senare utan att UI:t ändras. Den tar hand om var adressen finns, och providern tar hand om schemat.

### Matchning (när index och schema kommer från olika källor)

- **Nyckel:** `kommunkod + normaliserat gatunamn + nummer + bokstav`. Kommundel eller postort används för att skilja lika gatunamn åt inom samma kommun.
- Vid matchning mot EDP: tolka `"Gata nummer bokstav, Ort"`. Saknas en exakt träff visas "hittades inte", och vi gissar aldrig.
- Lantmäteriets UUID sparas i en översättningstabell. **Befintliga adress-id i Sopor ändras inte** (stabila id, regel 3 i AGENTS.md).

### Snabbhet och robusthet

- **Vercel-funktion som proxy:**
  - normaliserar sökfrågan och cachar svaret på CDN:en (`s-maxage` på minst 1 dygn för sök, några timmar för schema)
  - har en timeout på cirka 3 s per kommunkälla
  - identifierar sig med en User-Agent som pekar på sopor.hardyson.se
- **I webbläsaren:** debounce på 200–300 ms och minst 3 tecken innan sökningen startar.
- **Vid fel:** visa "Kommunens tjänst svarar inte just nu" med en länk till kommunens egen sida, inte en tom lista.
- **Vercel Hobby:** 1 miljon funktionsanrop per månad. Det räcker gott med cache, men det är värt att övervaka.

## Öppna frågor (måste avgöras innan bygget)

1. **Lantmäteriet:** vill du ansöka om villkoren för Belägenhetsadress, med en uttrycklig fråga om publik visning i en sökning? Ansökan måste göras av dig som person eller organisation.
2. **Odokumenterade API:er:** uppdraget säger "publika, dokumenterade funktioner". EDP:s SimpleWastePickup är en publik modul avsedd för invånare. Övriga källor (VA Syd, NSR, SRV …) är webbplatsernas egna bakomliggande tjänster. Ska de få användas, och i så fall med vilka villkor (cache, låg volym, fråga bolaget)?
3. **Beräknade datum från EDP:** EDP ger nästa datum och en frekvens. Ska Sopor visa uträknade framtida datum, och lägga dem i kalenderfilerna, med märkningen "beräknat, helgdagar kan flytta tömningen"? Eller bara visa nästa tömning?
4. **Kommunväljare (B):** är ett extra steg acceptabelt tills ett nationellt index finns?

## Källor

- Lantmäteriet, avgifter och leveransinformation för geodata (v2.32, 2026-10-20): https://www.lantmateriet.se/globalassets/geodata/geodataprodukter/avgifter_och_leveransinformation_for_geodata.pdf
- Lantmäteriet, informationsspecifikation Belägenhetsadress: https://www.lantmateriet.se/globalassets/om-lantmateriet/var-samverkan-med-andra/byggnad-adress-lagenhet/informationsspecifikation-utbyte-belagenhetsadress.pdf
- Lantmäteriet, öppna data: https://www.lantmateriet.se/oppnadata
- Data från Lantmäteriet avgiftsfritt: https://bostadspolitik.se/data-fran-lantmateriet-blir-avgiftsfritt/
- OSM-forumet om Belägenhetsadress: https://community.openstreetmap.org/t/lantmateriet-belagenhetsadress/127427/45 och https://community.openstreetmap.org/t/oppna-data-fran-lantmateriet/72615/140
- OSM, svensk adressimport: https://wiki.openstreetmap.org/wiki/Import/Catalogue/Sweden_Address_Import
- Nominatims användarvillkor: https://operations.osmfoundation.org/policies/nominatim/
- Photon: https://photon.komoot.io/
- SCB, län och kommuner: https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/lan-och-kommuner-i-kodnummerordning/
- Sandvikens adresser (CC0): https://geodata.sandviken.se/he/dataset/adresser-i-sandvikens-kommun/resource/befb20e5-ac03-4758-968f-46b7e101f4f9
- Waste Collection Schedule (svenska källor): https://github.com/mampfes/hacs_waste_collection_schedule/blob/master/README.md
- EDP/VertiGIS: https://www.vertigis.com/news/edp-joins-vertigis-opens-nordic-market/
- Google Places villkor: https://developers.google.com/maps/documentation/places/web-service/policies
- Vercel Hobby: https://vercel.com/docs/plans/hobby
