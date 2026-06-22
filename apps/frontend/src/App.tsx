import { type ChangeEvent, type DragEvent, type FormEvent, type PropsWithChildren } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { GuardDashboardPage } from "./pages/GuardDashboardPage";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { PrintViewPage } from "./pages/PrintViewPage";
import { PublicPreRegistrationPage } from "./pages/PublicPreRegistrationPage";
import { SibeDashboardPage } from "./pages/SibeDashboardPage";
import { SibeUsersPage } from "./pages/SibeUsersPage";
import { SibeVisitDetailPage } from "./pages/SibeVisitDetailPage";
import { SibeVisitorsPage } from "./pages/SibeVisitorsPage";
import { TextManagementPage } from "./pages/TextManagementPage";
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
          <RequireRoles allowedRoles={["admin", "guard"]} requiredMenuKey="wache" redirectTo="/">
            <GuardDashboardPage />
          </RequireRoles>
        }
      />
      <Route
        path="/wache/besuche/:id/druck"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} requiredMenuKey="wache" redirectTo="/" >
            <PrintViewPage />
          </RequireRoles>
        }
      />
      <Route
        path="/wache/besuche/:id"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} requiredMenuKey="wache" redirectTo="/" >
            <VisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} requiredMenuKey="sibe" redirectTo="/" >
            <SibeDashboardPage />
          </RequireRoles>
        }
      />
      <Route
        path="/kaskdt"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="kaskdt" redirectTo="/" >
            <SibeDashboardPage />
          </RequireRoles>
        }
      />
      <Route
        path="/kaskdt/texte"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="texte" redirectTo="/" >
            <TextManagementPage />
          </RequireRoles>
        }
      />
      <Route
        path="/import"
        element={<ImportPage />}
      />
      <Route
        path="/sibe/besucher"
        element={
          <RequireRoles allowedRoles={["admin", "sibe", "kaskdt"]} requiredMenuKey="sibe" redirectTo="/" >
            <SibeVisitorsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/besucher/:id"
        element={
          <RequireRoles allowedRoles={["admin", "sibe", "kaskdt"]} requiredMenuKey="sibe" redirectTo="/" >
            <SibeVisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/benutzer"
        element={
          <RequireRoles allowedRoles={["admin", "sibe", "kaskdt"]} requiredMenuKey="sibe" redirectTo="/" >
            <SibeUsersPage />
          </RequireRoles>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireRoles allowedRoles={["admin"]} requiredMenuKey="admin" redirectTo="/" >
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
