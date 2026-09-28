import HeroSection from "../components/HeroSection";
import EventInfo from "../components/EventInfo";
import { CONTACT_EMAIL } from "../eventInfo";

export default function RegistrationLandingPage() {
  return (
    <main>
      <HeroSection />
      <EventInfo />
      <section className="register" id="prihlaska">
        <div className="register__inner">
          <h2 className="register__heading">Prihláška</h2>
          <p className="register__description">
            Registrácia je uzavretá.
          </p>
          <button type="button" className="register__button" disabled>
            Vyplniť prihlášku
          </button>
          <p className="register__note">
            Ak sa chcete ešte prihlásiť, napíšte nám na{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
