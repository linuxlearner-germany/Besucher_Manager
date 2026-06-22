import { AppLayout, useAuth } from "../app/core";
import { BadgeTextManager } from "../components/BadgeTextManager";

export function TextManagementPage() {
  const { user } = useAuth();

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <BadgeTextManager
          heading={user?.role === "kaskdt" ? "KasKdt Texte" : "Texte"}
          description=""
        />
      </main>
    </AppLayout>
  );
}
