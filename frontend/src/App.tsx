import { Routes, Route } from "react-router-dom";
import MainPage from "./pages/MainPage";
import RegistrationLandingPage from "./pages/RegistrationLandingPage";
import RegistrationFormPage from "./pages/RegistrationFormPage";
import RegistrationSummaryPage from "./pages/RegistrationSummaryPage";
import { RegistrationProvider } from "./context/RegistrationContext";

function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/registration" element={<RegistrationLandingPage />} />
        <Route
          path="/registration/*"
          element={
            <RegistrationProvider>
              <Routes>
                <Route path="form" element={<RegistrationFormPage />} />
                <Route path="summary" element={<RegistrationSummaryPage />} />
              </Routes>
            </RegistrationProvider>
          }
        />
      </Routes>
      <footer>
        <p>© {new Date().getFullYear()} Detský biblický tábor · ECAV Obišovce. Všetky práva vyhradené.</p>
      </footer>
    </>
  );
}

export default App;
