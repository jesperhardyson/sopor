# Spec: Välj påminnelsetid för kalendern

Status: förslag, 2026-11-04. Bygger vidare på avsnittet ICS i `2026-10-30-sopor-design.md`.

## Mål

Den som lägger till sopkalendern ska kunna välja när påminnelsen kommer. I dag får alla kl. 18 kvällen innan, och i Apple Kalender går det bara att slå på eller av påminnelser för en prenumeration, inte att välja tid.

Valet görs på sajten innan kalendern läggs till och följer med i kalenderlänken. Det kräver varken konton eller databas. Befintliga prenumerationer fungerar som förut.

## Ingår inte

- **Tid per post.** En prenumererad kalender är skrivskyddad. Den som vill styra enskilda poster kan ladda ner `.ics`-filen, men får då inga uppdateringar.
- Tid per sopsort. Homey och Home Assistant täcker det behovet.
- Fri tidsinmatning.
- Prenumeration utan påminnelse.
- Att byta tid på en befintlig prenumeration. Man tar bort kalendern och lägger till den igen.

## Valen

| Val i rutan | Id i länken | Kalenderlänk | Trigger | Text i påminnelsen |
|---|---|---|---|---|
| Kvällen innan, kl. 18 (förvalt) | inget | `/ics/<källa>/<adress-id>.ics` | `-PT6H` | I morgon: … |
| Kvällen innan, kl. 20 | `kvall-20` | `/ics/<källa>/kvall-20/<adress-id>.ics` | `-PT4H` | I morgon: … |
| Samma morgon, kl. 06 | `morgon` | `/ics/<källa>/morgon/<adress-id>.ics` | `PT6H` | I dag: … |
| Kväll och morgon | `kvall-och-morgon` | `/ics/<källa>/kvall-och-morgon/<adress-id>.ics` | `-PT6H` och `PT6H` | I morgon: … och I dag: … |

Händelserna är heldagshändelser som börjar vid midnatt, så triggern räknas från midnatt i användarens tid. "Kväll och morgon" ger två `VALARM` i varje händelse, kvällens först.

Förvalet heter `kvall-18` i koden men har ingen egen länk, så varje val har precis en adress. Id:n i länken får aldrig ändras när de är publicerade, eftersom prenumerationer hänger på dem. Det läggs till i arkitekturregel 3 i `AGENTS.md`.

## Kalenderfilen

- Valen samlas i `src/domain/reminders.ts`: id, etikett och påminnelser (trigger och textens inledning), plus typen `ReminderId` och `DEFAULT_REMINDER`. Filen är ren TypeScript utan React.
- `buildIcs` får ett valfritt argument `reminder`, med `DEFAULT_REMINDER` som standard. Utan argument blir filen exakt densamma som i dag, så de befintliga snapshot-testerna ska passera oförändrade.
- UID, `DTSTAMP` och allt annat i filen är lika för alla val.
- `buildNoticeIcs` ändras inte. Den har ingen påminnelse.

## Länkarna

De färdigbyggda filerna under `public/ics/` ligger kvar och är fortfarande förvalet för statiska källor. Dagens uppställning utgår från att en statisk fil går före omskrivningen med samma sökväg, och då skulle en parameter som `?paminnelse=morgon` ignoreras där. Vercels sida om omskrivningar bekräftar inte ordningen, men valet behöver inte vila på den: det ligger i sökvägen, där ingen statisk fil finns, och fungerar oavsett.

- **`vercel.json`:** en ny omskrivning från `/ics/:source/:reminder/:file` till `/api/ics?source=:source&reminder=:reminder&file=:file`. Headerregeln `/ics/(.*)` täcker redan den nya sökvägen. Den gamla omskrivningen har ett segment mindre och krockar inte.
- **`handleIcs`:** läser `reminder`. Utan parameter används förvalet. Ett okänt värde, och även förvalets id `kvall-18`, ger 404 med `CACHE_PARTIAL`, innan källan anropas. Annars gäller dagens felhantering: 502 när källan inte svarar, och notisfilen när adressen inte längre finns. `lookupAddress` hanterar redan statiska källor, så de fungerar via funktionen utan ändring.
- **`vite.config.ts`:** dev-servern får samma sökväg.
- **Service workern:** ingen ändring. Den hoppar redan över `/ics/`.
- **API v1:** ingen ändring. Fältet `ics` pekar fortsatt på förvalet.

