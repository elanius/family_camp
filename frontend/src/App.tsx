import HeroSection from "./components/HeroSection";
import CampInfo from "./components/CampInfo";
import RegisterForm from "./components/RegisterForm";

function App() {
  return (
    <>
      <main>
        <HeroSection />
        <CampInfo />
        <RegisterForm />
      </main>
      <footer>
        <p>
          © {new Date().getFullYear()} Detský biblický tábor · ECAV Obišovce.
          Všetky práva vyhradené.
        </p>
      </footer>
    </>
  );
}

export default App;
