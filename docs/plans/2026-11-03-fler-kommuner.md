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
| 17 | Kungsbacka | 86 000 | Självservice (HTML) | Skrapning, fas 4 |
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
| Österåker, Vaxholm, Ekerö (91 000) | `edpmypage.roslagsvatten.se/FutureWebOS` | 404, men Roslagsvatten har en egen JSON-tjänst (fas 2) |
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
| 1 | **SRV återvinning** | Huddinge, Haninge, Botkyrka, Nynäshamn, Salem | 359 000 | 3,4 % | JSON, `srvatervinning.se/rest-api/core/sewagePickup/search` |
| 2 | **NSR** | Helsingborg, Ängelholm, Höganäs, Båstad, Bjuv, Åstorp | 274 000 | 2,6 % | JSON, `nsr.se/api/wastecalendar`, även ICS |
| 3 | **Avfallsapp/Nova** (utan token) | Sigtuna, Motala, Upplands-Bro, Söderköping (+ Skaraborg?) | 144 000 | 1,4 % | JSON, `<kund>.avfallsapp.se/wp-json/nova/v1/`. Kunder som kräver token (Nodra, Vänersborg, Teknik i Väst) tas inte med |
| 4 | **Appbolaget** | Kristianstad, Hässleholm | 138 000 | 1,3 % | JSON, `api-universal.appbolaget.se/waste/…` |
| 5 | **WordPress-appen** (Rambo, Uddevalla Energi) | Uddevalla, Lysekil, Sotenäs, Munkedal, Tanum | 103 000 | 1,0 % | JSON, `…/wp-json/app/v1/address-flat` och `next-pickup`. Samma form hos båda, *kontrollera* |
| 6 | **Roslagsvatten** | Österåker, Ekerö, Vaxholm | 91 000 | 0,9 % | JSON, `POST roslagsvatten.se/schedule` |

**Insats:** en källtyp i taget, som VA Syd. **Vinst:** cirka 1,1 miljoner invånare, **täckningen går från 33 % till cirka 44 %.**

Avfallsapp/Nova och WordPress-appen är plattformar med flera kunder. Byggs de med kunden som inställning (som `baseUrl` för EDP) blir nästa kund på samma plattform en rad i registret.

## Fas 3: Egna källtyper för en kommun

| Ordning | Källa | Kommuner | Invånare | Format (*overifierat*) |
|---|---|---|---|---|
| 1 | **Telge** | Södertälje, Nykvarn | 115 000 | JSON, `telge.se/api/thorweb/garbagecollection` |
| 2 | **MSVA** | Sundsvall | 99 000 | JSON, `api.sundsvall.se/Garbage/2281/schedules` (kommunens öppna API, bäst dokumenterat av alla) |
| 3 | **Lumire** | Luleå | 80 000 | JSON, `lumire.se/api/waste-pickup` |
| 4 | **Affärsverken** | Karlskrona | 66 000 | JSON, `kundapi.affarsverken.se/api/v1/open-api/`. Hämtar en anonym token först: *kontrollera mot regel 4* innan något byggs |
| 5 | **LSR** | Landskrona, Svalöv | 62 000 | JSON, `minasidor.lsr.nu/api/api/external/schedule/` |
| 6 | **Pireva** | Piteå | 42 000 | Sökning i JSON, schemat i HTML |

**Vinst:** cirka 460 000 invånare, **till cirka 48 %**. Sysav och Ökrab har också JSON men oklart vilka kommuner de hämtar i. Kartlägg dem innan de rangordnas.

## Fas 4: Skrapning av HTML (beslut krävs)

| Källa | Kommuner | Invånare |
|---|---|---|
| Självservice (`sjalvservice.kungsbacka.se`, `sjalvservice.nvaa.se`) | Kungsbacka, Norrtälje | 152 000 |
| Falu Energi & Vatten | Falun | 60 000 |
| Borlänge Energi (Sitevision) | Borlänge | 51 000 |
| Hudiksvall, Västervik (VMEAB), Ronneby, Hedemora, Älvsbyn | | cirka 130 000 |
| Indecta- och "kalender"-PHP (Nårab, SÅM, VMAB) | flera små | – |

Skrapning går emot målet om minimalt underhåll: sidorna ändras utan förvarning. Bevakningen fångar det, men varje ändring blir en lagning. **Förslag:** bara Kungsbacka och Norrtälje (största vinsten och troligen samma plattform), och bara efter fas 2 och 3.

## Fas 5: Stora kommuner utan publik källa

Göteborg, Linköping, Umeå, Karlstad, Halmstad, Eskilstuna, Gävle och Norrköping: 1,5 miljoner invånare. Göteborg ensam är 5,8 %.

- [ ] **Djupkoll** av varje kommuns webbplats i webbläsaren (nätverksfliken vid "sök tömningsdag"). Undersökningen byggde på Waste Collection Schedule, som bara har det någon har bidragit med. Något kan ha missats.
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
| Fas 4 (Kungsbacka, Norrtälje) | cirka 50 % |
| Fas 5 (om Göteborg svarar ja) | upp mot 56 % |

## Öppna frågor

1. **Ordningen i fas 2:** SRV först (störst), eller NSR (har ICS, alltså riktiga datum och helgdagsflyttar, mindre risk)?
2. **Skrapning (fas 4):** ja, nej eller bara Kungsbacka och Norrtälje?
3. **Affärsverken:** räknas en anonym token från ett öppet "open-api" som publik källa enligt regel 4?
4. **Fas 5:** vill du skicka förfrågningarna själv, eller ska utkasten ligga i ärenden på GitHub?
