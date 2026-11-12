// TaskOrbit AI — Gemini client (Part 3, spec section 8). SERVER ONLY.
import "server-only";

import { GoogleGenerativeAI } from "@google/generative-ai";
import { AI_LIMITS, getGeminiModel } from "./config";

// NOTE FOR THE OWNER: the free Gemini tier may use submitted data to
// improve Google's products. Use a paid tier for real workspaces/data.
// Only minimised data is ever sent (see lib/ai/prompts.ts): titles,
// statuses, dates, assignee first names and short recent comments —
// never emails, passwords, tokens, keys or auth data.

export interface GeminiResult {
  text: string;
  /** Rough token estimate (chars / 4), used only for the usage ledger. */
  estimatedTokens: number;
}

function isTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /429|500|502|503|504|overloaded|service unavailable|fetch failed|ECONNRESET|ETIMEDOUT|network/i.test(
    message,
  );
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match ? (match[1] ?? trimmed) : trimmed;
}

/** Parse the model's reply as JSON (tolerates a ```json fence). Throws on invalid JSON. */
export function parseModelJson(text: string): unknown {
  return JSON.parse(stripCodeFences(text));
}

let cachedClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("TaskOrbit AI is not configured yet.");
  if (!cachedClient) cachedClient = new GoogleGenerativeAI(key);
  return cachedClient;
}

/**
 * Ask Gemini for a text reply, with the 20 s timeout and 1 retry on
 * transient errors from the spec. Returns the raw text — callers validate
 * it with Zod and never show it raw in the UI.
 */
export async function generateText(
  prompt: string,
  opts: { timeoutMs?: number; maxOutputTokens?: number; retries?: number } = {},
): Promise<GeminiResult> {
  const timeoutMs = opts.timeoutMs ?? AI_LIMITS.timeoutMs;
  const maxOutputTokens = opts.maxOutputTokens ?? AI_LIMITS.maxOutputTokens;
  const retries = opts.retries ?? AI_LIMITS.maxRetries;

  const model = getClient().getGenerativeModel({
    model: getGeminiModel(),
    generationConfig: { maxOutputTokens, temperature: 0.3, responseMimeType: "application/json" },
  });

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const text = await withTimeout(
        model.generateContent(prompt).then((r) => r.response.text()),
        timeoutMs,
      );
      return { text, estimatedTokens: Math.ceil((prompt.length + text.length) / 4) };
    } catch (err) {
      lastError = err;
      if (attempt < retries && isTransient(err)) continue;
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Gemini request failed.");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Gemini request timed out after ${ms} ms.`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
