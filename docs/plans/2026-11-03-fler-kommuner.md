# Fler kommuner – plan efter folkmängd

**Mål:** Täcka så många invånare som möjligt per arbetsinsats. I dag täcker Sopor 49 kommuner med 3,5 miljoner invånare, **33 % av Sveriges befolkning** (Avesta räknas inte, den är dold).

**Underlag:** Folkmängd 2024 från SCB (tabell `BefolkningNy`). Källorna kommer från [undersökningen i oktober](../kommuner/undersokning-2026-10-adresser-och-hamtschema.md) och från källkoden i Home Assistant-integrationen *Waste Collection Schedule*, som visar vilka anrop varje källa gör. Allt som inte har provats mot källan själv är markerat *overifierat*.

**Princip:** En källa (leverantör eller bolag) är enheten, inte en kommun. En ny källtyp kostar ungefär lika mycket som Stockholm eller VA Syd (spec, klient, bevakning), oavsett hur många kommuner den täcker. Därför rangordnas källorna efter **invånare per ny källtyp**, och EDP-källor (en rad i registret) går alltid först.

## Läget i dag

De största kommunerna som saknas, och varför:

| # | Kommun | Invånare | Källa | Läge |
|---|---|---|---|---|
| 1 | Göteborg | 609 000 | – | Ingen publik källa hittad |
| 2 | Linköping | 168 000 | – | Ingen publik källa hittad |
| 3 | Helsingborg | 152 000 | NSR | JSON och ICS, fas 2 |
| 4 | Norrköping | 145 000 | Nodra (Avfallsapp) | Kräver apptoken, utesluten (regel 4) |
| 5 | Umeå | 134 000 | – | Ingen publik källa hittad |
| 6 | Huddinge | 114 000 | SRV | JSON, fas 2 |
| 7 | Eskilstuna | 107 000 | – | Ingen publik källa hittad |
| 8 | Halmstad | 106 000 | – | Ingen publik källa hittad |
| 9 | Gävle | 104 000 | Gästrike Återvinnare | Kräver inloggning sedan 2025 |
| 10 | Södertälje | 103 000 | Telge | JSON, fas 3 |
| 11 | Haninge | 101 000 | SRV | JSON, fas 2 |
| 12 | Sundsvall | 99 000 | MSVA (`api.sundsvall.se`) | JSON, fas 3 |
| 13 | Karlstad | 98 000 | – | Ingen publik källa hittad |
| 14 | Botkyrka | 96 000 | SRV | JSON, fas 2 |
| 15 | Järfälla | 89 000 | ? | Inte undersökt, fas 1 |
| 16 | Kristianstad | 86 000 | Appbolaget | JSON, fas 2 |
| 17 | Kungsbacka | 86 000 | Självservice (HTML) | Skrapas inte, fas 5 |
| 18 | Solna | 86 000 | ? | Inte undersökt, fas 1 |
| 19 | Luleå | 80 000 | Lumire | JSON, fas 3 |
| 20 | Täby | 78 000 | ? | Inte undersökt, fas 1 |

Två saker sticker ut:

- **Åtta av de största saknar en publik källa** (Göteborg, Linköping, Umeå, Karlstad, Halmstad, Eskilstuna, Gävle, Norrköping). Tillsammans är de 1,5 miljoner invånare, 14 % av landet. De går inte att lösa med kod, se fas 5.
- **Stockholms förorter är inte undersökta alls** (Järfälla, Solna, Täby, Sollentuna, Sundbyberg, Upplands Väsby, Tyresö, Lidingö, Värmdö, Vallentuna): 616 000 invånare, 5,8 %. Flera kan ha EDP. Det är den billigaste möjliga vinsten.

## Fas 0: Prioriteringslistan

- [ ] Lägg folkmängden per kommun i `data/sverige/` (SCB, uppdateras en gång per år) och låt `npm run check:source` eller ett eget skript skriva ut **saknade kommuner sorterade efter invånare** med kumulativ täckning. Då blir listan ovan reproducerbar och kan visa täckningen på Om-sidan senare.
- [ ] Lägg till kolumnen *Invånare* i tabellen i `docs/kommuner/hitta-kommunens-data.md`.

## Fas 1: EDP-svep (en rad i registret per träff)

Provas med `npm run check:source` för de **100 största saknade kommunerna**: kommunens och VA-bolagets "Mina sidor" i webbläsaren, sedan värden i skriptet. Kända spår:

| Kommun | Värd | Läge 2026-11-03 |
|---|---|---|
| Mölndal (71 000) | `future.molndal.se/FutureWeb` | Svarar men tom |
| Lerum (44 000) | `vatjanst.lerum.se/FutureWeb` | Ingen kontakt (kan blockera utlandet eller kräva annan sökväg) |
| Österåker, Vaxholm, Ekerö (91 000) | `edpmypage.roslagsvatten.se/FutureWebOS` | 404, men Roslagsvatten har en egen JSON-tjänst (fas 2, klar) |
| Hudiksvall (38 000) | `gis.hudiksvall.se/origoserver/EDPFuture` | 404, behöver rätt sökväg |
| Stenungsund (28 000) | via Remondis | Svarar men tom |

