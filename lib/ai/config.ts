// TaskOrbit AI — configuration (Part 3, spec section 8).
//
// Server-only values: GEMINI_API_KEY and GEMINI_MODEL are read from
// process.env and must NEVER be NEXT_PUBLIC_, never in the browser bundle
// and never in the repo. The Gemini client (lib/ai/gemini.ts) imports
// "server-only" so it cannot leak into client code; this config module is
// only imported from server actions / route handlers / the Gemini client.

export const GEMINI_DEFAULT_MODEL = "gemini-2.5-flash";

/** The model to use. Configurable via GEMINI_MODEL in env. */
export function getGeminiModel(): string {
  const fromEnv = process.env.GEMINI_MODEL?.trim();
  return fromEnv && fromEnv.length > 0 ? fromEnv : GEMINI_DEFAULT_MODEL;
}

/** True only when a Gemini key is configured. No key = clean "not configured" state, nothing breaks. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim().length > 0);
}

// Limits (spec section 8).
export const AI_LIMITS = {
  /** Max AI calls per workspace per day. */
  workspacePerDay: 30,
  /** Max AI calls per user per hour. */
  userPerHour: 10,
  /** Max characters of minimised input data sent to the model. */
  maxInputChars: 60_000,
  /** Max tokens the model may produce per call. */
  maxOutputTokens: 2048,
  /** Per-attempt timeout for a model call. */
  timeoutMs: 20_000,
  /** Retries on transient errors (5xx / 429 / network), after the first attempt. */
  maxRetries: 1,
} as const;

/** AI summaries are cached for this long before a refresh is forced. */
export const AI_CACHE_TTL_DAYS = 7;
