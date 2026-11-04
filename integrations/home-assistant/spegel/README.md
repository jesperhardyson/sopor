# Sophämtning för Home Assistant

Hämtschemat för din adress som sensorer, kalender och en händelse när schemat ändras. Datan kommer från [Sopor](https://sopor.hardyson.se), en inofficiell och gratis tjänst för sophämtning i Sverige. Vid avvikelser gäller kommunens information.

*Waste collection schedules for Swedish addresses, from sopor.hardyson.se. The integration's texts are in Swedish and English.*

[![Öppna i HACS i din Home Assistant](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=jesperhardyson&repository=sopor-home-assistant&category=integration)

## Installation

1. Installera via HACS: tryck på knappen ovan, eller sök efter *Sophämtning* i HACS.
2. Starta om Home Assistant.
3. Gå till *Inställningar → Enheter och tjänster → Lägg till integration*, välj *Sophämtning* och sök upp adressen, till exempel *Storgatan 2, Uppsala*.

## Det här får du

- En datumsensor per avfallstyp med nästa hämtning.
- *Nästa hämtning*, *Dagar kvar*, *Hämtas i dag* och *Hämtas i morgon*.
- *Hämtschema*: en kalender som fungerar med kalendertriggerns förskjutning, till exempel en påminnelse kvällen innan kl. 18.
- *Schemat ändrades*: en händelse när en hämtning flyttas, till exempel kring helgdagar.
- Dölj avfallstyper du inte har, och byt adress utan att automationerna går sönder.

Hela beskrivningen, med exempel på automationer, finns i [dokumentationen](https://github.com/jesperhardyson/sopor/tree/main/integrations/home-assistant).

## Om det här repot

Det här repot är en spegling för HACS. Integrationen utvecklas i [jesperhardyson/sopor](https://github.com/jesperhardyson/sopor), och varje release kopieras hit. Ärenden tas emot [här](https://github.com/jesperhardyson/sopor-home-assistant/issues).

Licens: MIT.
