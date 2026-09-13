import { clientIp, handle, ok, parseBody, rateLimit, requireUser } from "@/lib/api";
import { getAiConfigRow, resolveApiKey } from "@/lib/ai-settings";
import { listProviderModels } from "@/lib/ai-models";
import { aiConfigInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Fetch the live chat-model catalogue for the selected provider using the
 * supplied (or saved) key. The key never leaves the server and is never
 * included in the response.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    rateLimit(`ai-models:${user.id}:${clientIp(req)}`, 24, 10 * 60_000);
    const input = await parseBody(req, aiConfigInputSchema);
    if (input.provider === "keyless") return ok({ models: [] });
    const existing = await getAiConfigRow(user.id);
    const key = resolveApiKey(existing, input);
    const result = await listProviderModels(input, key);
    return ok(result);
  });
}
