import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type {
  Kind,
  McpServer,
  MemFile,
  Miss,
  PullRequest,
  Repo,
  Snap,
  SubagentInfo,
  SubagentUsage,
  Tally,
} from "../types";
import { renderBand } from "./band";
import {
  addAgentStep,
  baseName,
  effortShort,
  emptyAgent,
  groupMcp,
  missReason,
  monthKey,
  parseAheadBehind,
  parsePullRequest,
  percentOf,
  planFromClaudeJson,
  addCostParts,
  stepCost,
  stepCostParts,
} from "./format";

const snapAtom = atom(
  { plugin: "status-panel", key: "snap" } as const,
  null as Snap | null,
);
const tallyAtom = atom(
  { plugin: "status-panel", key: "tally" } as const,
  {
    input: 0,
    output: 0,
    read: 0,
    write: 0,
    lastHit: null,
    turns: 0,
  } as Tally,
);
const cacheAtAtom = atom(
  { plugin: "status-panel", key: "cacheAt" } as const,
  0,
);
const nowAtom = atom({ plugin: "status-panel", key: "now" } as const, 0);
const missAtom = atom(
  { plugin: "status-panel", key: "miss" } as const,
  null as Miss,
);
const repoAtom = atom(
  { plugin: "status-panel", key: "repo" } as const,
  { cwd: "", branch: "", sync: null, pr: null } as Repo,
);
const memAtom = atom(
  { plugin: "status-panel", key: "mem" } as const,
  [] as MemFile[],
);
const openAtom = atom(
  { plugin: "status-panel", key: "open" } as const,
  null as Kind | null,
);
const mcpAtom = atom(
  { plugin: "status-panel", key: "mcp" } as const,
  [] as McpServer[],
);
const callsAtom = atom(
  { plugin: "status-panel", key: "calls" } as const,
  {} as Record<string, number>,
);
const modelAtom = atom({ plugin: "status-panel", key: "model" } as const, "");
const effortAtom = atom(
  { plugin: "status-panel", key: "effort" } as const,
  "–",
);
const planAtom = atom({ plugin: "status-panel", key: "plan" } as const, "");
/** Spend for the current month across sessions (USD). */
const spentAtom = atom({ plugin: "status-panel", key: "spent" } as const, 0);
const agentsAtom = atom(
  { plugin: "status-panel", key: "agents" } as const,
  [] as SubagentInfo[],
);
const agentUsageAtom = atom(
  { plugin: "status-panel", key: "agentUsage" } as const,
  {} as Record<string, SubagentUsage>,
);
/** Robot animation frame counter; grows only during a turn. */
const frameAtom = atom({ plugin: "status-panel", key: "frame" } as const, 0);
const showResetsAtom = atom(
  { plugin: "status-panel", key: "showResets" } as const,
  false,
);
/** Estimated session cost by token kind (main thread and subagents). */
const costPartsAtom = atom(
  { plugin: "status-panel", key: "costParts" } as const,
  {
    input: 0,
    output: 0,
    read: 0,
    write: 0,
  },
);
const versionAtom = atom(
  { plugin: "status-panel", key: "version" } as const,
  "",
);

/** Opens a path with the OS opener: `start` on Windows, `open` on macOS, `xdg-open` elsewhere. */
async function openWithOs($: EngineInterface, path: string) {
  if ((await $.env.get("OS")) === "Windows_NT") {
    await $.process.run(["cmd", "/c", "start", "", path]);

    return;
  }
  const isMac =
    (await $.env.get("OSTYPE"))?.startsWith("darwin") ||
    (await $.process.run(["uname"]).catch(() => null))?.stdout.startsWith(
      "Darwin",
    );
  await $.process.run([isMac ? "open" : "xdg-open", path]);
}

/** How long a looked-up pull request is trusted before `gh` is asked again. */
const PR_TTL_MS = 2 * 60_000;
/** Last `gh pr view` answer: the network call runs on a branch change or after PR_TTL_MS. */
let prCache: { key: string; at: number; pr: PullRequest | null } | null = null;

async function lookupPr($: EngineInterface, cwd: string, branch: string) {
  const key = `${cwd}|${branch}`;
  const now = await $.clock.now();
  if (prCache?.key === key && now - prCache.at < PR_TTL_MS) return prCache.pr;
  // Without gh, outside GitHub or without a PR it exits non-zero: no link is shown.
  const out = await $.process
    .run(["gh", "pr", "view", "--json", "number,url,state"], { cwd })
    .catch(() => null);
  const pr = out?.exitCode === 0 ? parsePullRequest(out.stdout) : null;
  prCache = { key, at: now, pr };

  return pr;
}

