import { z } from "zod";
import { AI_PROVIDERS, type AiProvider } from "./ai-providers";
import { ATTRIBUTES, CLASS_KEYS, DIFFICULTIES, QUEST_TYPES } from "./game";

const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

export const questInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give your quest a name")
    .max(120, "Keep the title under 120 characters"),
  notes: z.string().trim().max(500, "Notes are limited to 500 characters").optional(),
  attribute: z.enum(ATTRIBUTES),
  difficulty: z.enum(DIFFICULTIES),
  type: z.enum(QUEST_TYPES),
  dueDate: dayString.nullable().optional(),
});

export const questPatchSchema = questInputSchema.partial();

export const signupSchema = z.object({
  email: z.email("Enter a valid email address").max(255),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(128, "That password is too long"),
  displayName: z
    .string()
    .trim()
    .min(2, "Hero names need at least 2 characters")
    .max(40, "Hero names are limited to 40 characters"),
  classKey: z.enum(CLASS_KEYS as [string, ...string[]]),
  timezone: z.string().max(64).optional(),
});

export const loginSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Enter your password"),
  timezone: z.string().max(64).optional(),
});

export const idSchema = z.object({ itemId: z.number().int().positive() });

export const checkinSchema = z.object({
  mood: z.number().int().min(1).max(5),
  note: z.string().trim().max(400, "Keep the note under 400 characters").optional(),
});

export const companionSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "Say something to the Oracle")
    .max(600, "Keep it under 600 characters"),
});

// ---------------------------------------------------------------------------
// AI / LLM settings
// ---------------------------------------------------------------------------
/** Base URL must be http(s); http is permitted for local/private endpoints. */
const endpointUrl = z
  .string()
  .trim()
  .max(255)
  .regex(/^https?:\/\/[^\s/$.?#].*/i, "Enter a valid URL like http://localhost:11434/v1")
  .transform((s) => s.replace(/\/+$/, ""));

export const aiConfigInputSchema = z.object({
  provider: z.enum([...AI_PROVIDERS] as [AiProvider, ...AiProvider[]]),
  model: z.string().trim().max(120).optional().default(""),
  baseUrl: endpointUrl.or(z.literal("")).optional().default(""),
  // Write-only. Omitted/empty = keep the stored key; clearKey=true removes it.
  apiKey: z.string().max(200).optional(),
  clearKey: z.boolean().optional(),
  temperature: z.number({ message: "Set a temperature between 0 and 2" }).min(0).max(2),
  maxTokens: z.number().int().min(16).max(32000),
});
export type AiConfigInput = z.output<typeof aiConfigInputSchema>;

export const profilePatchSchema = z
  .object({
    displayName: z
      .string()
      .trim()
      .min(2, "Hero names need at least 2 characters")
      .max(40, "Hero names are limited to 40 characters"),
    classKey: z.enum(CLASS_KEYS as [string, ...string[]]),
    timezone: z.string().max(64).optional(),
    onboarded: z.boolean(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "Nothing to update" });
