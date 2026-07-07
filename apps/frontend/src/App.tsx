import { type ChangeEvent, type DragEvent, type FormEvent, type PropsWithChildren } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AdminPage } from "./pages/AdminPage";
import { ApprovalQueuePage } from "./pages/ApprovalQueuePage";
import { GuardDashboardPage } from "./pages/GuardDashboardPage";
import { ImportPage } from "./pages/ImportPage";
import { LoginPage } from "./pages/LoginPage";
import { PrintViewPage } from "./pages/PrintViewPage";
import { PublicPreRegistrationPage } from "./pages/PublicPreRegistrationPage";
import { CommanderDashboardPage } from "./pages/CommanderDashboardPage";
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
        path="/genehmigungen"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} requiredMenuKey="genehmigung" requiredPermissions={["approvals.read"]} redirectTo="/" >
            <ApprovalQueuePage />
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
      <Route
        path="/texte"
        element={
          <RequireRoles allowedRoles={["admin"]} requiredMenuKey="texte" requiredPermissions={["admin.texts"]} redirectTo="/" >
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
        path="/sibe/besucher/:id"
        element={
          <RequireRoles allowedRoles={["admin", "sibe"]} requiredMenuKeys={["sibe", "genehmigung"]} requiredPermissions={["visits.read"]} redirectTo="/" >
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
