import { Routes, Route, Navigate } from "react-router-dom";
import RegistrationLandingPage from "./pages/RegistrationLandingPage";
import RegistrationFormPage from "./pages/RegistrationFormPage";
import RegistrationSummaryPage from "./pages/RegistrationSummaryPage";
import RegistrationUpdatePage from "./pages/RegistrationUpdatePage";
import AdminLoginPage from "./pages/AdminLoginPage";
import AdminPage from "./pages/AdminPage";
import AttendeeTablePage from "./pages/AttendeeTablePage";
import PaymentInfoPage from "./pages/PaymentInfoPage";
import { RegistrationProvider } from "./context/RegistrationContext";
import { AdminAuthProvider, useAdminAuth } from "./context/AdminAuthContext";
import { CONTACT_EMAIL, CONTACT_PHONE, CONTACT_PHONE_HREF } from "./eventInfo";

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
          path="/admin/attendees"
          element={
            <AdminRoute>
              <AttendeeTablePage />
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
          © {new Date().getFullYear()} Evanjelizačné stredisko (EVS) ·{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> ·{" "}
          <a href={`tel:${CONTACT_PHONE_HREF}`}>{CONTACT_PHONE}</a>
        </p>
      </footer>
    </AdminAuthProvider>
  );
}

export default App;
