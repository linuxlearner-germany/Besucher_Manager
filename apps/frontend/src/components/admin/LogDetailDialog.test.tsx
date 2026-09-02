import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AdminLogDetail } from "../../app/core";
import { LogDetailDialog } from "./LogDetailDialog";

afterEach(cleanup);

function detail(overrides: Partial<AdminLogDetail> = {}): AdminLogDetail {
  return {
    kind: "audit", id: "audit-1", timestamp: "2026-08-14T08:00:00.000",
    username: "admin", userId: "user-1", roles: ["admin"], action: "USER_LOGIN_SUCCEEDED",
    category: "user", result: "success", requestId: "request-1", httpMethod: "POST",
    endpoint: "/api/auth/login", httpStatus: 200, errorCode: null, errorMessage: null,
    source: "authentication", entityType: "user", entityId: "user-1", ipAddress: "127.0.0.1",
    userAgent: "test-agent", metadata: { nested: { value: true }, password: "[REDACTED]" },
    technicalContext: null, ...overrides
  };
}

describe("LogDetailDialog", () => {
  it("renders complete audit details and pretty printed redacted metadata", () => {
    const { container } = render(<LogDetailDialog selectedId="audit-1" detail={detail()} loading={false} error={null} onClose={() => undefined} />);
    expect(screen.getByText("USER_LOGIN_SUCCEEDED")).toBeInTheDocument();
    expect(screen.getByText("/api/auth/login")).toBeInTheDocument();
    expect(screen.getByText("request-1")).toBeInTheDocument();
    const metadata = container.querySelector(".log-json-view")?.textContent || "";
    expect(metadata).toContain('\n  "nested": {');
    expect(metadata).toContain('"password": "[REDACTED]"');
  });

  it("shows loading without stale details and then updates to another log", () => {
    const { rerender } = render(<LogDetailDialog selectedId="audit-1" detail={detail()} loading={false} error={null} onClose={() => undefined} />);
    rerender(<LogDetailDialog selectedId="error-2" detail={null} loading error={null} onClose={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("werden geladen");
    expect(screen.queryByText("USER_LOGIN_SUCCEEDED")).not.toBeInTheDocument();
    rerender(<LogDetailDialog selectedId="error-2" detail={detail({ kind: "error", id: "error-2", username: null, roles: [], action: "DATABASE_ERROR", result: "failure", metadata: null })} loading={false} error={null} onClose={() => undefined} />);
    expect(screen.getByText("DATABASE_ERROR")).toBeInTheDocument();
    expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  });

  it("closes by button, backdrop, and Escape and can be reopened", () => {
    const onClose = vi.fn();
    const { container, rerender } = render(<LogDetailDialog selectedId="audit-1" detail={detail()} loading={false} error={null} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    fireEvent.click(container.querySelector(".modal-backdrop") as HTMLElement);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    rerender(<LogDetailDialog selectedId={null} detail={null} loading={false} error={null} onClose={onClose} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    rerender(<LogDetailDialog selectedId="audit-1" detail={detail()} loading={false} error={null} onClose={onClose} />);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a concrete API error with its request reference", () => {
    render(<LogDetailDialog selectedId="missing" detail={null} loading={false} error="Log-Details konnten nicht geladen werden. Referenz: req-42" onClose={() => undefined} />);
    expect(screen.getByText(/Referenz: req-42/)).toBeInTheDocument();
  });
});
