// Component-only browser test harness. Never part of the Next app or auth flow.
import { createRoot } from "react-dom/client";
import { WorldShell } from "../../src/components/community/WorldShell";
import { CommunityHall } from "../../src/components/community/CommunityHall";
import { GuildDirectory } from "../../src/components/community/GuildDirectory";
import { ChallengeBoard } from "../../src/components/community/ChallengeBoard";
import { RankingBoard } from "../../src/components/community/RankingBoard";
import { HeroSheet } from "../../src/components/community/HeroSheet";
import { MotionPreferences } from "../../src/components/ui/MotionPreferences";
const path = window.location.pathname;
createRoot(document.getElementById("root")!).render(
  <MotionPreferences>
    <WorldShell user={{ id: 12, name: "Kunal", classKey: "knight" }}>
      {path === "/leaderboard" ? (
        <RankingBoard />
      ) : path === "/guilds" ? (
        <GuildDirectory />
      ) : path === "/challenges" ? (
        <ChallengeBoard />
      ) : path.startsWith("/heroes") ? (
        <HeroSheet id={12} />
      ) : (
        <CommunityHall />
      )}
    </WorldShell>
  </MotionPreferences>,
);
