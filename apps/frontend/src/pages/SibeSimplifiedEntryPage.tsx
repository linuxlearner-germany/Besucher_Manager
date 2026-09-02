import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { type ApiError, AppLayout, extractFieldErrors, fetchJson, type Gate, toDateInputValue } from "../app/core";
import { CountrySelect } from "../components/CountrySelect";
import { Alert, Card, FormField } from "../components/ui";

type SimplifiedEntryForm = {
  gateId: string;
  validFrom: string;
  validUntil: string;
  expectedArrivalTime: string;
  firstName: string;
  lastName: string;
  company: string;
  nationalityCode: string;
  birthDate: string;
  phone: string;
  email: string;
  visitorStreet: string;
  visitorHouseNumber: string;
  visitorPostalCode: string;
  visitorCity: string;
  idDocumentType: string;
  idDocumentValidUntil: string;
  idDocumentNumber: string;
  licensePlate: string;
  hostName: string;
  hostEmail: string;
  hostPhone: string;
  hostDepartment: string;
  purpose: string;
  notes: string;
};

function emptyForm(): SimplifiedEntryForm {
  const today = toDateInputValue(new Date());
  return {
    gateId: "", validFrom: today, validUntil: today, expectedArrivalTime: "",
    firstName: "", lastName: "", company: "", nationalityCode: "", birthDate: "",
    phone: "", email: "", visitorStreet: "", visitorHouseNumber: "",
    visitorPostalCode: "", visitorCity: "", idDocumentType: "",
    idDocumentValidUntil: "", idDocumentNumber: "", licensePlate: "",
    hostName: "", hostEmail: "", hostPhone: "", hostDepartment: "", purpose: "", notes: ""
  };
}

