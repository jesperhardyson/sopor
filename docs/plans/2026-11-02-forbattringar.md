# Förbättringar efter genomgången 2026-11-02

Genomgång av sajten, koden och Vercel (fel och besök, 20 okt–2 nov). Punkterna betas av en i taget, i ungefär den här ordningen. Bocka av och länka PR:en när en punkt är klar.

## Störst nytta för användarna

- [x] **1. Saknad kommun i sökningen.** (grenen `feature/saknad-kommun`) Söker man "Drottninggatan 50 Stockholm" får man "Vi hittade inte adressen. Kolla stavningen…". De flesta svenskar bor i kommuner som inte är med än, så det är vanligt. Visa designens läge "Kommunen stöds inte" (utan e-postformulär, se specen v1) när orten ligger i en kommun som Sopor inte har, med länk till `/bidra`. Orterna kommer från Wikidata (`data/sverige/`), eftersom Overpass inte orkade med hela landet. Sökningen hoppar också över live-källorna när orten ligger i en kommun som saknas (från cirka 8 s till 0,4 s).
- [ ] **2. Mät sökningar utan träff.** Vercel Analytics har inga egna händelser. En anonym händelse "ingen träff" med bara kommunnamnet (aldrig adressen) visar vilken kommun som efterfrågas mest. Bygger på punkt 1.
- [ ] **3. Senast hämtade schemat när källan ligger nere.** `/api/schema` svarar 502 vid timeout (Lidköping, 3 st den 2 nov), och sidan blir tom. Spara senast hämtade schemat för sparade adresser i localStorage och visa det med "Senast hämtat …, källan svarar inte just nu".

## Snabbfixar

- [ ] **4. Sidtitel per sida.** Titeln är alltid "Sopor – när töms dina kärl?". Adressidan bör heta t.ex. "Svartbäcksgatan 10, Uppsala – Sopor", så att flikar, bokmärken och historik går att skilja åt.
- [ ] **5. Webbappsmanifest.** `/manifest.webmanifest` saknas (ger startsidans HTML). Med manifest kan sajten läggas på hemskärmen som en app.
- [ ] **6. Delningsbild och OG-taggar.** En delad länk visar ingen förhandsbild i Messenger, sms eller Slack.
- [ ] **7. Typsnitten från egen server.** Fredoka och Nunito hämtas från Google Fonts, vilket skickar besökarnas IP-adresser till Google. Självhosta dem (snabbare också).
- [ ] **8. Se över testbanderollen.** "Testversion – Sopor är under utveckling" visas fortfarande, trots riktig data i 47 kommuner. Ta bort eller korta ner till att tjänsten är inofficiell.

## Funktioner

- [ ] **9. Förklara "beräknat".** Etiketten står på nästan varje tömning. En kort förklaring (räknat fram från källans intervall, kan flyttas vid helgdagar) bygger förtroende.
- [ ] **10. Dela-knapp på adressidan** (`navigator.share`, annars kopiera länk), för grannar och sambo.
- [ ] **11. Bevakning av källorna.** Specen för hela Sverige lovar ett veckojobb som anropar varje källa och öppnar ett ärende om formatet ändras. Det finns inte. `scripts/check-source.ts` kan vara en grund.
- [ ] **12. Fas 3: källor utanför EDP.** Alla synliga källor är EDP. Storstäderna (Stockholm, Göteborg, Malmö, Linköping …) kräver andra system, och där växer täckningen mest. En källa i taget, efter folkmängd.

## Redan klart eller pågår

- Påminnelse i kalendern: ICS-filerna har redan `VALARM` (6 timmar före).
- Påminnelser på webben: det finns en worktree `sopor-paminnelser`. Kolla läget där innan något byggs.
