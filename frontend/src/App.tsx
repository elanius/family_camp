import { Routes, Route, Navigate } from "react-router-dom";
import RegistrationLandingPage from "./pages/RegistrationLandingPage";
import RegistrationFormPage from "./pages/RegistrationFormPage";
import RegistrationSummaryPage from "./pages/RegistrationSummaryPage";
import RegistrationUpdatePage from "./pages/RegistrationUpdatePage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminPage from "./pages/AdminPage";
import PaymentInfoPage from "./pages/PaymentInfoPage";
import { RegistrationProvider } from "./context/RegistrationContext";
import { AdminAuthProvider, useAdminAuth } from "./context/AdminAuthContext";

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAdminAuth();
  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <Navigate to="/admin/login" replace />
  );
}

function App() {
  return (
    <AdminAuthProvider>
      <Routes>
        <Route path="/" element={<RegistrationLandingPage />} />
        <Route
          path="/registration"
          element={
            <RegistrationProvider>
              <RegistrationFormPage />
            </RegistrationProvider>
          }
        />
        <Route
          path="/form"
          element={
            <RegistrationProvider>
              <RegistrationFormPage />
            </RegistrationProvider>
          }
        />
        <Route
          path="/summary"
          element={
            <RegistrationProvider>
              <RegistrationSummaryPage />
            </RegistrationProvider>
          }
        />
        <Route path="/update/:token" element={<RegistrationUpdatePage />} />

        {/* Admin */}
        <Route path="/admin/login" element={<AdminLoginPage />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminPage />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/payment/:id"
          element={
            <AdminRoute>
              <PaymentInfoPage />
            </AdminRoute>
          }
        />
      </Routes>
      <footer>
        <p>
          © {new Date().getFullYear()} Detský biblický tábor · ECAV Obišovce.
          Všetky práva vyhradené.
        </p>
      </footer>
    </AdminAuthProvider>
  );
}

export default App;
