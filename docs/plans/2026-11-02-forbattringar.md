# Förbättringar efter genomgången 2026-11-02

Genomgång av sajten, koden och Vercel (fel och besök, 20 okt–2 nov). Punkterna betas av en i taget, i ungefär den här ordningen. Bocka av och länka PR:en när en punkt är klar.

## Störst nytta för användarna

- [x] **1. Saknad kommun i sökningen.** ([#45](https://github.com/jesperhardyson/sopor/pull/45)) Söker man "Drottninggatan 50 Stockholm" får man "Vi hittade inte adressen. Kolla stavningen…". De flesta svenskar bor i kommuner som inte är med än, så det är vanligt. Visa designens läge "Kommunen stöds inte" (utan e-postformulär, se specen v1) när orten ligger i en kommun som Sopor inte har, med länk till `/bidra`. Orterna kommer från Wikidata (`data/sverige/`), eftersom Overpass inte orkade med hela landet. Sökningen hoppar också över live-källorna när orten ligger i en kommun som saknas (från cirka 8 s till 0,4 s).
- [x] **2. Mät sökningar på saknade kommuner.** ([#46](https://github.com/jesperhardyson/sopor/pull/46)) Egna händelser (`track`) kräver Vercels Pro-plan, så sökningen skickar i stället en sidvisning av `/saknas/<kommun>` när läget för saknad kommun visas. Bara kommunnamnet skickas, en gång per kommun och sidbesök. Se vilka kommuner som efterfrågas under Pages i Vercel Analytics (filtrera på `/saknas/`). Sökningar utan ort räknas inte.
- [x] **3. Senast hämtade schemat när källan ligger nere.** ([#47](https://github.com/jesperhardyson/sopor/pull/47)) `/api/schema` svarade 502 vid timeout (Lidköping, 3 st den 2 nov), och sidan blev tom. Nu sparas senast hämtade schemat för sparade adresser (`sopor.schedules.v1`), och adressidan visar det med "… svarar inte just nu. Du ser schemat som hämtades …" och "Försök igen". Bara sparade adresser, så lagringen inte växer med allt man tittat på.

## Snabbfixar

- [x] **4. Sidtitel per sida.** ([#48](https://github.com/jesperhardyson/sopor/pull/48), även punkt 5–8) Titeln är alltid "Sopor – när töms dina kärl?". Adressidan bör heta t.ex. "Svartbäcksgatan 10, Uppsala – Sopor", så att flikar, bokmärken och historik går att skilja åt.
- [x] **5. Webbappsmanifest.** `/manifest.webmanifest` saknas (ger startsidans HTML). Med manifest kan sajten läggas på hemskärmen som en app.
- [x] **6. Delningsbild och OG-taggar.** En delad länk visade ingen förhandsbild i Messenger, sms eller Slack. Nu finns en gemensam bild för hela sajten (ritad i designfilen). Se punkt 13 för en bild per adress.
- [x] **7. Typsnitten från egen server.** Fredoka och Nunito hämtas från Google Fonts, vilket skickar besökarnas IP-adresser till Google. Självhosta dem (snabbare också).
- [x] **8. Se över testbanderollen.** Borttagen. Att tjänsten är inofficiell står i sidfoten och på Om-sidan.

## Funktioner

- [x] **9. Förklara "beräknat".** En rad under "Kommande tömningar" förklarar etiketten när schemat har beräknade datum, och etiketterna pekar på den för skärmläsare (`aria-describedby`). Förut fanns förklaringen bara som `title`, som inte syns på mobil.
- [x] **10. Dela-knapp på adressidan.** Bredvid Spara: telefonens delningsmeny (`navigator.share`), annars kopieras länken.
- [x] **11. Bevakning av källorna.** Ett veckojobb (`.github/workflows/sources.yml`) kontrollerar varje källa och gör problem till ärenden med etiketten `källa`. Se `docs/specs/2026-11-02-bevakning-av-kallor.md`.
- [ ] **12. Fas 3: källor utanför EDP.** Storstäderna (Stockholm, Göteborg, Malmö, Linköping …) kräver andra system, och där växer täckningen mest. En källa i taget, efter folkmängd.
  - [x] Stockholm (SVOA): villor och radhus, se `docs/specs/2026-11-02-stockholm.md`.

- [ ] **13. Delningsbild per adress.** Delningstjänster kör inte JavaScript, så alla länkar får sajtens gemensamma bild. En bild med adressen (och kanske nästa tömning) kräver att servern svarar med egna `og:`-taggar för adressidorna, till exempel en Vercel-funktion för `/:källa/:adress` som fyller i taggarna i `index.html`, plus en bild som genereras av en funktion. Kostar funktionsanrop per sidvisning och behöver en design först.

## Redan klart eller pågår

- Påminnelse i kalendern: ICS-filerna har redan `VALARM` (6 timmar före).
- Påminnelser på webben: det finns en worktree `sopor-paminnelser`. Kolla läget där innan något byggs.
