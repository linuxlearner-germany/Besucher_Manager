import { type ChangeEvent, type DragEvent, type FormEvent, type PropsWithChildren } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { GuardDashboardPage } from "./pages/GuardDashboardPage";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { PrintViewPage } from "./pages/PrintViewPage";
import { PublicPreRegistrationPage } from "./pages/PublicPreRegistrationPage";
import { CommanderDashboardPage } from "./pages/CommanderDashboardPage";
import { SibeDashboardPage } from "./pages/SibeDashboardPage";
import { SibeNationalityNotificationsPage } from "./pages/SibeNationalityNotificationsPage";
import { SibeRejectionsPage } from "./pages/SibeRejectionsPage";
import { SibeSimplifiedEntryPage } from "./pages/SibeSimplifiedEntryPage";
import { SibeUsersPage } from "./pages/SibeUsersPage";
import { SibeVisitDetailPage } from "./pages/SibeVisitDetailPage";
import { SibeVisitorsPage } from "./pages/SibeVisitorsPage";
import { TextManagementPage } from "./pages/TextManagementPage";
import { VisitDetailPage } from "./pages/VisitDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { PublicSimplifiedRegistrationPage } from "./pages/PublicSimplifiedRegistrationPage";
import { GuardSimplifiedVisitorsPage } from "./pages/GuardSimplifiedVisitorsPage";
import { CommanderSimplifiedRegistrationsPage } from "./pages/CommanderSimplifiedRegistrationsPage";
import { BarracksAreasAdminPage } from "./pages/BarracksAreasAdminPage";
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
      <Route path="/vereinfachte-besucheranmeldung" element={<PublicSimplifiedRegistrationPage />} />
      <Route path="/vereinfachte-besucheranmeldung/status" element={<PublicSimplifiedRegistrationPage statusOnly />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/einstellungen"
        element={
          <RequireRoles allowedRoles={["admin", "guard", "sibe", "kaskdt", "custom"]} redirectTo="/login">
            <SettingsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/wache"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} requiredMenuKey="wache" requiredPermissions={["visits.read"]} redirectTo="/">
            <GuardDashboardPage />
          </RequireRoles>
        }
      />
      <Route path="/wache/vereinfachte-besucher" element={<RequireRoles allowedRoles={["guard", "custom"]} requiredMenuKey="vereinfachte_besucher" requiredPermissions={["simplifiedRegistrations.guardView"]} redirectTo="/"><GuardSimplifiedVisitorsPage /></RequireRoles>} />
      <Route
        path="/wache/besuche/:id/druck"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} requiredMenuKey="wache" requiredPermissions={["visits.printBadge"]} redirectTo="/" >
            <PrintViewPage />
          </RequireRoles>
        }
      />
      <Route
        path="/wache/besuche/:id"
        element={
          <RequireRoles allowedRoles={["admin", "guard"]} requiredMenuKey="wache" requiredPermissions={["visits.read"]} redirectTo="/" >
            <VisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} requiredMenuKey="sibe" requiredPermissions={["dashboards.sibe"]} redirectTo="/" >
            <SibeDashboardPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/benachrichtigungen"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} requiredMenuKey="laenderbenachrichtigungen" requiredPermissions={["dashboards.sibe"]} redirectTo="/" >
            <SibeNationalityNotificationsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/ablehnungen"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} requiredMenuKey="sibe" requiredPermissions={["visits.read"]} redirectTo="/" >
            <SibeRejectionsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/kaskdt"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="kaskdt" requiredPermissions={["dashboards.commander"]} redirectTo="/" >
            <CommanderDashboardPage />
          </RequireRoles>
        }
      />
      <Route
        path="/kasernenkommandant"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="kaskdt" requiredPermissions={["dashboards.commander"]} redirectTo="/" >
            <CommanderDashboardPage />
          </RequireRoles>
        }
      />
      <Route path="/kaskdt/vereinfachte-anmeldungen" element={<RequireRoles allowedRoles={["kaskdt", "custom"]} requiredMenuKey="vereinfachte_genehmigungen" requiredPermissions={["simplifiedRegistrations.review"]} redirectTo="/"><CommanderSimplifiedRegistrationsPage /></RequireRoles>} />
      <Route path="/admin/kasernenbereiche" element={<RequireRoles allowedRoles={["admin", "custom"]} requiredMenuKey="admin" requiredPermissions={["admin.guards"]} redirectTo="/"><BarracksAreasAdminPage /></RequireRoles>} />
      <Route
        path="/texte"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="texte" requiredPermissions={["texts.manage"]} redirectTo="/" >
            <TextManagementPage />
          </RequireRoles>
        }
      />
      <Route path="/kaskdt/texte" element={<Navigate to="/texte" replace />} />
      <Route
        path="/import"
        element={<ImportPage />}
      />
      <Route
        path="/sibe/besucher"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} requiredMenuKey="sibe" requiredPermissions={["visits.read"]} redirectTo="/" >
            <SibeVisitorsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/besucher/vereinfacht"
        element={
          <RequireRoles allowedRoles={["sibe"]} redirectTo="/" >
            <SibeSimplifiedEntryPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/besucher/:id"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} requiredMenuKey="sibe" requiredPermissions={["visits.read"]} redirectTo="/" >
            <SibeVisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/kaskdt/besucher"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="kaskdt" requiredPermissions={["visits.read"]} redirectTo="/" >
            <SibeVisitorsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/kasernenkommandant/besucher"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="kaskdt" requiredPermissions={["visits.read"]} redirectTo="/" >
            <SibeVisitorsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/kaskdt/besucher/:id"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="kaskdt" requiredPermissions={["visits.read"]} redirectTo="/" >
            <SibeVisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/kasernenkommandant/besucher/:id"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="kaskdt" requiredPermissions={["visits.read"]} redirectTo="/" >
            <SibeVisitDetailPage />
          </RequireRoles>
        }
      />
      <Route
        path="/sibe/benutzer"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} requiredMenuKey="sibe" redirectTo="/" >
            <SibeUsersPage />
          </RequireRoles>
        }
      />
      <Route
        path="/admin"
        element={
          <RequireRoles allowedRoles={["admin"]} requiredMenuKey="admin" requiredPermissions={["admin.users", "admin.guards", "admin.fields", "admin.map", "admin.system", "logs.audit", "logs.errors"]} redirectTo="/" >
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
