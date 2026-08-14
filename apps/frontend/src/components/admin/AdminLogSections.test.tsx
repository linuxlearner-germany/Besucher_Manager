import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { type AdminAuditLog, type AdminLogDetail } from "../../app/core";
import { AdminAuditSection } from "./AdminSections";

const logs: AdminAuditLog[] = [
  { id: "audit-1", user: "guard", action: "GUARD_WALK_IN_CREATED", objectType: "visit", objectId: "visit-1", ipAddress: null, userAgent: null, timestamp: "2026-08-14T08:00:00" },
  { id: "audit-2", user: "admin", action: "MAINTENANCE_MODE_UPDATED", objectType: "setting", objectId: "maintenance", ipAddress: null, userAgent: null, timestamp: "2026-08-14T09:00:00" }
];

function makeDetail(id: string): AdminLogDetail {
  const log = logs.find((entry) => entry.id === id)!;
  return { kind: "audit", id, timestamp: log.timestamp, username: log.user, userId: null, roles: [], action: log.action,
    category: log.objectType, result: "success", requestId: null, httpMethod: null, endpoint: null, httpStatus: null,
    errorCode: null, errorMessage: null, source: null, entityType: log.objectType, entityId: log.objectId,
    ipAddress: null, userAgent: null, metadata: null, technicalContext: null };
}

function Harness() {
  const [filters, setFilters] = useState({ search: "", action: "", user: "", ip: "", from: "", to: "" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return <AdminAuditSection auditFilters={filters} setAuditFilters={setFilters} applyAuditFilters={async () => undefined}
    resetAuditFilters={async () => undefined} logs={logs} selectedAuditLogId={selectedId}
    selectedAuditLog={selectedId ? makeDetail(selectedId) : null} detailLoading={false} detailError={null}
    openAuditLog={setSelectedId} closeAuditLog={() => setSelectedId(null)} />;
}

describe("AdminAuditSection details", () => {
  it("opens rows successively, closes them, and preserves filter input", () => {
    render(<Harness />);
    const search = screen.getByPlaceholderText("Benutzer, Aktion oder Objekt");
    fireEvent.change(search, { target: { value: "Spontananmeldung" } });
    fireEvent.click(screen.getByText("GUARD_WALK_IN_CREATED"));
    expect(screen.getByText("Eintrag audit-1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schließen" }));
    expect(search).toHaveValue("Spontananmeldung");
    fireEvent.click(screen.getByText("MAINTENANCE_MODE_UPDATED"));
    expect(screen.getByText("Eintrag audit-2")).toBeInTheDocument();
    expect(screen.queryByText("Eintrag audit-1")).not.toBeInTheDocument();
  });
});