async function refreshRepo($: EngineInterface) {
  const cwd = await $.session.cwd();
  // Outside a git repository this is expected; the branch simply stays empty.
  const run = (argv: string[]) =>
    $.process.run(argv, { cwd }).catch(() => null);
  const named = await run(["git", "branch", "--show-current"]);
  let branch = named?.exitCode === 0 ? named.stdout.trim() : "";
  if (named?.exitCode === 0 && branch === "") {
    const sha = await run(["git", "rev-parse", "--short", "HEAD"]);
    branch = sha?.exitCode === 0 ? `(${sha.stdout.trim()})` : "";
  }
  // Without an upstream branch it exits non-zero: the arrows are then not shown.
  const counts = await run([
    "git",
    "rev-list",
    "--left-right",
    "--count",
    "@{upstream}...HEAD",
  ]);
  const sync = counts?.exitCode === 0 ? parseAheadBehind(counts.stdout) : null;
  // A detached HEAD has no pull request.
  const pr =
    named?.exitCode === 0 && named.stdout.trim() !== ""
      ? await lookupPr($, cwd, branch)
      : null;
  await update($, repoAtom, () => ({ cwd, branch, sync, pr }));
}

async function refreshContext($: EngineInterface) {
  const b = (await $.session.usage({ breakdown: "summary" })).context.breakdown;
  const model = b?.model ?? "";
  await update($, modelAtom, () => model);
  const files = (b?.memoryFiles ?? []).map((f) => ({
    path: f.path,
    type: f.type,
    tokens: f.tokens,
  }));
  await update($, memAtom, () => files);
  const servers = groupMcp(b?.mcpTools ?? []);
  await update($, mcpAtom, () => servers);
}

async function refreshPlan($: EngineInterface) {
  const dir =
    (await $.env.get("CLAUDE_CONFIG_DIR")) ??
    (await $.env.get("USERPROFILE")) ??
    (await $.env.get("HOME"));
  if (dir === undefined) return;
  // A missing file just means we do not show the subscription.
  const text = await $.fs.read(`${dir}/.claude.json`).catch(() => null);
  const plan = typeof text === "string" ? planFromClaudeJson(text) : null;
  if (plan !== null) await update($, planAtom, () => plan);
}

/** Writes this session's cost into the monthly total in `$.store` and reflects the total in state. */
async function refreshSpend(
  $: EngineInterface,
  startedAt: number,
  usd: number,
) {
  const key = monthKey(await $.clock.now());
  const stored = (await $.store.get(key)) as Record<string, number> | undefined;
  const sessions = { ...stored, [String(startedAt)]: usd };
  await $.store.set(key, sessions);
  const spent = Object.values(sessions).reduce((sum, v) => sum + v, 0);
  await update($, spentAtom, () => spent);
}

async function refresh($: EngineInterface) {
  const u = await $.session.usage();
  const snap: Snap = {
    ctxTokens: u.context.tokens ?? 0,
    ctxWindow: u.context.window,
    ctxPercent: u.context.percent ?? 0,
    usd: u.cost?.usd ?? 0,
    limits: u.rateLimits.map((l) => ({
      kind: l.kind,
      percentUsed: l.percentUsed,
      resetsAt: l.resetsAt,
    })),
  };
  await update($, snapAtom, () => snap);
  await refreshSpend($, u.startedAt, snap.usd);
}

