import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BadgeTextManager } from "./BadgeTextManager";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("BadgeTextManager loading state", () => {
  it("does not present zero counts or an empty state before texts have loaded", async () => {
    let resolveRequest!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    })));

    render(<BadgeTextManager />);

    expect(screen.getAllByText("Texte werden geladen …").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Alle (—)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alle (0)" })).not.toBeInTheDocument();
    expect(screen.queryByText("Keine Hinweistexte für die aktuelle Auswahl gefunden.")).not.toBeInTheDocument();

    const texts = Array.from({ length: 4 }, (_, index) => ({
      id: `text-${index}`,
      name: `text-${index}`,
      textType: "security_notice",
      sectionType: "security_notice",
      sectionLabel: "Sicherheitshinweise",
      heading: `Hinweis ${index + 1}`,
      customHeading: null,
      content: `Inhalt ${index + 1}`,
      isActive: true,
      sortOrder: index
    }));

    await act(async () => {
      resolveRequest(new Response(JSON.stringify({ texts }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }));
    });

    expect(await screen.findByRole("button", { name: "Alle (4)" })).toBeInTheDocument();
    expect(screen.getAllByText("Hinweis 1").length).toBeGreaterThan(0);
    expect(screen.queryByText("Texte werden geladen …")).not.toBeInTheDocument();
  });
});
