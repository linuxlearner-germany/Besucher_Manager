import { useState, type FormEvent } from "react";
import { AppLayout, type ApiError, fetchJson, useAuth } from "../app/core";
import { Alert, Card, FormField, HeaderTitle } from "../components/ui";

export function SettingsPage() {
  const { user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Die Passwortbestätigung stimmt nicht überein.");
      return;
    }

    setSaving(true);
    try {
      await fetchJson<{ success: true }>("/api/auth/password", {
        method: "PUT",
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Passwort wurde erfolgreich geändert.");
    } catch (apiError) {
      const payload = apiError as ApiError;
      setError(payload.message || "Das Passwort konnte nicht geändert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <main className="page-stack">
        <HeaderTitle title="Einstellungen" subtitle={`Angemeldet als ${user?.username || "-"}`} />
        <Card className="settings-card">
          <h3>Passwort ändern</h3>
          <p className="section-copy">Verwenden Sie mindestens 8 Zeichen und bestätigen Sie das neue Passwort.</p>
          {message ? <Alert type="success">{message}</Alert> : null}
          {error ? <Alert type="error">{error}</Alert> : null}
          <form className="form-grid" onSubmit={submit}>
            <FormField label="Aktuelles Passwort" required>
              <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required />
            </FormField>
            <FormField label="Neues Passwort" required>
              <input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required />
            </FormField>
            <FormField label="Neues Passwort bestätigen" required>
              <input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} maxLength={128} autoComplete="new-password" required />
            </FormField>
            <div className="row-actions">
              <button type="submit" disabled={saving}>{saving ? "Wird gespeichert ..." : "Passwort ändern"}</button>
            </div>
          </form>
        </Card>
      </main>
    </AppLayout>
  );
}
