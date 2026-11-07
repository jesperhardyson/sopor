# Spec: Snabbare och träffsäkrare adressökning

Status: beslutad 2026-11-07. Gäller webben och API v1, så att Homey och Home Assistant får förbättringen utan ny release.

## Bakgrund

Mätt mot produktion 2026-11-07:

- `Skolgatan 7, Falkenberg` gav 29 anrop till `/api/sok` och svaret "hittades inte" efter cirka 7 s, eftersom Örebros källa inte svarade och fick ett nytt försök. Skärmen varnade dessutom för Örebro och Gotland, som frågan inte gällde.
- API v1 väntar på den långsammaste källan. Med Örebro nere tog många sökningar över 3 s, också `Kungsgatan, Västerås`.
- Träffarna rankades inte. På `storgatan 5` kom `Storgatan 50` först, och den första exakta träffen låg på plats 11.
- Varje anrop hämtade `orter.json` (460 kB) och gatuindexet på nytt från sajten.

## Mål

- Användaren ska inte vänta på en källa som frågan inte gäller.
- En källa som inte svarar ska inte hålla tillbaka svaret.
- Exakt adress på rätt ort ska stå först, på webben och i API:t.
- Inga träffar får försvinna jämfört med i dag, bara komma senare i ovanliga fall.

## Beslut

### Källor väljs utifrån orten

Nämner frågan en plats frågas bara källorna som täcker den (`sourcesAtPlace` i `src/data/street-index.ts`). Ett kommunnamn betyder kommunen, även om en by på annat håll heter likadant. Andra platser slås upp exakt i `sverige.json`, `orter.json` och gatuindexet. Finns ingen exakt plats används början av namnet, utan gatuindexets gator. Okänd plats ger samma källor som i dag.

Källorna som täcker platsen frågas även om gatan saknas i gatuindexet, eftersom OpenStreetMap kan sakna gatan.

Postorter kan korsa kommungränser. Svarar platsens källor utan träffar frågas därför övriga källor med gatan också:

- **Webben** visar svaret direkt och frågar de övriga efter en kort väntan i bakgrunden. Sena träffar läggs in i listan.
- **API v1** frågar dem inom en tidsgräns och svarar sedan.

Källor som frågas i det andra steget räknas inte i `failed`, eftersom frågan inte gäller dem.

### Tidsgränser

- **Webben** ger sitt svar senast 1,5 s efter att anropen gått iväg. Källor som inte svarat står som "svarar inte just nu", men deras svar läggs in när de kommer och varningen försvinner då. Det nya försöket för sömniga källor finns kvar, men håller inte tillbaka svaret.
- **API v1** svarar senast efter 2 s när frågan inte nämner en plats. Källor som inte hunnit står i `failed`, och svaret cachas kort (`CACHE_PARTIAL`). Med `kalla` eller en plats i frågan gäller källans vanliga tidsgräns, eftersom användaren då pekat ut källan.

### Rankning

`rankHits` i `src/domain/search.ts` används av både webb och API. Ordningen är:

1. Exakt gata och husnummer, sedan samma nummer med bokstav (`5a`), sedan nummer som börjar likadant (`50`), sedan övrigt.
2. Exakt ort före ort som bara börjar likadant.
3. På webben: källor användaren har sparade adresser hos. Uppgiften lämnar aldrig webbläsaren.

Annars behålls ordningen, så att träffarna från samma källa står som källan gav dem.

Raderna som syns flyttas fortfarande inte när nya källor svarar, med ett undantag: en exakt träff går före de andra, eftersom det är den användaren letar efter.

### Mindre väntan i övrigt

- Servern sparar sajtens statiska filer i minnet under funktionens livstid. Filerna ändras bara vid driftsättning.
- Webben hoppar över väntan före anropen när frågan nämner en plats, och samlar svar i 250 ms i stället för 400 ms.
- `sverige.json` hämtas redan när sökfältet får fokus.

## Utanför

IP-baserad plats och GPS. Ingen ny parameter i API:t. API-kontraktet ändras inte: bara ordningen i `addresses` och när `failed` används.
