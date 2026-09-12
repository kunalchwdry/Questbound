import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Questbound and pick up your quests where you left them.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/guild");
  return (
    <AuthShell title="Welcome back, hero" subtitle="Your quests, gold and streak are exactly where you left them.">
      <AuthForm mode="login" />
    </AuthShell>
  );
}
