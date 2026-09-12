import { handle, ok, parseBody, requireUser } from "@/lib/api";
import { getAiConfigRow, publicAiConfig, saveAiConfig } from "@/lib/ai-settings";
import { aiConfigInputSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Current AI/LLM configuration. The API key is never included. */
export async function GET() {
  return handle(async () => {
    const user = await requireUser();
    const row = await getAiConfigRow(user.id);
    return ok({ config: publicAiConfig(row) });
  });
}

/** Create/update the configuration (or reset to the keyless ensemble). */
export async function PUT(req: Request) {
  return handle(async () => {
    const user = await requireUser();
    const input = await parseBody(req, aiConfigInputSchema);
    const row = await saveAiConfig(user.id, input);
    return ok({ config: publicAiConfig(row) });
  });
}
