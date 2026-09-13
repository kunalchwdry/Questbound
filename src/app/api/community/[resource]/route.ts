import {
  ApiError,
  handle,
  ok,
  parseBody,
  parseId,
  requireUser,
} from "@/lib/api";
import { communityActionSchema } from "@/lib/community-validation";
import { communityAction } from "@/lib/community-actions";
import {
  feed,
  discussion,
  guildList,
  guildDetail,
  challenges,
  leaderboard,
  publicHero,
  inbox,
  reports,
  communityMeta,
  searchHeroes,
} from "@/lib/community-queries";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ resource: string }> };
export async function GET(req: Request, ctx: Context) {
  return handle(async () => {
    const user = await requireUser();
    const { resource } = await ctx.params;
    const p = new URL(req.url).searchParams;
    switch (resource) {
      case "search-heroes":
        return ok(await searchHeroes(user.id, p.get("q") ?? ""));
      case "meta":
        return ok(await communityMeta(user.id));
      case "posts":
        return ok(await feed(user.id, p));
      case "discussion":
        return ok(
          await discussion(
            user.id,
            parseId(p.get("id") ?? ""),
            Math.max(0, Math.min(10000, Number(p.get("page")) || 0)) | 0,
          ),
        );
      case "guilds":
        return ok(await guildList(user.id, p));
      case "guild":
        return ok(await guildDetail(user.id, parseId(p.get("id") ?? "")));
      case "challenges":
        return ok(await challenges(user.id, p));
      case "leaderboard":
        return ok(await leaderboard(user.id, p));
      case "hero":
        return ok(await publicHero(user.id, parseId(p.get("id") ?? "")));
      case "inbox":
        return ok(await inbox(user.id));
      case "reports":
        return ok(await reports(user.id));
      default:
        throw new ApiError("Not found", 404);
    }
  });
}
export async function POST(req: Request, ctx: Context) {
  return handle(async () => {
    if ((await ctx.params).resource !== "actions")
      throw new ApiError("Not found", 404);
    const origin = req.headers.get("origin");
    const expected = new URL(req.url).origin;
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (
      !origin ||
      (origin !== expected && new URL(origin).host !== host) ||
      req.headers.get("sec-fetch-site") === "cross-site"
    )
      throw new ApiError("Use this action from the Questbound app.", 403);
    if (!req.headers.get("content-type")?.includes("application/json"))
      throw new ApiError("JSON required", 415);
    if (Number(req.headers.get("content-length") ?? 0) > 24000)
      throw new ApiError("Message too large", 413);
    const user = await requireUser();
    const body = await parseBody(req, communityActionSchema);
    return ok(await communityAction(user.id, body));
  });
}
