import { clientIp, handle, ok, parseBody, rateLimit, requireUser } from "@/lib/api";
import { getAiConfigRow, publicAiConfig, recordTestIfMatching, resolveApiKey, testAiConnection } from "@/lib/ai-settings";
import { aiConfigInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Validate + reach out to the configured LLM endpoint server-side.
 * The API key never traverses the browser logic (only the form save/test),
 * and is redacted from every error string before it leaves this handler.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    rateLimit(`ai-test:${user.id}:${clientIp(req)}`, 12, 10 * 60_000);
    const input = await parseBody(req, aiConfigInputSchema);

    const existing = await getAiConfigRow(user.id);
    const key = resolveApiKey(existing, input);

    const result = await testAiConnection(input, key);
    await recordTestIfMatching(user.id, input, key, result.ok);

    const row = await getAiConfigRow(user.id);
    return ok({ result, config: publicAiConfig(row) });
    // Intentionally no logging of `key`, request headers, or raw bodies.
  });
}
