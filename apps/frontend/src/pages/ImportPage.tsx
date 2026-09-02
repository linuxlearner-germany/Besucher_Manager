import { AppLayout } from "../app/core";
import { NormalVisitorImportSection } from "../components/import/NormalVisitorImportSection";

export function ImportPage() {
  return (
    <AppLayout>
      <main className="page-panel page-shell-wide">
        <NormalVisitorImportSection />
      </main>
    </AppLayout>
  );
}
