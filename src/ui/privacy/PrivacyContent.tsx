import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { SITE } from '../../config'
import { BackLink, KommunColumn } from '../kommun/KommunContent'

const link = 'font-bold text-primary underline underline-offset-2'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xl font-extrabold tracking-[-0.3px] text-text">{title}</h2>
      {children}
    </section>
  )
}

function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h3 className="text-[15px] font-extrabold text-text">{title}</h3>
      {children}
    </div>
  )
}

const P = ({ children }: { children: ReactNode }) => <p className="text-[15px] leading-normal text-text-2">{children}</p>

const Points = ({ children }: { children: ReactNode }) => <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] leading-normal text-text-2">{children}</ul>

/** Policyn, både i appen och i den statiska HTML-filen. Läser varken lagring eller nät. */
export function PrivacyContent() {
  const contact = (
    <a href={`mailto:${SITE.contactEmail}`} className={link}>
      {SITE.contactEmail}
    </a>
  )
  return (
    <KommunColumn>
      <BackLink to="/">Startsidan</BackLink>
      <div className="flex flex-col gap-2.5">
        <h1 className="text-[34px] leading-[1.1] font-extrabold tracking-[-0.8px] text-text md:text-[44px]">Integritetspolicy</h1>
        <p className="text-[17px] leading-[1.45] text-text-2">
          Den här policyn gäller webbplatsen {SITE.host}, Sopors API och appen Sophämtning. Sopor har inga konton, ingen reklam och inga spårningscookies, och vi säljer inga uppgifter.
        </p>
        <p className="text-[13px] text-text-2">Senast ändrad 25 november 2026</p>
      </div>

      <Section title="Vem som ansvarar">
        <P>Jesper Hardyson driver Sopor som ett hobbyprojekt och ansvarar för de personuppgifter som behandlas. Du når oss på {contact}.</P>
        <P>Sopor är en inofficiell tjänst och är inte kopplad till någon kommun eller något avfallsbolag.</P>
      </Section>

      <Section title="Webbplatsen">
        <Part title="Det som sparas på din enhet">
          <P>Det här ligger bara i din webbläsare, och vi kan inte läsa det:</P>
          <Points>
            <li>sparade adresser och namn som du ger dem, till exempel ”Hemma”</li>
            <li>det senast hämtade schemat för sparade adresser, så att det går att visa när källan inte svarar</li>
            <li>områden som du har valt</li>
            <li>om du vill ha ljust eller mörkt läge</li>
          </Points>
          <P>
            Adresser, scheman och områden kan du radera på{' '}
            <Link to="/om" className={link}>
              Om-sidan
            </Link>
            , och allt försvinner om du rensar webbläsarens data. Webbplatsen sparar också sina egna sidor och filer i webbläsaren, så att den fungerar när nätet är dåligt.
          </P>
        </Part>
        <Part title="Det som skickas när du söker">
          <P>
            Söktexten och den adress du väljer skickas till Sopor för att hämta schemat. Sopors server kan i sin tur fråga kommunens eller avfallsbolagets tjänst och skickar då med söktexten eller adressen. Din ip-adress och andra uppgifter om din enhet skickas inte vidare till dem.
          </P>
          <P>Lägger du schemat i kalendern finns adressens id i länken, och din kalendertjänst hämtar schemat från Sopor.</P>
        </Part>
        <Part title="Drift, loggar och cache">
          <P>
            Webbplatsen och API:t körs hos Vercel, som tekniskt behöver hantera din ip-adress för att kunna svara. Serverfunktionernas loggar sparas i en timme och kan innehålla förfrågans adress, och därmed det du sökte på. Vi använder dem bara för att felsöka.
          </P>
          <P>
            Svar sparas tillfälligt i Vercels cache för att källorna ska få färre anrop: sökresultat i högst åtta dygn och scheman i drygt ett dygn. Cachen kopplar inte svaren till den som frågade.
          </P>
          <P>
            Vercel är ett amerikanskt företag, och uppgifter kan behandlas utanför EU. Vercel anger att det följer EU:s och USA:s Data Privacy Framework och använder standardavtalsklausuler. Läs mer i{' '}
            <a href="https://vercel.com/legal/privacy-notice" rel="noopener" className={link}>
              Vercels integritetsmeddelande
            </a>
            .
          </P>
        </Part>
        <Part title="Besöksstatistik">
          <P>
            Vi räknar besök med Vercel Web Analytics, utan cookies. Varje sidvisning sparas med tid, sida, varifrån du kom, ungefärlig plats, operativsystem, webbläsare och typ av enhet. Besökare skiljs åt med en hash som kastas efter 24 timmar. Vi kan se statistiken 31 dagar bakåt.
          </P>
          <P>
            Adressen tas bort ur sidans adress innan den skickas. Söker du på en ort i en kommun som Sopor saknar räknas kommunens namn, aldrig det du skrev, så att vi kan se vilka kommuner som efterfrågas.
          </P>
        </Part>
      </Section>

      <Section title="Appen Sophämtning">
        <Points>
          <li>Appen har inga konton. Bara hushåll använder en egen server, och det gäller den som själv väljer att skapa eller gå med i ett.</li>
          <li>Adresser, inställningar och senast hämtade schema sparas i telefonen. Bara det du delar i ett hushåll sparas också på annat håll, se nedan.</li>
          <li>Söktext och valda adresser skickas till Sopors API för att hämta schemat, och Sopor kan i sin tur fråga kommunens eller bolagets tjänst. Avsnittet om drift, loggar och cache gäller också här.</li>
          <li>Frågan om din kommun finns med besvaras i telefonen. Bara kommunens namn skickas vidare, och först när kommunen täcks.</li>
          <li>Appen samlar inte in analysdata och spårar dig inte.</li>
          <li>Notiser och Live Activities visas av appen själv och är avstängda från början. I ett hushåll kan telefonen väckas av en tyst push när något har ändrats. Den visar inget och innehåller inget av det ni delar.</li>
          <li>Webblänkar öppnas i appens webbvy, och där gäller varje sidas egen hantering av uppgifter.</li>
        </Points>
        <Part title="Hushåll i appen">
          <P>
            Om du väljer att skapa eller gå med i ett hushåll i appen Sophämtning delas följande med dem du bjuder in eller som bjudit in dig: de adresser du väljer att dela, markeringar om att kärlen är utställda (vem och när) och det namn du själv skriver i hushållet. Inget av detta delas med andra än deltagarna i hushållet.
          </P>
          <P>
            Innehållet krypteras på telefonen innan det skickas, med en nyckel som bara finns hos deltagarna, och lagras hos Cloudflare inom EU. Varken Sopor eller Cloudflare kan läsa det. Nyckeln sparas i telefonens nyckelring och följer med iCloud-nyckelringen till dina andra Apple-enheter.
          </P>
          <P>
            Inbjudan är en länk som innehåller nyckeln. Den har en del efter # som aldrig skickas till någon webbserver när länken öppnas, men den tjänst du skickar länken med kan se den. Den som har länken kan gå med i hushållet. Den gäller i sju dagar, och ägaren kan göra den ogiltig tidigare.
          </P>
        </Part>
        <Part title="Det som servern för hushåll ser">
          <P>För att kunna förmedla det krypterade innehållet sparar servern, kopplat till hushållet:</P>
          <Points>
            <li>slumpade id för hushållet och deltagarna, och vem som är ägare</li>
            <li>hur många deltagare, adresser och markeringar hushållet har, vem av de slumpade id:na som skrev dem och när något ändras</li>
            <li>vilken dag en markering slutar gälla</li>
            <li>telefonens pushadress. Pushen går via Apple och innehåller bara hushållets id och ett löpnummer.</li>
          </Points>
          <P>
            Cloudflare är vårt personuppgiftsbiträde för hushållen och behöver tekniskt hantera din ip-adress för att kunna svara. Vi sparar ingen logg över anropen. När ett hushåll skapas sparas en hash av ip-adressen i ungefär en timme, för att begränsa hur många hushåll som kan skapas. Cloudflare är ett amerikanskt företag, och tekniska uppgifter som ip-adress och interna id kan behandlas utanför EU. Läs mer i{' '}
            <a href="https://www.cloudflare.com/privacypolicy/" rel="noopener" className={link}>
              Cloudflares integritetspolicy
            </a>
            .
          </P>
        </Part>
        <Part title="När uppgifterna om hushållet tas bort">
          <Points>
            <li>En markering om att kärlen är utställda raderas dagen efter hämtningen.</li>
            <li>Lämnar du hushållet, eller tas bort ur det, raderas ditt namn och din pushadress. Ditt slumpade id finns kvar tills hushållet är slut. De adresser du har delat finns kvar hos de andra tills någon slutar dela dem, och dina egna finns kvar i din telefon.</li>
            <li>Avslutar ägaren hushållet raderas innehållet. Då finns bara hushållets id, orsaken och tiden kvar, så att telefonerna kan få veta att det är slut. Ett hushåll som ingen har använt på 400 dagar raderas på samma sätt.</li>
            <li>Att något har tagits bort kommer servern ihåg i 30 dagar, utan innehållet. Cloudflare kan tekniskt återställa raderade uppgifter i högst 30 dagar, men de är fortfarande krypterade.</li>
          </Points>
        </Part>
        <Part title="Hushåll från äldre versioner av appen">
          <P>
            Hushåll som skapades i en äldre version av appen sparas med Apples tjänst CloudKit, i hushållsägarens iCloud. Sopor kan inte läsa dem, och Apples integritetspolicy gäller för lagringen. När ägaren har uppdaterat appen flyttas hushållet till den krypterade lagringen ovan, och deltagarna följer med när de har uppdaterat. För att de ska kunna göra det ligger en länk till det flyttade hushållet i iCloud, där hushållets deltagare och i princip Apple kan läsa den. Delningen i iCloud tas bort 90 dagar efter flytten, eller när hushållet avslutas.
          </P>
        </Part>
        <P>Integrationerna för Homey och Home Assistant hämtar också schemat från Sopors API.</P>
      </Section>

      <Section title="Om du kontaktar oss">
        <P>Mejlar du oss sparas mejlet så länge det behövs för att svara och följa upp. Ärenden på GitHub är offentliga, och där gäller GitHubs villkor.</P>
      </Section>

      <Section title="Dina rättigheter">
        <P>
          Vi behandlar uppgifterna för att tjänsten ska fungera och för att förstå hur den används, vilket är vårt berättigade intresse. Du har rätt att få veta vilka uppgifter vi har om dig, att få dem rättade eller raderade, att begära att behandlingen begränsas och att invända mot den.
        </P>
        <P>Eftersom Sopor inte har konton kan vi oftast inte koppla uppgifter till en viss person, men hör gärna av dig till {contact} så hjälper vi dig.</P>
        <P>
          Är du missnöjd kan du klaga hos{' '}
          <a href="https://www.imy.se" rel="noopener" className={link}>
            Integritetsskyddsmyndigheten
          </a>
          .
        </P>
      </Section>
    </KommunColumn>
  )
}