export const register: Register = (on, options) => {
  const ttlMinutes = Number(options.ttlMinutes ?? "60");
  const ttlMs = ttlMinutes * 60_000;
  const budget = Number(options.budgetUsd ?? "250");
  let prevTotal = 0;
  let prevModel = "";
  let prevEffort: unknown;
  let isCompacted = false;
  let ticks = 0;
  let isWorking = false;
  /** Subagents that sent a request and whose turn has not ended yet. */
  const runningAgents = new Set<string>();

  on("turn.start", ($, e, next) => {
    isWorking = true;

    return next(e);
  });

  on("session.start", async ($, e, next) => {
    const startedAt = await $.clock.now();
    await update($, nowAtom, () => startedAt);
    await refresh($);
    await refreshRepo($);
    await refreshContext($);
    await refreshPlan($);
    const { version } = await $.session.version();
    await update($, versionAtom, () => version);
    $.clock.every(250, async () => {
      // The animation (Clawd, asterisks of running subagents) runs while anyone is working.
      if (isWorking || runningAgents.size > 0) {
        await update($, frameAtom, (f) => f + 1);
      }
    });
    $.clock.every(1000, async () => {
      const tickAt = await $.clock.now();
      await update($, nowAtom, () => tickAt);
      ticks += 1;
      if (ticks % 15 === 0) await refresh($);
      if (ticks % 30 === 0) {
        await refreshRepo($);
        await refreshContext($);
      }
    });

    return next(e);
  });

  on("turn.complete", async ($, e, next) => {
    const agentId = e.agentId;
    if (agentId === undefined) {
      isWorking = false;
    } else {
      runningAgents.delete(agentId);
      // Subagent run time = sum of its completed turns.
      await update($, agentUsageAtom, (all) => {
        const cur = all[agentId] ?? emptyAgent();

        return {
          ...all,
          [agentId]: {
            ...cur,
            // A record from an older version of the mod has no durationMs.
            durationMs:
              (Number.isFinite(cur.durationMs) ? cur.durationMs : 0) +
              e.durationMs,
            isDone: true,
          },
        };
      });
    }
    await refreshRepo($);
    await refreshContext($);

    return next(e);
  });

  on("tool.call", async ($, e, next) => {
    await update($, callsAtom, (c) => ({
      ...c,
      [e.tool]: (c[e.tool] ?? 0) + 1,
    }));

    return next(e);
  });

  on("session.compact", ($, e, next) => {
    isCompacted = true;

    return next(e);
  });

  on("agent.spawn", async ($, e, next) => {
    const startedAt = await $.clock.now();
    const r = await next(e);
    const id = r.agentId;
    if (id !== undefined) {
      const info = {
        id,
        description: e.description,
        type: e.subagentType,
        startedAt,
      };
      await update($, agentsAtom, (list) => [
        ...list.filter((a) => a.id !== id),
        info,
      ]);
    }

    return r;
  });

  on("turn.step", async function* ($, e, next) {
    const sentAt = await $.clock.now();
    const r = yield* next(e);
    const u = r.usage;

    if (u !== null) {
      const total =
        u.input_tokens +
        u.cache_read_input_tokens +
        u.cache_creation_input_tokens;
      const hit = percentOf(
        u.cache_read_input_tokens,
        u.cache_creation_input_tokens,
        u.input_tokens,
      );
      await update($, tallyAtom, (t) => ({
        input: t.input + u.input_tokens,
        output: t.output + u.output_tokens,
        read: t.read + u.cache_read_input_tokens,
        write: t.write + u.cache_creation_input_tokens,
        lastHit: e.agentId === undefined ? hit : t.lastHit,
        turns: t.turns + 1,
      }));

      const parts = stepCostParts(e.model, u, ttlMinutes);
      await update($, costPartsAtom, (sum) => addCostParts(sum, parts));

      const agentId = e.agentId;
      if (agentId !== undefined) {
        runningAgents.add(agentId);
        const cost = stepCost(e.model, u, ttlMinutes);
        await update($, agentUsageAtom, (all) => ({
          ...all,
          [agentId]: addAgentStep(
            all[agentId],
            e.model,
            u,
            cost,
            effortShort(e.effort),
          ),
        }));
      } else {
        const lastAt = await read($, cacheAtAtom);
        if (prevTotal > 0 && u.cache_read_input_tokens < prevTotal * 0.5) {
          const reason = missReason({
            isCompacted,
            total,
            prevTotal,
            model: e.model,
            prevModel,
            isEffortChanged: e.effort !== prevEffort,
            gapMs: lastAt > 0 ? sentAt - lastAt : 0,
            ttlMs,
          });
          await update($, missAtom, () => ({ at: sentAt, reason }));
        } else if (u.cache_read_input_tokens > 0) {
          // The request reads from the cache again: the cache is refreshed, the message no longer applies.
          await update($, missAtom, () => null);
        }
        isCompacted = false;
        prevTotal = total;
        prevModel = e.model;
        prevEffort = e.effort;
        await update($, effortAtom, () => effortShort(e.effort));
        if (u.cache_read_input_tokens + u.cache_creation_input_tokens > 0) {
          const doneAt = await $.clock.now();
          await update($, cacheAtAtom, () => doneAt);
        }
      }
    }
    await refresh($);

    return r;
  });

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const snap = await read($, snapAtom);
    if (e.props.hasSurvey || snap === null) return next(e);

    const mem = await read($, memAtom);
    const toggle = async (kind: Kind) => {
      await update($, openAtom, (cur) => (cur === kind ? null : kind));
    };
    // A file in the default app, a folder in the file manager.
    const openPath = async (path: string) => {
      await openWithOs($, path);
      $.ui.toast(`Opening ${baseName(path)}`);
    };

    return renderBand($.ui.resolve(e), {
      columns: e.props.bodyColumns,
      now: await read($, nowAtom),
      ttlMs,
      snap,
      spent: await read($, spentAtom),
      budget,
      tally: await read($, tallyAtom),
      cacheAt: await read($, cacheAtAtom),
      miss: await read($, missAtom),
      repo: await read($, repoAtom),
      model: await read($, modelAtom),
      effort: await read($, effortAtom),
      plan: await read($, planAtom),
      claudeFiles: mem.filter((f) =>
        /^claude(\.local)?\.md$/i.test(baseName(f.path)),
      ),
      agentsFiles: mem.filter((f) => /^agents\.md$/i.test(baseName(f.path))),
      mcp: await read($, mcpAtom),
      calls: await read($, callsAtom),
      agents: await read($, agentsAtom),
      agentUsage: await read($, agentUsageAtom),
      open: await read($, openAtom),
      onToggle: toggle,
      onOpen: openPath,
      isWorking: e.props.isWorking,
      frame: await read($, frameAtom),
      showResets: await read($, showResetsAtom),
      costParts: await read($, costPartsAtom),
      version: await read($, versionAtom),
      onToggleResets: async () => {
        await update($, showResetsAtom, (shown) => !shown);
      },
    });
  });
};
