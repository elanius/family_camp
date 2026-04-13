import { useNavigate } from "react-router-dom";
import HeroSection from "../components/HeroSection";
import CampInfo from "../components/CampInfo";

export default function RegistrationLandingPage() {
  const navigate = useNavigate();

  return (
    <main>
      <HeroSection />
      <CampInfo />
      <section className="register">
        <div className="register__inner">
          <h2 className="register__heading">Registrácia na tábor</h2>
          <p className="register__description">
            Registrácia je otvorená. Kliknutím na tlačidlo nižšie vyplníte
            registračný formulár pre seba a ďalších účastníkov.
          </p>
          <button
            className="register__button"
            onClick={() => navigate("/form")}
          >
            Zaregistrovať sa
          </button>
        </div>
      </section>
    </main>
  );
}
