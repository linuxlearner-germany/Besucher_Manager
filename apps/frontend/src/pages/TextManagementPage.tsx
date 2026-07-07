import { AppLayout, useAuth } from "../app/core";
import { BadgeTextManager } from "../components/BadgeTextManager";

export function TextManagementPage() {
  useAuth();

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <BadgeTextManager
          heading="Hinweistexte"
          description=""
        />
      </main>
    </AppLayout>
  );
}
