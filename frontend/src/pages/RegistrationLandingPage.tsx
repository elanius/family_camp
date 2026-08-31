import { Link } from "react-router-dom";
import HeroSection from "../components/HeroSection";
import EventInfo from "../components/EventInfo";
import { CONTACT_EMAIL, REGISTRATION_DEADLINE } from "../eventInfo";

export default function RegistrationLandingPage() {
  return (
    <main>
      <HeroSection />
      <EventInfo />
      <section className="register" id="prihlaska">
        <div className="register__inner">
          <h2 className="register__heading">Prihláška</h2>
          <p className="register__description">
            Prihlásiť sa môžete do {REGISTRATION_DEADLINE}. V prihláške uveďte
            mená všetkých prihlásených a o čo máte záujem. Prihlášku vám spätne
            potvrdíme e-mailom.
          </p>
          <Link to="/registration" className="register__button">
            Vyplniť prihlášku
          </Link>
          <p className="register__note">
            Prihláste sa, aj keď nemáte záujem o stravu či ubytovanie a plánujete
            prísť iba na vzdelávanie. Ak sa nestihnete prihlásiť v termíne,
            napíšte nám na{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>
        </div>
      </section>
    </main>
  );
}
