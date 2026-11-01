import { BuildYourOwn } from '../integrations/BuildYourOwn'
import { IntegrationCards } from '../integrations/IntegrationCards'

/** Startsidans avsnitt om Homey och Home Assistant, med samma kort som Om-sidan. */
export function SmartHomeSection() {
  return (
    <section
      aria-labelledby="smarta-hem-start-rubrik"
      className="mx-auto flex w-full max-w-[960px] flex-col gap-6 px-5 pt-12 lg:gap-10 lg:px-0 lg:pt-6 lg:pb-24"
    >
      <div className="flex flex-col gap-2 lg:gap-2.5">
        <p className="text-[13px] font-extrabold tracking-[1.4px] text-primary uppercase">Smarta hem</p>
        <h2
          id="smarta-hem-start-rubrik"
          className="text-[28px] leading-[1.15] font-extrabold tracking-[-0.8px] text-text lg:max-w-[620px] lg:text-4xl lg:tracking-[-1px]"
        >
          Påminnelse i Homey eller Home Assistant
        </h2>
        <p className="text-[15px] leading-[1.4] text-text-2 lg:max-w-[620px] lg:text-base">
          Få veta när soporna hämtas, direkt i ditt smarta hem. Det är gratis, och du behöver inget konto.
        </p>
      </div>
      <IntegrationCards />
      <BuildYourOwn />
    </section>
  )
}
