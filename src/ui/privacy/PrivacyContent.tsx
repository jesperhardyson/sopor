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
        <p className="text-[13px] text-text-2">Senast ändrad 7 november 2026</p>
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
          <li>Appen har inga konton och ingen egen backend.</li>
          <li>Adresser, inställningar och senast hämtade schema sparas bara i telefonen.</li>
          <li>Söktext och valda adresser skickas till Sopors API för att hämta schemat, och Sopor kan i sin tur fråga kommunens eller bolagets tjänst. Avsnittet om drift, loggar och cache gäller också här.</li>
          <li>Frågan om din kommun finns med besvaras i telefonen. Bara kommunens namn skickas vidare, och först när kommunen täcks.</li>
          <li>Appen samlar inte in analysdata och spårar dig inte.</li>
          <li>Notiser och Live Activities är lokala och avstängda från början. De fungerar utan push-server.</li>
          <li>Webblänkar öppnas i appens webbvy, och där gäller varje sidas egen hantering av uppgifter.</li>
        </Points>
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
