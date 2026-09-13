export const POST_TYPES = [
  "help",
  "question",
  "discussion",
  "achievement",
  "tip",
  "goal",
  "challenge",
] as const;
export const REACTIONS = [
  "helpful",
  "motivating",
  "encouragement",
  "learned_something",
  "relatable",
] as const;
export const CATEGORIES = [
  "overall",
  "weekly",
  "monthly",
  "streak",
  "community",
  "solvers",
  "guilds",
] as const;
export type PostType = (typeof POST_TYPES)[number];
export type BoardCategory = (typeof CATEGORIES)[number];
export interface HeroPublic {
  id: number;
  display_name: string;
  class_key: string;
  xp: number;
  level: number;
  streak: number;
  reputation: number;
  helpful: number;
  solved: number;
  guild_name: string | null;
  guild_id: number | null;
  attributes?: { key: string; level: number; xp: number }[];
  rank?: number;
  score?: number;
  movement?: number | null;
  best?: boolean;
}
export interface Post {
  id: number;
  author_id: number;
  display_name: string;
  class_key: string;
  xp: number;
  post_type: PostType;
  title: string;
  content: string;
  tried: string | null;
  category: string | null;
  is_solved: boolean;
  solved_comment_id: number | null;
  guild_id: number | null;
  guild_name: string | null;
  created_at: string;
  comment_count: number;
  reaction_count: number;
  tags: string[];
  saved: boolean;
  reactions: string[];
}
export interface Comment {
  id: number;
  post_id: number;
  author_id: number;
  display_name: string;
  class_key: string;
  content: string;
  parent_comment_id: number | null;
  is_solution: boolean;
  depth: number;
  helpful_count: number;
  created_at: string;
  deleted_at: string | null;
  reactions: string[];
}
export interface Guild {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  motto: string | null;
  emblem: string;
  visibility: string;
  xp: number;
  level: number;
  member_count: number;
  role: "owner" | "moderator" | "member" | null;
  weekly_xp: number;
}
export interface SharedQuest {
  id: number;
  guild_id?: number;
  title: string;
  description: string | null;
  icon: string;
  target: number;
  progress: number;
  status: string;
  starts_at: string;
  ends_at: string | null;
  reward_xp: number;
  reward_gold: number;
  reward_reputation: number;
  attribute?: string | null;
  metric?: string;
  joined: boolean;
  contribution: number;
  reward_claimed: boolean;
  participants: number;
}
export interface Notice {
  id: number;
  kind: string;
  title: string;
  body: string;
  href: string;
  read_at: string | null;
  created_at: string;
}
export interface Invite {
  id: number;
  guild_id: number;
  name: string;
  inviter: string;
}
export interface GuildDetail {
  guild: Guild;
  quests: SharedQuest[];
  members: (HeroPublic & { role: string; contribution_xp: number })[];
}