- [ ] Gå igenom Stockholms förorter först (616 000 invånare), sedan resten av topp 100.
- [ ] Varje träff blir en rad i `src/sources/index.ts` enligt [checklistan](../kommuner/lagga-till-kommun.md). Flera träffar kan samlas i en PR.
- [ ] Varje tom tjänst noteras i tabellen i `hitta-kommunens-data.md` (och blir en kandidat för fas 5).

**Insats:** liten. **Vinst:** okänd, troligen 0–5 %.

## Fas 2: Egna källtyper som täcker flera kommuner

Ordnade efter invånare. Varje rad är en egen spec och plan som `stockholm` och `vasyd`, med klient i `src/server/`, kontroll i bevakningen och ett låst adress-id-format.

| Ordning | Källa | Kommuner | Invånare | Andel | Format (*overifierat*) |
|---|---|---|---|---|---|
| 1 | **NSR** (klar, `docs/specs/2026-11-03-nsr.md`) | Helsingborg, Ängelholm, Höganäs, Båstad, Bjuv, Åstorp | 274 000 | 2,6 % | JSON för sökningen, ICS för schemat |
| 2 | **SRV återvinning** (klar, `docs/specs/2026-11-03-srv.md`) | Huddinge, Haninge, Botkyrka, Nynäshamn, Salem | 359 000 | 3,4 % | JSON, `srvatervinning.se/rest-api/core/sewagePickup/search` |
| 3 | ~~**Avfallsapp/Nova**~~ (hoppas över, beslut 5) | Sigtuna, Motala, Upplands-Bro, Söderköping (+ Skaraborg?) | 144 000 | 1,4 % | JSON, `<kund>.avfallsapp.se/wp-json/nova/v1/`. Kunder som kräver token (Nodra, Vänersborg, Teknik i Väst) tas inte med |
| 4 | **Appbolaget** (klar, `docs/specs/2026-11-03-appbolaget.md`) | Kristianstad, Hässleholm | 138 000 | 1,3 % | JSON, `api-universal.appbolaget.se/waste/…` |
| 5 | **Uddevalla Energi** (klar, `docs/specs/2026-11-04-uddevalla.md`). ~~Rambo~~ hoppas över, beslut 6 | Uddevalla (Lysekil, Sotenäs, Munkedal och Tanum går till fas 5) | 56 000 | 0,5 % | JSON, `app.uddevallaenergi.se/wp-json/app/`. Bara nästa tömning per kärl |
| 6 | **Roslagsvatten** (klar, `docs/specs/2026-11-04-roslagsvatten.md`) | Österåker, Ekerö, Vaxholm | 91 000 | 0,9 % | HTML i JSON, `POST roslagsvatten.se/schedule/search` och `/schedule/fetch` |
| 7 | **Borlänge Energi** (klar, `docs/specs/2026-11-04-borlange.md`). Hittades när Säter undersöktes, och stod tidigare felaktigt under skrapning i fas 4 | Borlänge | 51 000 | 0,5 % | JSON, `borlange-energi.se/appresource/…/getAdresses` och `/getcontainerdata`. Bara nästa tömning per kärl, utan årtal |

**Insats:** en källtyp i taget, som VA Syd. **Vinst:** cirka 1,1 miljoner invånare, **täckningen går från 33 % till cirka 44 %.** Utan Avfallsapp/Nova blir det cirka 950 000 och 42 %.

Appbolaget är en plattform med flera kunder. Den byggs med kunden som inställning (som `baseUrl` för EDP), så nästa kund på plattformen blir en rad i registret.

## Fas 3: Egna källtyper för en kommun

| Ordning | Källa | Kommuner | Invånare | Format (*overifierat*) |
|---|---|---|---|---|
| 1 | **Telge** (klar, `docs/specs/2026-11-06-sundsvall-sodertalje.md`). Täcker inte Nykvarn, som går till fas 5 | Södertälje | 103 000 | JSON, `telge.se/api/thorweb/garbagecollection`. Riktiga datum ett år framåt |
| 2 | **MSVA** (klar, samma spec) | Sundsvall | 99 000 | JSON, `api.sundsvall.se/Garbage/2281/schedules`. Bara småhus och nästa tömning per kärl |
| 3 | **Lumire** | Luleå | 80 000 | JSON, `lumire.se/api/waste-pickup` |
| 4 | **Affärsverken** | Karlskrona | 66 000 | JSON, `kundapi.affarsverken.se/api/v1/open-api/`. Hämtar en anonym token först, utan inloggning. Räknas som publik källa (beslut 2026-11-03) |
| 5 | **LSR** | Landskrona, Svalöv | 62 000 | JSON, `minasidor.lsr.nu/api/api/external/schedule/` |
| 6 | **Pireva** | Piteå | 42 000 | Sökning i JSON, schemat i HTML |

