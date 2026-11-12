// TaskOrbit AI — generation orchestration tests (Part 3, spec section 8).
// The Gemini module is mocked (the real one imports "server-only", which
// throws outside a server component), so this tests the orchestration:
// not-configured state, cache reuse by digest, limits, invalid-output
// handling and reference filtering — against a stub Supabase client.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/ai/gemini", () => ({
  generateText: vi.fn(),
  parseModelJson: (text: string) => JSON.parse(text),
}));

import { generateText } from "@/lib/ai/gemini";
import { generateFeature } from "@/lib/ai/generate";
import { computeDigest } from "@/lib/ai/limits";
import type { AiInputData } from "@/lib/ai/prompts";

const mockedGenerate = vi.mocked(generateText);

const VALID_BRIEF = {
  headline: "A solid day.",
  activeProjects: [{ projectId: "proj-1", name: "Website Redesign", completionPercent: 50, openTasks: 2 }],
  recentlyCompleted: [{ taskId: "task-1", title: "Design homepage" }],
  upcoming: [{ taskId: "task-2", title: "Fix footer", dueDate: "2026-11-13", reason: "Due tomorrow." }],
  overdue: [],
  blockers: [],
  nextActions: [{ text: "Finish the footer fix.", taskId: "task-2" }],
};

const GHOST_BRIEF = {
  ...VALID_BRIEF,
  upcoming: [{ taskId: "task-ghost", title: "Invented task", reason: "Made up." }],
  nextActions: [{ text: "Do the invented thing.", taskId: "task-ghost" }],
};

function makeData(): AiInputData {
  return {
    workspaceName: "Test Workspace",
    timezone: "Asia/Dhaka",
    localDate: "2026-11-12",
    locale: "en",
    projects: [{ id: "proj-1", name: "Website Redesign", status: "active" }],
    tasks: [
      { id: "task-1", projectId: "proj-1", title: "Design homepage", status: "completed", priority: "high", dueDate: "2026-11-12", completedAt: "2026-11-12T10:00:00Z", assigneeFirstName: "Test", isSubtask: false },
      { id: "task-2", projectId: "proj-1", title: "Fix footer", status: "todo", priority: "medium", dueDate: "2026-11-13", completedAt: null, assigneeFirstName: "Test", isSubtask: false },
    ],
    comments: [],
    recentActivity: ["task.created: Design homepage"],
  };
}

// Chainable Supabase stub: every query method returns the stub itself;
// maybeSingle / rpc resolve from the fixture. `count` is what the usage
// count queries see (the stub itself is the awaited value).
function makeClient(opts: { cached?: unknown; cachedDigest?: string; count?: number } = {}) {
  const rpcCalls: { name: string; args: unknown }[] = [];
  const stub: Record<string, unknown> = {
    count: opts.count ?? 0,
    error: null,
    rpcCalls,
  };
  const chain = () => stub;
  for (const method of ["select", "eq", "is", "order", "limit", "gte"]) {
    stub[method] = chain;
  }
  stub.from = () => stub;
  stub.maybeSingle = async () =>
    opts.cached
      ? { data: { content: opts.cached, input_digest: opts.cachedDigest ?? "", generated_at: "2026-11-12T00:00:00Z", model: "gemini-2.5-flash" }, error: null }
      : { data: null, error: null };
  stub.rpc = async (name: string, args: unknown) => {
    rpcCalls.push({ name, args });
    return { data: "00000000-0000-0000-0000-000000000000", error: null };
  };
  return stub;
}

const OLD_KEY = process.env.GEMINI_API_KEY;

describe("generateFeature orchestration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = "test-key-not-real";
  });
  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = OLD_KEY;
  });

  function run(opts: { client?: ReturnType<typeof makeClient>; userId?: string | null; data?: AiInputData } = {}) {
    return generateFeature({
      supabase: (opts.client ?? makeClient()) as never,
      feature: "daily_brief",
      workspaceId: "ws-1",
      userId: opts.userId ?? null,
      locale: "en",
      localDate: "2026-11-12",
      data: opts.data ?? makeData(),
    });
  }

  it("returns not-configured when no Gemini key is set, and never calls the model", async () => {
    delete process.env.GEMINI_API_KEY;
    const result = await run();
    expect(result).toEqual({ ok: false, error: "TaskOrbit AI is not configured yet.", notConfigured: true });
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("generates, validates and caches a well-formed reply", async () => {
    mockedGenerate.mockResolvedValueOnce({ text: JSON.stringify(VALID_BRIEF), estimatedTokens: 10 });
    const client = makeClient();
    const result = await run({ client });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.headline).toBe("A solid day.");
      expect(result.cached).toBe(false);
      expect(result.droppedRefs).toBe(0);
    }
    const rpcNames = (client.rpcCalls as { name: string }[]).map((c) => c.name);
    expect(rpcNames).toContain("save_ai_summary");
    expect(rpcNames).toContain("log_ai_usage");
  });

  it("shows a friendly error (never raw model text) on invalid JSON output", async () => {
    mockedGenerate.mockResolvedValueOnce({ text: "this is not json", estimatedTokens: 5 });
    const result = await run();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("TaskOrbit AI could not generate this right now. Please try again.");
      expect(result.error).not.toContain("this is not json");
    }
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });

  it("drops references to tasks that were not in the input", async () => {
    mockedGenerate.mockResolvedValueOnce({ text: JSON.stringify(GHOST_BRIEF), estimatedTokens: 10 });
    const result = await run();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.content.upcoming).toEqual([]);
      expect(result.content.nextActions).toEqual([]);
      expect(result.droppedRefs).toBe(2);
    }
  });

  it("reuses the cache when the input digest is unchanged, without calling the model", async () => {
    const data = makeData();
    const digest = computeDigest({ feature: "daily_brief", data });
    const client = makeClient({ cached: VALID_BRIEF, cachedDigest: digest });
    const result = await run({ client, data });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.cached).toBe(true);
      expect(result.content.headline).toBe("A solid day.");
    }
    expect(mockedGenerate).not.toHaveBeenCalled();
  });

  it("regenerates when the input digest has changed", async () => {
    const data = makeData();
    const staleDigest = computeDigest({ feature: "daily_brief", data: { ...data, workspaceName: "Other" } });
    mockedGenerate.mockResolvedValueOnce({ text: JSON.stringify(VALID_BRIEF), estimatedTokens: 10 });
    const client = makeClient({ cached: VALID_BRIEF, cachedDigest: staleDigest });
    const result = await run({ client, data });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.cached).toBe(false);
    expect(mockedGenerate).toHaveBeenCalledTimes(1);
  });

  it("blocks generation when the workspace daily limit is reached", async () => {
    const client = makeClient({ count: 30 });
    const result = await run({ client });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.limitReached).toBe(true);
    expect(mockedGenerate).not.toHaveBeenCalled();
  });
});
