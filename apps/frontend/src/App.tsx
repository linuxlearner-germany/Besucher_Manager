import { type ChangeEvent, type DragEvent, type FormEvent, type PropsWithChildren } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { GuardDashboardPage } from "./pages/GuardDashboardPage";
import { LoginPage } from "./pages/LoginPage";
import { PrintViewPage } from "./pages/PrintViewPage";
import { PublicPreRegistrationPage } from "./pages/PublicPreRegistrationPage";
import { SibeDashboardPage } from "./pages/SibeDashboardPage";
import { SibeUsersPage } from "./pages/SibeUsersPage";
import { SibeVisitDetailPage } from "./pages/SibeVisitDetailPage";
import { SibeVisitorsPage } from "./pages/SibeVisitorsPage";
import { VisitDetailPage } from "./pages/VisitDetailPage";
import {
  AuthProvider,
  buildCheckoutStateFromVisit,
  buildGuardVisitEditState,
  fetchJson,
  formatDateOnly,
  formatDateTime,
  formatSignatureStatus,
  formatStatus,
  getNextStepHint,
  type GuardVisitEditState,
  ThemeProvider,
  useAuth,
  type VisitRow,
  RequireRoles
} from "./app/core";

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<PublicPreRegistrationPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/wache"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} redirectTo="/">
            <GuardDashboardPage />
          </RequireRoles>
        }
      />
      <Route
        path="/wache/besuche/:id/druck"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} redirectTo="/" >
            <PrintViewPage />
          </RequireRoles>
        }
      />
      <Route
        path="/wache/besuche/:id"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} redirectTo="/" >
            <VisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} redirectTo="/" >
            <SibeDashboardPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/besucher"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} redirectTo="/" >
            <SibeVisitorsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/besucher/:id"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} redirectTo="/" >
            <SibeVisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/benutzer"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} redirectTo="/" >
            <SibeUsersPage />
          </RequireRoles>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireRoles allowedRoles={["admin"]} redirectTo="/" >
            <AdminPage />
          </RequireRoles>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
