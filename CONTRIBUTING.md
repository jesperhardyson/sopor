# Bidra till Sopor

Tack för att du vill hjälpa till! Det viktigaste bidraget är **fler kommuner**, och du behöver inte kunna programmera.

## Utan kod

- **Tipsa om din kommun.** [Guiden om att hitta kommunens data](docs/kommuner/hitta-kommunens-data.md) visar hur du ser om schemat finns publikt och hur du begär ut det som saknas. Berätta vad du hittat i ett [ärende om ny kommun](https://github.com/jesperhardyson/sopor/issues/new?template=ny-kommun.md).
- **Rapportera ett fel.** Öppna ett [ärende om fel i schemat](https://github.com/jesperhardyson/sopor/issues/new?template=fel-i-schemat.md) med adress, datum och länk till kommunens uppgift.

Det går också bra att mejla support@hardyson.se.

## Med kod

1. Forka repot och skapa en gren.
2. Gör ändringen:
   - **En ny kommun eller ett nytt års schema:** följ [checklistan](docs/kommuner/lagga-till-kommun.md).
   - **Något annat:** läs [utvecklarguiden](docs/utveckling.md) och reglerna i [`AGENTS.md`](AGENTS.md).
3. Kör `npm run lint && npm test && npm run build`. GitHub Actions kör samma kontroller.
4. Öppna en pull request och fyll i mallen. Gäller det data, länka till kommunens publika källa.

Varje pull request får en egen preview-adress på Vercel, så du kan prova ändringen live.

## Regler

- **Bara publika källor.** Inga anrop mot inloggade tjänster som Mina sidor eller BankID, inte heller med ditt eget konto.
- **Adress-id ändras aldrig och återanvänds aldrig,** eftersom kalenderprenumerationer hänger på dem. CI stoppar ändringar som tar bort ett befintligt id.
- **Gissa aldrig** vilken adress som hör till vilket område. En gissning som blir fel får folk att missa sin tömning.
- **Svenska** i UI, kommentarer och commit-meddelanden.
