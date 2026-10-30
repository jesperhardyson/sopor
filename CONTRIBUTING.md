# Bidra till Sopor

Tack för att du vill hjälpa till! Det viktigaste bidraget är **fler kommuner**.

1. Forka repot och skapa en gren.
2. Följ [Lägga till en kommun](README.md#lägga-till-en-kommun) eller
   [Uppdatera årets schema](README.md#uppdatera-årets-schema) i README.
3. Kör `npm test && npm run build`.
4. Öppna en pull request och fyll i mallen, med länk till kommunens publika källa.

Regler:

- Bara publika källor. Inga anrop mot inloggade tjänster som Mina sidor, och ingen scraping bakom inloggning.
- Adress-id får aldrig ändras eller återanvändas, eftersom kalenderprenumerationer hänger på dem.
- Allt UI är på svenska.

Arkitekturen och reglerna för kod finns i [`AGENTS.md`](AGENTS.md).
