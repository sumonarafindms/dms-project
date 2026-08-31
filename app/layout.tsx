import "./globals.css";
import AppShell from "./components/AppShell";
import { getCurrentUser } from "../lib/auth";
import { permissionsFor } from "../lib/permissions";
import { ServiceWorker } from "./components/ServiceWorker";

export const metadata = {
  title: "DMS | Distribution Management",
  description: "Mobile-first Distribution Management System",
  // iOS ignores the web app manifest and reads this instead, so the home-screen
  // icon on an iPhone comes from here and nowhere else.
  appleWebApp: { capable: true, title: "DMS", statusBarStyle: "default" as const },
  /*
   * BOTH entries are required.
   *
   * Declaring `icons` at all overrides Next's app/icon.svg file convention, so
   * adding only `apple` here silently removed the <link rel="icon"> — the tab
   * icon disappeared and every page load fell back to probing /favicon.ico and
   * logging a 404. That is precisely the state app/icon.svg was created to fix,
   * and the E2E console-error check is what caught it.
   */
  icons: {
    icon: "/icon.svg",
    apple: "/icons/apple-touch-icon.png",
  },
};

/**
 * Tints the browser and system chrome to the kit's teal so an installed app
 * does not sit inside a grey frame. Separate from `metadata` because Next.js
 * takes viewport-level values from their own export.
 */
export const viewport = {
  themeColor: "#0d9488",
  // The app is mobile-first and its tables scroll inside their own containers,
  // so the page itself never needs zooming out — but zoom is NOT disabled.
  // `maximum-scale=1` is the usual way that gets done and it stops a
  // low-vision operator pinching to read a figure.
  width: "device-width",
  initialScale: 1,
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
        <ServiceWorker />
      </body>
    </html>
  );
}
