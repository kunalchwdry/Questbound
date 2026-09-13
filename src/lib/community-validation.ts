import { z } from "zod";
import { POST_TYPES, REACTIONS } from "./community-types";
import { ATTRIBUTES } from "./game";
const id = z.number().int().positive();
const content = z.string().trim().min(1).max(8000);
const title = z.string().trim().min(4).max(160);
const tag = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9-]{1,24}$/);
export const communityActionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("post"),
      title,
      content,
      type: z.enum(POST_TYPES),
      tried: z.string().trim().max(2000).default(""),
      tags: z.array(tag).max(5).default([]),
      guildId: id.nullable().default(null),
    })
    .strict(),
  z.object({ action: z.literal("editPost"), id, title, content }).strict(),
  z.object({ action: z.literal("deletePost"), id }).strict(),
  z
    .object({
      action: z.literal("comment"),
      postId: id,
      content,
      parentId: id.nullable().default(null),
    })
    .strict(),
  z.object({ action: z.literal("editComment"), id, content }).strict(),
  z.object({ action: z.literal("deleteComment"), id }).strict(),
  z
    .object({ action: z.literal("solution"), postId: id, commentId: id })
    .strict(),
  z
    .object({
      action: z.literal("react"),
      postId: id,
      commentId: id.nullable().default(null),
      reaction: z.enum(REACTIONS),
    })
    .strict(),
  z.object({ action: z.literal("save"), postId: id }).strict(),
  z
    .object({
      action: z.literal("createGuild"),
      name: z.string().trim().min(3).max(60),
      description: z.string().trim().max(1500),
      visibility: z.enum(["public", "invite_only"]),
    })
    .strict(),
  z.object({ action: z.literal("joinGuild"), id }).strict(),
  z.object({ action: z.literal("leaveGuild"), id }).strict(),
  z.object({ action: z.literal("invite"), guildId: id, userId: id }).strict(),
  z
    .object({ action: z.literal("respondInvite"), id, accept: z.boolean() })
    .strict(),
  z
    .object({
      action: z.literal("role"),
      guildId: id,
      userId: id,
      role: z.enum(["moderator", "member", "owner"]),
    })
    .strict(),
  z
    .object({
      action: z.literal("createGuildQuest"),
      guildId: id,
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().max(1500),
      attribute: z.enum(ATTRIBUTES).nullable(),
      target: z.number().int().min(10).max(1000),
      days: z.number().int().min(1).max(30),
    })
    .strict(),
  z.object({ action: z.literal("joinQuest"), id }).strict(),
  z.object({ action: z.literal("joinChallenge"), id }).strict(),
  z.object({ action: z.literal("claimQuest"), id }).strict(),
  z.object({ action: z.literal("claimChallenge"), id }).strict(),
  z
    .object({
      action: z.literal("createChallenge"),
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().max(1500),
      metric: z.enum(["sessions", "streak_days", "xp", "members"]),
      target: z.number().int().min(10).max(100000),
      days: z.number().int().min(1).max(30),
    })
    .strict(),
  z
    .object({
      action: z.literal("report"),
      postId: id,
      commentId: id.nullable().default(null),
      reason: z.string().trim().min(5).max(120),
      details: z.string().trim().max(2000).default(""),
    })
    .strict(),
  z
    .object({ action: z.literal("resolveReport"), id, remove: z.boolean() })
    .strict(),
  z
    .object({ action: z.literal("block"), userId: id, blocked: z.boolean() })
    .strict(),
  z.object({ action: z.literal("readNotice"), id: id.optional() }).strict(),
  z.object({ action: z.literal("visibility"), visible: z.boolean() }).strict(),
]);
export type CommunityAction = z.infer<typeof communityActionSchema>;
