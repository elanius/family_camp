import HeroSection from "../components/HeroSection";
import CampInfo from "../components/CampInfo";

export default function RegistrationLandingPage() {
  return (
    <main>
      <HeroSection />
      <CampInfo />
      <section className="register">
        <div className="register__inner">
          <h2 className="register__heading">Registrácia na tábor</h2>
          <p className="register__description">
            Registrácia na tábor bola ukončená. Ďakujeme za váš záujem.
          </p>
          <button className="register__button" disabled>
            Zaregistrovať sa
          </button>
          <p className="register__message register__message--error">
            ℹ️ Registrácia bola zastavená.
          </p>
        </div>
      </section>
    </main>
  );
}
