# Bidra till Sopor

Tack för att du vill hjälpa till! Det viktigaste bidraget är **fler kommuner**.

Börja med [checklistan för att lägga till en kommun](docs/kommuner/lagga-till-kommun.md). Den visar vilken väg som gäller för din kommun. [Guiden om att hitta kommunens data](docs/kommuner/hitta-kommunens-data.md) beskriver mer utförligt hur du ser om schemat finns publikt och begär ut det som saknas.

1. Forka repot och skapa en gren.
2. Följ [checklistan](docs/kommuner/lagga-till-kommun.md) eller
   [Uppdatera årets schema](README.md#uppdatera-årets-schema) i README.
3. Kör `npm run lint && npm test && npm run build`.
4. Öppna en pull request och fyll i mallen, med länk till kommunens publika källa.

Regler:

- Bara publika källor. Inga anrop mot inloggade tjänster som Mina sidor, och ingen scraping bakom inloggning.
- Adress-id får aldrig ändras eller återanvändas, eftersom kalenderprenumerationer hänger på dem.
- Allt UI är på svenska.

Arkitekturen och reglerna för kod finns i [`AGENTS.md`](AGENTS.md).
