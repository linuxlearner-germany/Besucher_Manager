import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Card } from "../components/ui";
import { AppLayout, type ApiError, fetchJson, useAuth, type User } from "../app/core";

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate(user.role === "admin" ? "/admin" : user.role === "sibe" ? "/sibe" : "/wache", { replace: true });
    }
  }, [navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = await fetchJson<{ user: User; redirectTo?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      setUser(payload.user);
      navigate((location.state as { from?: string } | null)?.from || payload.redirectTo || (payload.user.role === "admin" ? "/admin" : payload.user.role === "sibe" ? "/sibe" : "/wache"), { replace: true });
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Benutzername oder Passwort ist falsch.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <main className="login-shell">
        <section className="login-grid">
          <Card className="login-panel">
            <div className="section-header">
              <div>
                <h2>Anmeldung</h2>
                <p className="section-copy">Melden Sie sich fuer Wache, SiBe oder Administration an.</p>
              </div>
            </div>

            <form className="pre-registration-form" onSubmit={handleSubmit}>
              <label>
                Benutzername
                <input value={username} onChange={(event) => setUsername(event.target.value)} />
              </label>
              <label>
                Passwort
                <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
              </label>
              <div className="form-actions">
                <button type="submit" disabled={submitting}>
                  {submitting ? "Prueft..." : "Anmelden"}
                </button>
              </div>
              {error ? <Alert type="error">{error}</Alert> : null}
            </form>
          </Card>

          <Card className="login-side-card">
            <h3>Zugriffsbereiche</h3>
            <div className="login-role-grid">
              <div className="login-role-card">
                <strong>Wache</strong>
                <span>Tagesliste, Check-in, Check-out, Druck</span>
              </div>
              <div className="login-role-card">
                <strong>SiBe</strong>
                <span>Auswertung, Besucherhistorie, Audit</span>
              </div>
              <div className="login-role-card">
                <strong>Admin</strong>
                <span>Wachen, Benutzer, Felder, Systemstatus</span>
              </div>
            </div>
          </Card>
        </section>
      </main>
    </AppLayout>
  );
}
