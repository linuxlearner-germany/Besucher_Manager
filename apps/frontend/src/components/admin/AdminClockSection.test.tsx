import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminClockSection } from "./AdminClockSection";

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2030-01-01T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Admin clock", () => {
  it("uses server UTC time, defaults to Berlin summer time and remembers another zone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ serverTime: "2026-09-29T12:34:56.000Z" }), { status: 200 })));
    window.localStorage.setItem("admin-clock-timezone", "UTC");
    render(<AdminClockSection />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByLabelText("Zeitzone")).toHaveValue("Europe/Berlin");
    expect(screen.getByRole("option", { name: "Europe/Berlin" })).toHaveProperty("index", 0);
    expect(screen.getByText("14:34:56")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("14:34:57")).toBeInTheDocument();
    const offset = screen.getByLabelText("Manuelle Korrektur (Stunden)");
    expect(offset).toHaveValue(0);
    fireEvent.change(offset, { target: { value: "2" } });
    expect(screen.getByText("16:34:57")).toBeInTheDocument();
    expect(window.localStorage.getItem("admin-clock-offset-hours")).toBe("2");
    fireEvent.change(offset, { target: { value: "-2" } });
    expect(screen.getByText("12:34:57")).toBeInTheDocument();
    expect(window.localStorage.getItem("admin-clock-offset-hours")).toBe("-2");
    fireEvent.change(screen.getByLabelText("Zeitzone"), { target: { value: "UTC" } });
    expect(screen.getByText("10:34:57")).toBeInTheDocument();
    expect(window.localStorage.getItem("admin-clock-timezone-v2")).toBe("UTC");
  });

  it("uses Berlin winter time with a one-hour offset", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ serverTime: "2026-01-29T12:34:56.000Z" }), { status: 200 })));
    render(<AdminClockSection />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText("13:34:56")).toBeInTheDocument();
  });
});