### Providergränsen

- `WasteProvider.icsUrl(addressId, reminder?)` får valet som andra argument. Utan det eller med förvalet blir länken densamma som i dag. Både `static.ts` och `api.ts` ändras.
- `CalendarSheet` byter propen `icsPath: string` mot `icsUrl: (reminder: ReminderId) => string`, och `ResultPage` skickar in en funktion som anropar providern. UI:t känner fortfarande inte till sökvägarna.

## Kalenderrutan

Designen ritas först, i både `Mobil · Lägg till i kalender` (`M1Tes`) och `Desktop · Lägg till i kalender` (`foIAb`). Rutan med notistexten finns i koden men inte i designen, så den ritas in samtidigt. Ingenting byggs förrän designen finns.

- Nytt avsnitt **När vill du bli påmind?** ovanför alternativen, med de fyra valen i tabellen. Det är en radiogrupp som går att använda med tangentbord och skärmläsare.
- Valet gäller alla länkar i rutan: Prenumerera, Google Kalender, Apple Kalender och Ladda ner .ics.
- Valet sparas inte. Rutan börjar på kl. 18 varje gång den öppnas.

Notistexten ersätts. Första meningen följer valet:

> Påminnelsen kommer kvällen innan kl. 18. Slå på notiser för kalendern i din kalenderapp. Google Kalender visar troligen inte påminnelser från prenumerationer. Vill du byta tid senare tar du bort kalendern och lägger till den igen.

Övriga val inleds med "Påminnelsen kommer kvällen innan kl. 20.", "Påminnelsen kommer samma morgon kl. 06." och "Påminnelser kommer kvällen innan kl. 18 och samma morgon kl. 06.". Meningen om Google justeras efter det manuella testet nedan.

## Konsekvenser

- **Statiska källor:** ett val utöver förvalet går via funktionen i stället för en färdig fil, som sedan cachas på Vercel.
- **Livekällor:** varje val cachas för sig, så en adress kan ge upp till fyra gånger så många anrop mot källan. Regel 4 säger att anropen ska hållas få, men svaren cachas och de flesta väntas behålla förvalet.
- **Morgonvalet:** påminnelsen kommer kl. 06, samma tid som sajten anger som senast för att ställa ut kärlen. Marginalen är alltså liten, men valet finns för den som vill ha det.
- **Dubbletter:** lägger man till en ny tid utan att ta bort den gamla får man två kalendrar. Därför nämner notistexten det.

## Tester

Skrivs först (Vitest + Testing Library).

- **`ics.test.ts`:** trigger och text för varje val, två `VALARM` för "Kväll och morgon", samma UID för alla val och oförändrad snapshot för förvalet.
- **`handlers`-tester:** vald tid ger rätt fil för både statisk källa och livekälla, utan parameter blir det förvalet, och ett okänt värde samt `kvall-18` ger 404 utan anrop mot källan.
- **`vercel-config.test.ts`:** omskrivningen finns, och appens regel till `index.html` fångar inte den nya sökvägen.
- **Provider-tester:** länken för varje val, och oförändrad länk utan val.
- **`sheets.test.tsx`:** förvalet ger dagens länkar, ett annat val ändrar alla fyra länkarna, notistexten följer valet och valet går att göra med tangentbord.

### Manuellt, på en preview-adress

Går inte att automatisera, och görs innan PR:en mergas:

1. En statisk och en livekälla med tiden i sökvägen svarar med `text/calendar` och rätt `TRIGGER`.
2. Prenumeration på en iPhone: `kvall-20` och `morgon` ger påminnelse vid rätt tid med Aktivitetspåminnelser påslaget.
3. Prenumeration i Google Kalender: visar den påminnelser? Texten i rutan justeras efter svaret.

## Dokument som uppdateras

- `AGENTS.md`, regel 3: id:n i kalenderlänken är stabila.
- `docs/utveckling.md`, avsnittet Kalendrar: valen och varför de går via funktionen.
- `docs/specs/2026-10-30-sopor-design.md`, avsnittet ICS: raden om `VALARM` hänvisar hit.
