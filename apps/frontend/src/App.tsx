import { type ChangeEvent, type DragEvent, type FormEvent, type PropsWithChildren, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { GuardDashboardPage } from "./pages/GuardDashboardPage";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { PrintViewPage } from "./pages/PrintViewPage";
import { PublicPreRegistrationPage } from "./pages/PublicPreRegistrationPage";
import { CommanderDashboardPage } from "./pages/CommanderDashboardPage";
import { CommanderSimplifiedVisitsPage } from "./pages/CommanderSimplifiedVisitsPage";
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
import { PublicPreRegistrationConfirmationPage } from "./pages/PublicPreRegistrationConfirmationPage";
import { PublicSimplifiedApplicationPage } from "./pages/PublicSimplifiedApplicationPage";
import { PublicSimplifiedVerificationPage } from "./pages/PublicSimplifiedVerificationPage";
import { KaskdtApplicationsPage } from "./pages/KaskdtApplicationsPage";
import { KaskdtApplicationDetailPage } from "./pages/KaskdtApplicationDetailPage";
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
  hasRole,
  RoleAwareRootRoute,
  type VisitRow,
  RequireRoles
} from "./app/core";

function MaintenanceBoundary({ children }: PropsWithChildren) {
  const { user } = useAuth();
  const location = useLocation();
  const [maintenance, setMaintenance] = useState(false);
  useEffect(() => {
    void fetchJson<{ maintenanceMode: boolean }>("/api/maintenance/status").then((payload) => setMaintenance(payload.maintenanceMode)).catch(() => undefined);
  }, [user]);
  if (maintenance && !hasRole(user, "admin") && location.pathname !== "/login") {
    return <main className="public-page"><section className="public-card"><h1>Wartungsarbeiten</h1><p>Das Besuchermanagement ist derzeit wegen Wartungsarbeiten vorübergehend nicht verfügbar. Bitte versuchen Sie es später erneut.</p><a href="/login">Admin-Anmeldung</a></section></main>;
  }
  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RoleAwareRootRoute><PublicPreRegistrationPage /></RoleAwareRootRoute>} />
      <Route path="/voranmeldung" element={<PublicPreRegistrationPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/visit/confirmation" element={<PublicPreRegistrationConfirmationPage />} />
      <Route path="/visit/simplified/application" element={<PublicSimplifiedApplicationPage />} />
      <Route path="/visit/simplified/verify" element={<PublicSimplifiedVerificationPage />} />
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
      <Route path="/kaskdt/antraege" element={<RequireRoles allowedRoles={["kaskdt"]} redirectTo="/"><KaskdtApplicationsPage /></RequireRoles>} />
      <Route path="/kaskdt/antraege/:id" element={<RequireRoles allowedRoles={["kaskdt"]} redirectTo="/"><KaskdtApplicationDetailPage /></RequireRoles>} />
      <Route
        path="/kasernenkommandant"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="kaskdt" requiredPermissions={["dashboards.commander"]} redirectTo="/" >
            <CommanderDashboardPage />
          </RequireRoles>
        }
      />
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
        element={
          <RequireRoles
            allowedRoles={["admin", "guard", "sibe", "kaskdt", "custom"]}
            requiredMenuKey="import"
            requiredPermissions={["imports.execute"]}
            redirectTo="/"
          >
            <ImportPage />
          </RequireRoles>
        }
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
            <CommanderSimplifiedVisitsPage />
          </RequireRoles>
        }
      />
      <Route
        path="/kasernenkommandant/besucher"
        element={
          <RequireRoles allowedRoles={["admin", "kaskdt"]} requiredMenuKey="kaskdt" requiredPermissions={["visits.read"]} redirectTo="/" >
            <CommanderSimplifiedVisitsPage />
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
        <MaintenanceBoundary><AppRoutes /></MaintenanceBoundary>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
