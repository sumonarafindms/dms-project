import { redirect } from "next/navigation";
import { prisma } from "../../lib/prisma";
import SetupForm from "./SetupForm";

export const dynamic = "force-dynamic";

export default async function Setup() {
  const users = await prisma.user.count();
  if (users > 0) redirect("/login");
  return (
    <main className="setup-v54-screen">
      <section className="setup-v54-copy">
        <div className="auth-v54-logo">D</div>
        <span>ONE-TIME SYSTEM SETUP</span>
        <h1>Initialize your DMS</h1>
        <p>Create the first administrator account. Once a user exists, this page automatically redirects to sign in.</p>
      </section>
      <section className="setup-v54-form">
        <SetupForm />
      </section>
    </main>
  );
}
