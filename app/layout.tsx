import "./globals.css";
import AppShell from "./components/AppShell";
import {getCurrentUser} from "../lib/auth";
export const metadata={title:"DMS | Distribution Management",description:"Mobile-first Distribution Management System"};
export default async function RootLayout({children}:{children:React.ReactNode}){const user=await getCurrentUser();return <html lang="en"><body><AppShell user={user?{displayName:user.displayName,role:user.role}:null}>{children}</AppShell></body></html>}
