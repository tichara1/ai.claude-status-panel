import { atom, read, update } from "claude-code";
import type { EngineInterface, Register } from "claude-code";

import type {
  AccountSpend,
  Billing,
  KeepAlive,
  Kind,
  McpServer,
  MemFile,
  Miss,
  PullRequest,
  Repo,
  SkillInfo,
  Snap,
  SubagentInfo,
  SubagentUsage,
  Tally,
} from "../types";
import { renderBand } from "./band";
import type { Disabled } from "./format";
import { renderList } from "./lists";
import { renderMemory } from "./memory";
import { renderTools } from "./tools";
import {
  addAgentStep,
  baseName,
  effortShort,
  emptyAgent,
  groupMcp,
  disabledFromSettings,
  toggleInSettings,
  parseAgentDefinition,
  isKeepAliveDue,
  missReason,
  moneyLine,
  monthKey,
  isAzureRemote,
  parseAheadBehind,
  parseAzurePullRequest,
  parseAccountSpend,
  parsePullRequest,
  percentOf,
  accountFromClaudeJson,
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
const mcpAtom = atom(
  { plugin: "status-panel", key: "mcp" } as const,
  [] as McpServer[],
);
const callsAtom = atom(
  { plugin: "status-panel", key: "calls" } as const,
  {} as Record<string, number>,
);
const skillsAtom = atom(
  { plugin: "status-panel", key: "skills" } as const,
  [] as SkillInfo[],
);
const skillCallsAtom = atom(
  { plugin: "status-panel", key: "skillCalls" } as const,
  {} as Record<string, number>,
);
/** MCP servers and skills switched off in the project's .claude/settings.local.json. */
const disabledAtom = atom(
  { plugin: "status-panel", key: "disabled" } as const,
  { mcp: [], skills: [] } as Disabled,
);
/** Where the switches are written: personal, not committed, as `/skills` writes it. */
const LOCAL_SETTINGS = ".claude/settings.local.json";

/** The project's local settings text; `null` when there is no such file yet. */
async function readLocalSettings($: EngineInterface) {
  const cwd = await $.session.cwd();
  const text = await $.fs.read(`${cwd}/${LOCAL_SETTINGS}`).catch(() => null);

  return typeof text === "string" ? text : null;
}

/**
 * Switches an MCP server (`deniedMcpServers`) or a skill (`skillOverrides`) on or off in the
 * project's local settings. A file that is no JSON is left as it is and the toast says so.
 */
async function switchInSettings(
  $: EngineInterface,
  kind: "mcp" | "skill",
  name: string,
) {
  const text = await readLocalSettings($);
  const isOff =
    disabledFromSettings(text)[kind === "mcp" ? "mcp" : "skills"].includes(
      name,
    );
  const next = toggleInSettings(text, kind, name, isOff);
  if (next === null) {
    $.ui.toast(`${LOCAL_SETTINGS} is not valid JSON: nothing written`);

    return;
  }
  const cwd = await $.session.cwd();
  await $.fs.write(`${cwd}/${LOCAL_SETTINGS}`, next);
  await update($, disabledAtom, () => disabledFromSettings(next));
  $.ui.toast(
    kind === "mcp"
      ? `MCP ${name} ${isOff ? "on" : "off"}: applies when it reconnects (/mcp or a new session)`
      : `Skill ${name} ${isOff ? "on" : "off"}`,
  );
}
const modelAtom = atom({ plugin: "status-panel", key: "model" } as const, "");
const effortAtom = atom(
  { plugin: "status-panel", key: "effort" } as const,
  "–",
);
const planAtom = atom({ plugin: "status-panel", key: "plan" } as const, "");
/** Local estimate of this organization's spend for the current month across sessions (USD). */
const spentAtom = atom({ plugin: "status-panel", key: "spent" } as const, 0);
/** Usage beyond the plan as the account reports it; `null` until read. */
const accountAtom = atom(
  { plugin: "status-panel", key: "account" } as const,
  null as AccountSpend | null,
);
const billingAtom = atom(
  { plugin: "status-panel", key: "billing" } as const,
  { orgId: "", isUsageBased: false } as Billing,
);
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
const keepAliveAtom = atom(
  { plugin: "status-panel", key: "keepAlive" } as const,
  { isOn: false, pings: 0, usd: 0 } as KeepAlive,
);
/** How long before the cache expires the keep-alive request goes out. */
const KEEP_ALIVE_LEAD_MS = 60_000;
/** The keep-alive request: the shortest question with the shortest answer. */
const KEEP_ALIVE_PROMPT = "Reply with the single word: ok";
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

/**
 * With keep-alive on, sends one tiny request over the session's own transcript shortly before
 * the cache expires, so the API reads the prefix from the cache and its TTL starts again.
 * Not once the cache expired: the request would write the whole context again.
 * A failed request switches keep-alive off.
 */
async function keepCacheAlive(
  $: EngineInterface,
  now: number,
  ttlMs: number,
  ttlMinutes: number,
) {
  const keep = await read($, keepAliveAtom);
  const cacheAt = await read($, cacheAtAtom);
  if (!isKeepAliveDue(keep.isOn, cacheAt, ttlMs, KEEP_ALIVE_LEAD_MS, now)) {
    return;
  }
  const r = await $.model.fork({ prompt: KEEP_ALIVE_PROMPT });
  const usage = "usage" in r ? r.usage : null;
  const cost =
    usage === null
      ? 0
      : (stepCost(await read($, modelAtom), usage, ttlMinutes) ?? 0);
  await update($, keepAliveAtom, (k) => ({
    ...k,
    isOn: r.isAnswered && k.isOn,
    pings: k.pings + 1,
    usd: k.usd + cost,
  }));
  if (!r.isAnswered) {
    $.ui.toast(`keep-alive off: ${r.reason}`);
  } else if (
    r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens >
    0
  ) {
    const doneAt = await $.clock.now();
    await update($, cacheAtAtom, () => doneAt);
  }
}

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

/** How long a looked-up pull request is trusted before `gh` or `az` is asked again. */
const PR_TTL_MS = 2 * 60_000;
/** Last `gh` / `az` answer: the network call runs on a branch change or after PR_TTL_MS. */
let prCache: { key: string; at: number; pr: PullRequest | null } | null = null;

async function lookupPr($: EngineInterface, cwd: string, branch: string) {
  const key = `${cwd}|${branch}`;
  const now = await $.clock.now();
  if (prCache?.key === key && now - prCache.at < PR_TTL_MS) return prCache.pr;
  // Without the CLI, without a login or without a PR it fails: no link is shown.
  const run = (argv: string[]) =>
    $.process.run(argv, { cwd }).catch(() => null);
  const remote = await run(["git", "remote", "get-url", "origin"]);
  let pr: PullRequest | null;
  if (remote?.exitCode === 0 && isAzureRemote(remote.stdout)) {
    // `az` is a .cmd script on Windows, which only a shell starts.
    const az =
      (await $.env.get("OS")) === "Windows_NT" ? ["cmd", "/c", "az"] : ["az"];
    const out = await run([
      ...az,
      "repos",
      "pr",
      "list",
      "--detect",
      "true",
      "--source-branch",
      branch,
      "--status",
      "active",
      "--top",
      "1",
      "-o",
      "json",
    ]);
    pr =
      out?.exitCode === 0
        ? parseAzurePullRequest(out.stdout, remote.stdout)
        : null;
  } else {
    const out = await run(["gh", "pr", "view", "--json", "number,url,state"]);
    pr = out?.exitCode === 0 ? parsePullRequest(out.stdout) : null;
  }
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

/** Subagents spawned this session, the cleared ones included. */
const spawnedAgentsAtom = atom(
  { plugin: "status-panel", key: "spawnedAgents" } as const,
  0,
);
/** Subagents whose request and response are expanded in the session pane. */
const expandedAgentsAtom = atom(
  { plugin: "status-panel", key: "expandedAgents" } as const,
  [] as string[],
);
/** Longest response kept per subagent; the pane is for a look, the transcript has the rest. */
const MAX_AGENT_TEXT = 20_000;

/** Agent type → the `color` of its definition (user's, then the project's, which wins). */
const agentColorsAtom = atom(
  { plugin: "status-panel", key: "agentColors" } as const,
  {} as Record<string, string>,
);

/** Reads the colors of the agent definitions in ~/.claude/agents and the project's .claude/agents. */
async function refreshAgentColors($: EngineInterface) {
  const configDir = await $.env.get("CLAUDE_CONFIG_DIR");
  const home = (await $.env.get("USERPROFILE")) ?? (await $.env.get("HOME"));
  const userDir =
    configDir ?? (home === undefined ? undefined : `${home}/.claude`);
  const cwd = await $.session.cwd();
  const dirs = [
    ...(userDir === undefined ? [] : [`${userDir}/agents`]),
    `${cwd}/.claude/agents`,
  ];
  const colors: Record<string, string> = {};
  for (const dir of dirs) {
    // A missing folder just has no agents.
    const entries = await $.fs.list(dir).catch(() => []);
    for (const f of entries) {
      // A symbolic link is listed as `other`: read it too, the read follows it.
      if (f.kind === "dir" || !f.name.endsWith(".md")) continue;
      const text = await $.fs.read(`${dir}/${f.name}`).catch(() => null);
      const def = typeof text === "string" ? parseAgentDefinition(text) : null;
      if (def !== null) colors[def.name] = def.color;
    }
  }
  await update($, agentColorsAtom, () => colors);
}

/** The pane with the session's tokens and subagents, docked beside the transcript in fullscreen. */
const SESSION_PANE = "session";
/** Wide enough for a subagent row: description, model, tokens, status and cost. */
const SESSION_PANE_COLUMNS = 96;

/** The pane with the CLAUDE.md and AGENTS.md files in context. */
const MEMORY_PANE = "memory";
/** Files whose preview is open in the CLAUDE.md pane. */
const expandedFilesAtom = atom(
  { plugin: "status-panel", key: "expandedFiles" } as const,
  [] as string[],
);
/** File text by path, read when its preview opens. */
const previewsAtom = atom(
  { plugin: "status-panel", key: "previews" } as const,
  {} as Record<string, string>,
);

/** The memory files the panel lists: CLAUDE.md, CLAUDE.local.md and AGENTS.md. */
const memoryFiles = (mem: readonly MemFile[]) =>
  mem.filter((f) => /^(claude(\.local)?|agents)\.md$/i.test(baseName(f.path)));

/** Opens or closes a file's preview; opening reads the file again, so the preview is current. */
async function togglePreview($: EngineInterface, path: string) {
  const isOpen = (await read($, expandedFilesAtom)).includes(path);
  await update($, expandedFilesAtom, (paths) =>
    isOpen ? paths.filter((x) => x !== path) : [...paths, path],
  );
  if (isOpen) return;
  const text = await $.fs.read(path).catch(() => null);
  await update($, previewsAtom, (all) => ({
    ...all,
    [path]: typeof text === "string" ? text : "– the file could not be read",
  }));
}

/** The pane with MCP servers and skills, next to the session pane. */
const TOOLS_PANE = "tools";

/**
 * Opens a pane by id, or closes it when it is already up. Only one of this mod's panes is up
 * at a time: opening one closes the other, so closing it never leaves the other behind.
 */
async function togglePane($: EngineInterface, id: string, title: string) {
  const up = (await $.ui.panes()).map((pane) => pane.id);
  if (up.includes(id)) {
    await $.ui.close({ id });

    return;
  }
  for (const other of up) await $.ui.close({ id: other });
  const opened = await $.ui.open({ id, title, columns: SESSION_PANE_COLUMNS });
  if (!opened.isPlaced) $.ui.toast(`${title} pane: ${opened.reason}`);
}

/** A pull is on its way; another click waits for it rather than starting a second one. */
let isPulling = false;

/**
 * Brings the branch level with its upstream: `git pull --ff-only` moves it forward and never
 * merges, so a diverged branch or local changes in the way leave everything as it was and the
 * toast says why.
 */
async function pullUpstream($: EngineInterface) {
  if (isPulling) return;
  isPulling = true;
  try {
    const cwd = await $.session.cwd();
    $.ui.toast("git pull --ff-only…");
    const r = await $.process
      .run(["git", "pull", "--ff-only"], { cwd })
      .catch(() => null);
    const firstLine = (text: string) => text.trim().split("\n")[0] ?? "";
    $.ui.toast(
      r === null
        ? "git pull: git did not run"
        : r.exitCode === 0
          ? "Pulled: up to date with upstream"
          : `git pull failed: ${firstLine(r.stderr) || firstLine(r.stdout)}`,
    );
    await refreshRepo($);
  } finally {
    isPulling = false;
  }
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
  const skills = (b?.skills?.skillFrontmatter ?? []).map((s) => ({
    name: s.name,
    source: String(s.source),
    tokens: s.tokens,
  }));
  await update($, skillsAtom, () => skills);
  const local = await readLocalSettings($);
  await update($, disabledAtom, () => disabledFromSettings(local));
}

async function refreshPlan($: EngineInterface) {
  const dir =
    (await $.env.get("CLAUDE_CONFIG_DIR")) ??
    (await $.env.get("USERPROFILE")) ??
    (await $.env.get("HOME"));
  if (dir === undefined) return;
  // A missing file just means we do not show the subscription.
  const text = await $.fs.read(`${dir}/.claude.json`).catch(() => null);
  const account = typeof text === "string" ? accountFromClaudeJson(text) : null;
  if (account === null) return;
  await update($, planAtom, () => account.plan);
  const prev = await read($, billingAtom);
  await update($, billingAtom, () => ({
    orgId: account.orgId,
    isUsageBased: account.isUsageBased,
  }));
  // After /login into another account the old figures do not apply.
  if (prev.orgId !== "" && prev.orgId !== account.orgId) {
    await update($, accountAtom, () => null);
    await refreshAccount($);
  }
}

const USAGE_URL = "https://api.anthropic.com/api/oauth/usage";

/** Reads usage beyond the plan and prepaid credits of the signed-in account. */
async function refreshAccount($: EngineInterface) {
  // Null with an API key, a 3P provider or no login: there is no account to ask.
  const auth = await $.session.authorize();
  if (auth === null) return;
  // Offline or rate limited: the line keeps the last figures.
  const res = await $.http
    .fetch(USAGE_URL, {
      auth: auth.handle,
      headers: {
        Accept: "application/json",
        "anthropic-beta": "oauth-2025-04-20",
      },
    })
    .catch(() => null);
  if (res?.ok !== true) return;
  const spend = parseAccountSpend(res.text);
  await update($, accountAtom, () => spend);
}

/**
 * Writes this session's cost into the organization's monthly total in `$.store` and reflects
 * the total in state. Only an Enterprise seat pays for every request, so only it is counted.
 */
async function refreshSpend(
  $: EngineInterface,
  startedAt: number,
  usd: number,
) {
  const billing = await read($, billingAtom);
  if (!billing.isUsageBased) return;
  const key = monthKey(await $.clock.now(), billing.orgId);
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
  /** A keep-alive request is on its way; the next tick does not send another. */
  let isPinging = false;
  /** Subagents that sent a request and whose turn has not ended yet. */
  const runningAgents = new Set<string>();

  on("turn.start", ($, e, next) => {
    isWorking = true;

    return next(e);
  });

  on("session.start", async ($, e, next) => {
    const startedAt = await $.clock.now();
    await update($, nowAtom, () => startedAt);
    // The plan decides whether this session's cost counts toward the month.
    await refreshPlan($);
    await refresh($);
    await refreshRepo($);
    await refreshContext($);
    await refreshAccount($);
    await refreshAgentColors($);
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
        await refreshPlan($);
      }
      if (ticks % 120 === 0) await refreshAccount($);
      // Not while a turn runs (the turn refreshes the cache itself) or a request is on its way.
      if (!isWorking && !isPinging) {
        isPinging = true;
        try {
          await keepCacheAlive($, tickAt, ttlMs, ttlMinutes);
        } finally {
          isPinging = false;
        }
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
    const r = await next(e);
    // A subagent's last answer is its response; the session pane shows it under its request.
    if (agentId !== undefined && r.text !== "") {
      const result = r.text.slice(0, MAX_AGENT_TEXT);
      await update($, agentsAtom, (list) =>
        list.map((a) => (a.id === agentId ? { ...a, result } : a)),
      );
    }

    return r;
  });

  on("tool.call", async ($, e, next) => {
    await update($, callsAtom, (c) => ({
      ...c,
      [e.tool]: (c[e.tool] ?? 0) + 1,
    }));
    if (e.tool === "Skill") {
      const name = e.skill;
      await update($, skillCallsAtom, (c) => ({
        ...c,
        [name]: (c[name] ?? 0) + 1,
      }));
    }

    return next(e);
  });

  on("session.compact", ($, e, next) => {
    isCompacted = true;

    return next(e);
  });

  on("agent.spawn", async ($, e, next) => {
    const startedAt = await $.clock.now();
    // An agent defined or recoloured since the session started gets its colour too.
    await refreshAgentColors($);
    const r = await next(e);
    const id = r.agentId;
    if (id !== undefined) {
      const info = {
        id,
        description: e.description,
        type: e.subagentType,
        startedAt,
        prompt: e.prompt,
      };
      await update($, agentsAtom, (list) => [
        ...list.filter((a) => a.id !== id),
        info,
      ]);
      await update($, spawnedAgentsAtom, (n) => n + 1);
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

  on(
    "ui.render",
    { component: "Pane", requestId: SESSION_PANE },
    async ($, e) => {
      const snap = await read($, snapAtom);
      const el = $.ui.resolve(e);
      const { Text } = el;
      const list = renderList(el, {
        open: "session",
        agents: await read($, agentsAtom),
        agentUsage: await read($, agentUsageAtom),
        sessionUsd: snap?.usd ?? 0,
        now: await read($, nowAtom),
        frame: await read($, frameAtom),
        tally: await read($, tallyAtom),
        costParts: await read($, costPartsAtom),
        columns: e.props.bodyColumns,
        expanded: await read($, expandedAgentsAtom),
        agentColors: await read($, agentColorsAtom),
        spawnedAgents: await read($, spawnedAgentsAtom),
        onToggleAgent: async (id: string) => {
          await update($, expandedAgentsAtom, (ids) =>
            ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
          );
        },
        onClearAgents: async () => {
          // Running subagents stay, so their live status is not lost.
          const usage = await read($, agentUsageAtom);
          const isRunning = (id: string) => usage[id]?.isDone !== true;
          await update($, agentsAtom, (list) =>
            list.filter((a) => isRunning(a.id)),
          );
          await update($, agentUsageAtom, (all) =>
            Object.fromEntries(
              Object.entries(all).filter(([id]) => isRunning(id)),
            ),
          );
          await update($, expandedAgentsAtom, (ids) => ids.filter(isRunning));
        },
      });

      // The session kind always draws a list; the fallback only satisfies the type.
      return list ?? <Text dimColor>No session data yet.</Text>;
    },
  );

  on("ui.render", { component: "Pane", requestId: MEMORY_PANE }, async ($, e) =>
    renderMemory($.ui.resolve(e), {
      columns: e.props.bodyColumns,
      cwd: (await read($, repoAtom)).cwd,
      files: memoryFiles(await read($, memAtom)),
      expanded: await read($, expandedFilesAtom),
      previews: await read($, previewsAtom),
      onToggle: async (path: string) => {
        await togglePreview($, path);
      },
      onOpen: async (path: string) => {
        await openWithOs($, path);
        $.ui.toast(`Opening ${baseName(path)}`);
      },
    }),
  );

  on("ui.render", { component: "Pane", requestId: TOOLS_PANE }, async ($, e) =>
    renderTools($.ui.resolve(e), {
      columns: e.props.bodyColumns,
      mcp: await read($, mcpAtom),
      calls: await read($, callsAtom),
      skills: await read($, skillsAtom),
      skillCalls: await read($, skillCallsAtom),
      disabledMcp: (await read($, disabledAtom)).mcp,
      disabledSkills: (await read($, disabledAtom)).skills,
      onToggleMcp: async (server: string) => {
        await switchInSettings($, "mcp", server);
      },
      onToggleSkill: async (skill: string) => {
        await switchInSettings($, "skill", skill);
      },
    }),
  );

  on("ui.render", { component: "AbovePrompt" }, async ($, e, next) => {
    const snap = await read($, snapAtom);
    if (e.props.hasSurvey || snap === null) return next(e);

    const mem = await read($, memAtom);
    const toggle = async (kind: Kind) => {
      // The session breakdown is long: it opens in its own pane, not in the band.
      if (kind === "session") {
        await togglePane($, SESSION_PANE, "Session");

        return;
      }
      // MCP servers and skills open in a pane of their own as well.
      if (kind === "mcp") {
        await togglePane($, TOOLS_PANE, "MCP & skills");

        return;
      }
      // CLAUDE.md and AGENTS.md files open in a pane too.
      await togglePane($, MEMORY_PANE, "CLAUDE.md");
    };
    // A file in the default app, a folder in the file manager.
    const openPath = async (path: string) => {
      await openWithOs($, path);
      $.ui.toast(`Opening ${baseName(path)}`);
    };

    return renderBand($.ui.resolve(e), {
      now: await read($, nowAtom),
      ttlMs,
      snap,
      money: moneyLine(
        await read($, billingAtom),
        await read($, accountAtom),
        await read($, spentAtom),
        budget,
      ),
      tally: await read($, tallyAtom),
      cacheAt: await read($, cacheAtAtom),
      miss: await read($, missAtom),
      repo: await read($, repoAtom),
      model: await read($, modelAtom),
      effort: await read($, effortAtom),
      plan: await read($, planAtom),
      claudeFiles: memoryFiles(mem),
      mcp: await read($, mcpAtom),
      onToggle: toggle,
      onOpen: openPath,
      isWorking: e.props.isWorking,
      frame: await read($, frameAtom),
      showResets: await read($, showResetsAtom),
      keepAlive: await read($, keepAliveAtom),
      onPull: async () => {
        await pullUpstream($);
      },
      onToggleKeepAlive: async () => {
        await update($, keepAliveAtom, (k) => ({ ...k, isOn: !k.isOn }));
      },
      onToggleResets: async () => {
        await update($, showResetsAtom, (shown) => !shown);
      },
    });
  });
};
