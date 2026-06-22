import { useEffect, useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Alert, Card } from "../components/ui";
import { AppLayout, type ApiError, fetchJson, getDefaultRouteForUser, useAuth, type Gate, type User } from "../app/core";

type LoginResponse =
  | { user: User; redirectTo?: string; requiresGateSelection?: false }
  | { requiresGateSelection: true; gates: Gate[] };

export function LoginPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pendingLogin, setPendingLogin] = useState<{ username: string; password: string } | null>(null);
  const [availableGates, setAvailableGates] = useState<Gate[]>([]);
  const [selectedGateId, setSelectedGateId] = useState("");

  useEffect(() => {
    if (user) {
      navigate(getDefaultRouteForUser(user), { replace: true });
    }
  }, [navigate, user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const payload = await fetchJson<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      if ("requiresGateSelection" in payload && payload.requiresGateSelection) {
        setPendingLogin({ username, password });
        setAvailableGates(payload.gates);
        setSelectedGateId(payload.gates[0]?.id || "");
        return;
      }

      setUser(payload.user);
      navigate((location.state as { from?: string } | null)?.from || payload.redirectTo || getDefaultRouteForUser(payload.user), { replace: true });
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Benutzername oder Passwort ist falsch.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGateSelection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pendingLogin || !selectedGateId) {
      setError("Bitte waehlen Sie eine Wache aus.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = await fetchJson<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: pendingLogin.username,
          password: pendingLogin.password,
          gateId: selectedGateId
        })
      });

      if ("requiresGateSelection" in payload && payload.requiresGateSelection) {
        setAvailableGates(payload.gates);
        setSelectedGateId(payload.gates[0]?.id || "");
        setError("Die Wache muss erneut ausgewaehlt werden.");
        return;
      }

      setUser(payload.user);
      setPendingLogin(null);
      setAvailableGates([]);
      setSelectedGateId("");
      navigate((location.state as { from?: string } | null)?.from || payload.redirectTo || getDefaultRouteForUser(payload.user), { replace: true });
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setError(errorPayload.message || "Die Wache konnte nicht gesetzt werden.");
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
                <h2>{pendingLogin ? "Wache auswaehlen" : "Anmeldung"}</h2>
                <p className="section-copy">
                  {pendingLogin
                    ? "Waehlen Sie den aktiven Standort fuer diese Anmeldung."
                    : "Melden Sie sich für Wache, SiBe, KasKdt oder Administration an."}
                </p>
              </div>
            </div>

            {pendingLogin ? (
              <form className="pre-registration-form" onSubmit={handleGateSelection}>
                <label>
                  Aktive Wache
                  <select value={selectedGateId} onChange={(event) => setSelectedGateId(event.target.value)}>
                    {availableGates.map((gate) => (
                      <option key={gate.id} value={gate.id}>
                        {gate.name}{gate.location ? ` - ${gate.location}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="form-actions">
                  <button type="submit" disabled={submitting || !selectedGateId}>
                    {submitting ? "Setzt..." : "Weiter"}
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => {
                      setPendingLogin(null);
                      setAvailableGates([]);
                      setSelectedGateId("");
                      setError(null);
                    }}
                  >
                    Zurueck
                  </button>
                </div>
                {error ? <Alert type="error">{error}</Alert> : null}
              </form>
            ) : (
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
            )}
          </Card>
        </section>
      </main>
    </AppLayout>
  );
}
