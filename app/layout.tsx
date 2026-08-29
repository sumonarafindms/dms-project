import "./globals.css";
import AppShell from "./components/AppShell";
import { getCurrentUser } from "../lib/auth";
import { permissionsFor } from "../lib/permissions";
export const metadata = {
  title: "DMS | Distribution Management",
  description: "Mobile-first Distribution Management System",
};
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  const permissions = user ? await permissionsFor(user.id, user.role) : {};
  return (
    <html lang="en">
      <body>
        <AppShell user={user ? { displayName: user.displayName, role: user.role } : null} permissions={permissions}>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
