import { useEffect, useRef, useState } from "react";
import { fetchJson } from "../../app/core";

const STORAGE_KEY = "admin-clock-timezone-v2";
const OFFSET_STORAGE_KEY = "admin-clock-offset-hours";
const TIME_ZONES = [
  "Europe/Berlin",
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Rome",
  "Europe/Madrid",
  "Europe/Zurich",
  "Europe/Vienna",
  "Europe/Warsaw",
  "Europe/Athens",
  "Europe/Istanbul",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney"
];

function availableTimeZones(): string[] {
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return [...new Set([...TIME_ZONES, browserZone].filter(Boolean))];
}

function parseOffset(value: string): number | null {
  if (value.trim() === "") return null;
  const hours = Number(value);
  return Number.isFinite(hours) && hours >= -24 && hours <= 24 ? hours : null;
}

export function AdminClockSection() {
  const [timeZones] = useState(availableTimeZones);
  const [timeZone, setTimeZone] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved && availableTimeZones().includes(saved) ? saved : "Europe/Berlin";
  });
  const [now, setNow] = useState<Date | null>(null);
  const [offsetHours, setOffsetHours] = useState(() => parseOffset(window.localStorage.getItem(OFFSET_STORAGE_KEY) ?? "") ?? 0);
  const [offsetInput, setOffsetInput] = useState(() => String(parseOffset(window.localStorage.getItem(OFFSET_STORAGE_KEY) ?? "") ?? 0));
  const [syncError, setSyncError] = useState(false);
  const serverClock = useRef<{ epoch: number; receivedAt: number } | null>(null);

  useEffect(() => {
    let active = true;

    async function syncServerTime() {
      try {
        const result = await fetchJson<{ serverTime: string }>("/api/admin/time", { cache: "no-store" });
        if (!active) return;
        const epoch = Date.parse(result.serverTime);
        if (!Number.isFinite(epoch)) throw new Error("Invalid server time");
        serverClock.current = { epoch, receivedAt: performance.now() };
        setNow(new Date(epoch));
        setSyncError(false);
      } catch {
        if (active) setSyncError(true);
      }
    }

    void syncServerTime();
    const timer = window.setInterval(() => {
      if (serverClock.current) {
        setNow(new Date(serverClock.current.epoch + performance.now() - serverClock.current.receivedAt));
      }
    }, 1000);
    const resyncTimer = window.setInterval(() => void syncServerTime(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(resyncTimer);
    };
  }, []);

  function selectTimeZone(value: string) {
    setTimeZone(value);
    window.localStorage.setItem(STORAGE_KEY, value);
  }

  function changeOffset(value: string) {
    setOffsetInput(value);
    const parsed = parseOffset(value);
    if (parsed !== null) {
      setOffsetHours(parsed);
      window.localStorage.setItem(OFFSET_STORAGE_KEY, String(parsed));
    }
  }

  const displayedTime = now ? new Date(now.getTime() + offsetHours * 60 * 60 * 1000) : null;

  return (
    <section className="panel admin-clock-section" aria-labelledby="admin-clock-heading">
      <h3 id="admin-clock-heading">Uhrzeit</h3>
      <label htmlFor="admin-clock-timezone">Zeitzone</label>
      <select id="admin-clock-timezone" value={timeZone} onChange={(event) => selectTimeZone(event.target.value)}>
        {timeZones.map((zone) => <option key={zone} value={zone}>{zone.replace(/_/g, " ")}</option>)}
      </select>
      <label htmlFor="admin-clock-offset">Manuelle Korrektur (Stunden)</label>
      <input id="admin-clock-offset" type="number" min="-24" max="24" step="0.25" value={offsetInput}
        onChange={(event) => changeOffset(event.target.value)}
        onBlur={() => setOffsetInput(String(offsetHours))} />
      <p>Zusätzlich zur Zeitzone: +2 stellt zwei Stunden vor, -2 zwei Stunden zurück.</p>
      {displayedTime ? (
        <>
          <time className="admin-clock-time" dateTime={displayedTime.toISOString()} aria-live="off">
            {new Intl.DateTimeFormat("de-DE", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(displayedTime)}
          </time>
          <p>{new Intl.DateTimeFormat("de-DE", { timeZone, weekday: "long", day: "2-digit", month: "long", year: "numeric" }).format(displayedTime)}</p>
        </>
      ) : <p>Serverzeit wird geladen …</p>}
      {syncError ? <p role="alert">Serverzeit kann gerade nicht aktualisiert werden.</p> : null}
    </section>
  );
}