export function SibeSimplifiedEntryPage() {
  const [form, setForm] = useState<SimplifiedEntryForm>(() => emptyForm());
  const [gates, setGates] = useState<Gate[]>([]);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetchJson<{ gates: Gate[] }>("/api/public/gates", { method: "GET", headers: {} })
      .then((payload) => setGates(payload.gates))
      .catch((apiError: ApiError) => setError(apiError.message || "Die Wachen konnten nicht geladen werden."));
  }, []);

  function update<Key extends keyof SimplifiedEntryForm>(key: Key, value: SimplifiedEntryForm[Key]) {
    setForm((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => ({ ...current, [key]: "" }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    setFieldErrors({});

    try {
      const payload = await fetchJson<{ message: string }>("/api/sibe/visits/simplified", {
        method: "POST",
        body: JSON.stringify(form)
      });
      setForm(emptyForm());
      setMessage(payload.message);
    } catch (apiError) {
      const errorPayload = apiError as ApiError;
      setFieldErrors(extractFieldErrors(errorPayload));
      setError(errorPayload.message || "Der vereinfachte Besuch konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppLayout>
      <main className="page-panel page-shell-wide">
        <section className="page-hero">
          <div className="page-hero-content">
            <h2>Besucher vereinfacht erfassen</h2>
            <p>Wache, Gültigkeitszeitraum, Besucheridentität, Ansprechpartner und Besuchszweck sind erforderlich. Weitere Angaben können vor dem Check-in ergänzt werden.</p>
          </div>
        </section>

        {message ? <Alert type="success">{message}</Alert> : null}
        {error ? <Alert type="error">{error}</Alert> : null}

        <form onSubmit={submit} noValidate>
          <Card>
            <div className="section-header"><h3>Besuch</h3><span>* Pflichtfeld</span></div>
            <div className="form-grid two-columns">
              <FormField label="Wache" required error={fieldErrors.gateId}>
                <select required value={form.gateId} onChange={(event) => update("gateId", event.target.value)}>
                  <option value="">Bitte wählen</option>
                  {gates.map((gate) => <option key={gate.id} value={gate.id}>{gate.name}</option>)}
                </select>
              </FormField>
              <FormField label="Voraussichtliche Ankunftszeit" error={fieldErrors.expectedArrivalTime}>
                <input type="time" value={form.expectedArrivalTime} onChange={(event) => update("expectedArrivalTime", event.target.value)} />
              </FormField>
              <FormField label="Gültig von" required error={fieldErrors.validFrom}>
                <input required type="date" value={form.validFrom} onChange={(event) => update("validFrom", event.target.value)} />
              </FormField>
              <FormField label="Gültig bis" required error={fieldErrors.validUntil}>
                <input required type="date" value={form.validUntil} onChange={(event) => update("validUntil", event.target.value)} />
              </FormField>
              <FormField label="Ansprechpartner" required error={fieldErrors.hostName}>
                <input required maxLength={255} value={form.hostName} onChange={(event) => update("hostName", event.target.value)} />
              </FormField>
              <FormField label="Ansprechpartner Telefon" error={fieldErrors.hostPhone}>
                <input maxLength={80} value={form.hostPhone} onChange={(event) => update("hostPhone", event.target.value)} />
              </FormField>
              <FormField label="Ansprechpartner E-Mail" error={fieldErrors.hostEmail}>
                <input type="email" value={form.hostEmail} onChange={(event) => update("hostEmail", event.target.value)} />
              </FormField>
              <FormField label="Geschäftsfeld" error={fieldErrors.hostDepartment}>
                <input maxLength={255} value={form.hostDepartment} onChange={(event) => update("hostDepartment", event.target.value)} />
              </FormField>
              <FormField label="Besuchszweck" required error={fieldErrors.purpose}>
                <input required maxLength={500} value={form.purpose} onChange={(event) => update("purpose", event.target.value)} />
              </FormField>
              <FormField label="Kennzeichen" error={fieldErrors.licensePlate}>
                <input maxLength={40} value={form.licensePlate} onChange={(event) => update("licensePlate", event.target.value)} />
              </FormField>
              <div className="sibe-entry-full-width">
                <FormField label="Bemerkung" error={fieldErrors.notes}>
                  <textarea rows={3} maxLength={4000} value={form.notes} onChange={(event) => update("notes", event.target.value)} />
                </FormField>
              </div>
            </div>
          </Card>

          <Card>
            <div className="section-header"><h3>Besucheridentität</h3></div>
            <div className="form-grid two-columns">
              <FormField label="Vorname" required error={fieldErrors.firstName}>
                <input required maxLength={120} value={form.firstName} onChange={(event) => update("firstName", event.target.value)} />
              </FormField>
              <FormField label="Nachname" required error={fieldErrors.lastName}>
                <input required maxLength={120} value={form.lastName} onChange={(event) => update("lastName", event.target.value)} />
              </FormField>
              <FormField label="Firma / Organisation" required error={fieldErrors.company}>
                <input required maxLength={255} value={form.company} onChange={(event) => update("company", event.target.value)} />
              </FormField>
              <FormField label="Nationalität" error={fieldErrors.nationalityCode}>
                <CountrySelect value={form.nationalityCode} onChange={(value) => update("nationalityCode", value)} />
              </FormField>
              <FormField label="Geburtsdatum" error={fieldErrors.birthDate}>
                <input type="date" value={form.birthDate} onChange={(event) => update("birthDate", event.target.value)} />
              </FormField>
              <FormField label="Telefon" error={fieldErrors.phone}>
                <input maxLength={80} value={form.phone} onChange={(event) => update("phone", event.target.value)} />
              </FormField>
              <FormField label="E-Mail" error={fieldErrors.email}>
                <input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} />
              </FormField>
              <FormField label="Straße" error={fieldErrors.visitorStreet}>
                <input maxLength={255} value={form.visitorStreet} onChange={(event) => update("visitorStreet", event.target.value)} />
              </FormField>
              <FormField label="Hausnummer" error={fieldErrors.visitorHouseNumber}>
                <input maxLength={40} value={form.visitorHouseNumber} onChange={(event) => update("visitorHouseNumber", event.target.value)} />
              </FormField>
              <FormField label="Postleitzahl" error={fieldErrors.visitorPostalCode}>
                <input maxLength={20} value={form.visitorPostalCode} onChange={(event) => update("visitorPostalCode", event.target.value)} />
              </FormField>
              <FormField label="Ort" error={fieldErrors.visitorCity}>
                <input maxLength={120} value={form.visitorCity} onChange={(event) => update("visitorCity", event.target.value)} />
              </FormField>
              <FormField label="Ausweisart" error={fieldErrors.idDocumentType}>
                <select value={form.idDocumentType} onChange={(event) => update("idDocumentType", event.target.value)}>
                  <option value="">Keine Angabe</option>
                  <option value="identity_card">Personalausweis</option>
                  <option value="passport">Reisepass</option>
                  <option value="service_id">Dienstausweis</option>
                  <option value="other">Sonstiges</option>
                </select>
              </FormField>
              <FormField label="Ausweis gültig bis" error={fieldErrors.idDocumentValidUntil}>
                <input type="date" value={form.idDocumentValidUntil} onChange={(event) => update("idDocumentValidUntil", event.target.value)} />
              </FormField>
              <FormField label="Ausweisnummer" error={fieldErrors.idDocumentNumber}>
                <input maxLength={120} value={form.idDocumentNumber} onChange={(event) => update("idDocumentNumber", event.target.value)} />
              </FormField>
            </div>
          </Card>

          <div className="action-bar">
            <Link className="secondary-button button-link" to="/sibe/besucher">Abbrechen</Link>
            <button type="submit" disabled={saving}>{saving ? "Speichert …" : "Besuch speichern"}</button>
          </div>
        </form>
      </main>
    </AppLayout>
  );
}
