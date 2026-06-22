import { AppLayout, useAuth } from "../app/core";
import { Card } from "../components/ui";
import { BadgeTextManager } from "../components/BadgeTextManager";

export function TextManagementPage() {
  const { user } = useAuth();

  return (
    <AppLayout>
      <main className="panel page-panel page-shell-wide">
        <Card>
          <BadgeTextManager
            heading={user?.role === "kaskdt" ? "KasKdt Texte" : "Texte"}
            description=""
          />
        </Card>
      </main>
    </AppLayout>
  );
}
