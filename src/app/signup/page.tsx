import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/AuthForm";
import { AuthShell } from "@/components/auth/AuthShell";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Create your hero",
  description: "Create a free Questbound account, choose a class and turn your first task into a quest.",
};

export const dynamic = "force-dynamic";

export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) redirect("/guild");
  return (
    <AuthShell title="Create your hero" subtitle="Free forever. Your first 50 gold is on the guild.">
      <AuthForm mode="signup" />
    </AuthShell>
  );
}
