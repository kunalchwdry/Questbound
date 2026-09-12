import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GuildApp } from "@/components/guild/GuildApp";
import { getSessionUser } from "@/lib/auth";
import { getDashboard } from "@/lib/dashboard";

export const metadata: Metadata = {
  title: "Guild Hall",
  description: "Your quests, character sheet, armory and chronicle.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GuildPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const dashboard = await getDashboard(user.id);
  return <GuildApp initial={dashboard} />;
}