**Paus efter Telge och MSVA (beslut 7).** **Vinst om allt byggs:** cirka 450 000 invånare, **till cirka 48 %**. Sysav och Ökrab har också JSON men oklart vilka kommuner de hämtar i. Kartlägg dem innan de rangordnas.

## Fas 4: Skrapning av HTML (görs inte)

Beslut 2026-11-03: Sopor skrapar inte webbsidor. Sidorna ändras utan förvarning, och varje ändring blir en lagning, vilket går emot målet om minimalt underhåll. Kommunerna nedan behandlas som de i fas 5: fråga efter en söktjänst eller statisk data.

| Källa | Kommuner | Invånare |
|---|---|---|
| Självservice (`sjalvservice.kungsbacka.se`, `sjalvservice.nvaa.se`) | Kungsbacka, Norrtälje | 152 000 |
| Falu Energi & Vatten | Falun | 60 000 |
| Hudiksvall, Västervik (VMEAB), Ronneby, Hedemora, Älvsbyn | | cirka 130 000 |
| Indecta- och "kalender"-PHP (Nårab, SÅM, VMAB) | flera små | – |

## Fas 5: Stora kommuner utan publik källa

Göteborg, Linköping, Karlstad, Halmstad, Eskilstuna, Gävle och Norrköping: cirka 1,3 miljoner invånare. Göteborg ensam är 5,8 %. Umeå stod också här, men visade sig ha en publik källa.

- [x] **Djupkoll** av varje kommuns webbplats (2026-11-06). **Umeå har en publik källa,** Vakins "När kommer sopbilen?", som också täcker Vindeln och Nordmaling (klar, `docs/specs/2026-11-06-umea-vakin.md`). Göteborg, Linköping, Karlstad, Halmstad, Eskilstuna, Gävle och Norrköping visar hämtdagarna bara efter inloggning, i en app eller via kundtjänst. Resultatet per kommun står i [tabellen](../kommuner/hitta-kommunens-data.md#vad-vi-vet-om-kommunerna-hittills).
- [ ] **Ett GitHub-ärende per kommun** ([mallen för ny kommun](https://github.com/jesperhardyson/sopor/issues/new?template=ny-kommun.md)) med ett färdigt utkast till förfrågan, så att den som bor där kan skicka den eller hjälpa till. Gäller även kommunerna i fas 4.
- [ ] **Fråga kommunen**, med mallen i [steg 4](../kommuner/hitta-kommunens-data.md#steg-4-begär-kopplingen-från-kommunen): om de har EDP, be dem fylla SimpleWastePickup; annars begär ut kopplingen adress → område som allmän handling och lägg den som statisk data (som Avesta).
- [ ] Gävle och Norrköping hade publika källor förut. Fråga om de kan öppnas igen. Använd inte apptoken eller inloggning.

**Insats:** mest väntan på svar. Börja i fas 0 så att svaren hinner komma.

## Sammanfattning

| Efter | Täckning (invånare) |
|---|---|
| I dag | 33 % |
| Fas 1 | 33–38 % |
| Fas 2 | cirka 44 % |
| Fas 3 | cirka 48 % |
| Fas 5 (om Göteborg svarar ja) | upp mot 54 % |

## Beslut (2026-11-03)

1. **Fas 2 börjar med NSR**, inte SRV. NSR har ICS med riktiga datum och helgdagsflyttar, så risken är mindre.
2. **Ingen skrapning av HTML.** Fas 4 utgår, och de kommunerna går till fas 5.
3. **Affärsverken räknas som publik källa.** Token hämtas anonymt från deras open-api, utan inloggning.
4. **Förfrågningarna i fas 5 blir GitHub-ärenden**, ett per kommun, med ett utkast.
5. **Avfallsapp/Nova hoppas över** (Sigtuna, Motala, Upplands-Bro, Söderköping och Vallentuna). Sökningen svarar utan token men alltid tomt. Den kräver att en låtsad mobil enhet registreras (`POST /register`) och att adressen kopplas till enheten på leverantörens server (`next-pickup/set-status`), och schemat är bara nästa tömning per kärl. Kommunerna går till fas 5.
6. **Rambo hoppas över, bara Uddevalla byggs av WordPress-appen** (2026-11-04). Tjänsten ger nästa tömning per kärl utan frekvens. Hos Rambo hade 51 av 114 kärl (45 %) ett datum som redan passerat, som äldst en vecka, och utan frekvens går rätt datum inte att räkna fram. Lysekil, Sotenäs, Munkedal och Tanum går till fas 5, med en fråga om schemat eller frekvensen. Hos Uddevalla Energi hade inget av 94 kärl ett passerat datum, så där byggs källan trots att kalendern bara visar nästa tömning.
7. **Fas 3 pausas efter Telge och MSVA** (2026-11-06). De återstående källorna täcker mindre kommuner och var och en ger mer underhåll. Sajten hade 55 besökare den första veckan och två sökningar på saknade kommuner, så efterfrågan säger inget än. Fortsätt när `/saknas/<kommun>` i statistiken visar vilka kommuner som efterfrågas. Fas 5 kan gå parallellt, eftersom den mest är väntan på svar.
