import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FormField } from "./ui";

describe("FormField", () => {
  it("exposes required labels and validation feedback", () => {
    render(<FormField label="Firma" required error="Dieses Feld ist erforderlich."><input /></FormField>);

    expect(screen.getByText("Firma")).toBeInTheDocument();
    expect(screen.getByText("Dieses Feld ist erforderlich.")).toBeInTheDocument();
  });
});
