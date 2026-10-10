import type { CostParts } from "../types";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const pad = (n: number) => String(n).padStart(2, "0");

export const green = "#22c55e";
export const yellow = "#eab308";
export const orange = "#f97316";
export const red = "#ef4444";

/** Usage color scale: green < 50, yellow < 75, orange < 90, red. */
export const scale = (percent: number) =>
  percent < 50 ? green : percent < 75 ? yellow : percent < 90 ? orange : red;

/** Remaining cache time scale: the less is left, the redder. */
export const ttlScale = (remainingMs: number, ttlMs: number) => {
  const left = remainingMs / ttlMs;

  return left > 0.5 ? green : left > 0.2 ? yellow : left > 0.05 ? orange : red;
};

export const tokens = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : String(n);

export const usd = (n: number) => `$${n.toFixed(2)}`;

export const bar = (percent: number, cells = 10) => {
  const filled = Math.max(
    0,
    Math.min(cells, Math.round((percent / 100) * cells)),
  );

  return "█".repeat(filled) + "░".repeat(cells - filled);
};

export const clock = (ms: number) => {
  const d = new Date(ms);

  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Time left until reset: from a day `5d5h`, from an hour `1.5h`, otherwise `45m`. */
export const relIn = (resetsAtMs: number, nowMs: number) => {
  const minutes = Math.max(0, (resetsAtMs - nowMs) / 60000);
  if (minutes >= 24 * 60) {
    const hours = Math.floor(minutes / 60);

    return `${Math.floor(hours / 24)}d${hours % 24}h`;
  }

  return minutes >= 60
    ? `${(minutes / 60).toFixed(1)}h`
    : `${Math.round(minutes)}m`;
};

/** Percentage right-aligned to 4 cells (`  7%`, ` 31%`, `100%`) so the time after it lines up. */
export const percentCell = (percent: number) =>
  `${Math.round(percent)}%`.padStart(4);

/** Absolute time only: `[Mon 12.10. 08:00]`. */
export const resetAt = (resetsAtMs: number) => {
  const d = new Date(resetsAtMs);

  return `[${DAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}. ${clock(resetsAtMs)}]`;
};

/** `mm:ss` until cache invalidation, `h:mm:ss` above an hour. */
export const countdown = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);

  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

export const percentOf = (read: number, write: number, input: number) => {
  const total = read + write + input;

  return total === 0 ? null : Math.round((read / total) * 100);
};

const slashes = (p: string) => p.replace(/\\/g, "/");

export const baseName = (path: string) =>
  slashes(path).split("/").filter(Boolean).pop() ?? path;

/** Path relative to the session folder, otherwise the last three segments. */
export const shortPath = (path: string, cwd: string) => {
  const p = slashes(path);
  const root = slashes(cwd).replace(/\/$/, "");

  return root !== "" && p.toLowerCase().startsWith(`${root.toLowerCase()}/`)
    ? p.slice(root.length + 1)
    : `…/${p.split("/").slice(-3).join("/")}`;
};

const EFFORT: Record<string, string> = {
  low: "L",
  medium: "M",
  high: "H",
  xhigh: "XH",
  max: "MAX",
};

/** `low`→L, `medium`→M, `high`→H, `xhigh`→XH, `max`→MAX; a numeric budget as `8k`. */
export const effortShort = (effort: string | number | undefined) =>
  effort === undefined
    ? "–"
    : typeof effort === "number"
      ? tokens(effort)
      : (EFFORT[effort] ?? effort);

/** `git rev-list --left-right --count @{u}...HEAD` → `{ behind, ahead }`. */
export const parseAheadBehind = (out: string) => {
  const [behind, ahead] = out.trim().split(/\s+/).map(Number);

  return Number.isFinite(behind) && Number.isFinite(ahead)
    ? { behind, ahead }
    : null;
};

const wire = (server: string) => server.replace(/[^a-zA-Z0-9_-]/g, "_");

/** Sum of tool calls of one MCP server (server name as /mcp writes it). */
export const serverCalls = (
  calls: Readonly<Record<string, number>>,
  server: string,
) =>
  Object.entries(calls)
    .filter(([name]) => name.startsWith(`mcp__${wire(server)}__`))
    .reduce((sum, [, n]) => sum + n, 0);

/** `claude_max` + `default_claude_max_5x` → `Max 5x`; without an OAuth account `API`. */
export const planLabel = (
  organizationType?: string,
  rateLimitTier?: string,
) => {
  if (!organizationType) return "API";
  const base = organizationType.replace(/^claude_/, "");
  const name = base.charAt(0).toUpperCase() + base.slice(1);
  const multiplier = /(\d+x)$/.exec(rateLimitTier ?? "")?.[1];

  return multiplier ? `${name} ${multiplier}` : name;
};

/**
 * Replaces dots with `․` (U+2024), which looks the same but the terminal does
 * not recognize the text as a file path, so clicking it opens nothing.
 */
export const noLink = (text: string) => text.replaceAll(".", "․");

type Price = { input: number; output: number; read: number };

/** USD per MTok (price list 2026-10); a longer prefix must come before a shorter one. */
const PRICES: readonly (readonly [string, Price])[] = [
  ["claude-fable-5-1", { input: 10, output: 50, read: 0.25 }],
  ["claude-mythos-5-1", { input: 10, output: 50, read: 0.25 }],
  ["claude-fable-5", { input: 10, output: 50, read: 1 }],
  ["claude-opus-5-5", { input: 4, output: 20, read: 0.2 }],
  ["claude-opus-5", { input: 5, output: 25, read: 0.5 }],
  ["claude-opus-4", { input: 5, output: 25, read: 0.5 }],
  ["claude-sonnet-5-5", { input: 2, output: 10, read: 0.2 }],
  ["claude-sonnet-5", { input: 2, output: 10, read: 0.2 }],
  ["claude-sonnet-4", { input: 3, output: 15, read: 0.3 }],
  ["claude-haiku-5-5", { input: 0.1, output: 0.5, read: 0.01 }],
  ["claude-haiku-4", { input: 1, output: 5, read: 0.1 }],
];

export type StepUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

/**
 * Estimated cost of one request by token kind; `null` for a model not in the price list.
 * A cache write costs 1.25× input at a 5 min TTL and 2× at a 1 h TTL.
 */
export const stepCostParts = (
  model: string,
  u: StepUsage,
  ttlMinutes: number,
): CostParts | null => {
  const id = model.replace(/\[.*\]$/, "");
  const price = PRICES.find(([prefix]) => id.startsWith(prefix))?.[1];
  if (price === undefined) return null;
  const write = price.input * (ttlMinutes >= 60 ? 2 : 1.25);

  return {
    input: (u.input_tokens * price.input) / 1_000_000,
    output: (u.output_tokens * price.output) / 1_000_000,
    read: (u.cache_read_input_tokens * price.read) / 1_000_000,
    write: (u.cache_creation_input_tokens * write) / 1_000_000,
  };
};

/** Estimated cost of one request in USD; `null` for a model not in the price list. */
export const stepCost = (model: string, u: StepUsage, ttlMinutes: number) => {
  const parts = stepCostParts(model, u, ttlMinutes);

  return parts === null
    ? null
    : parts.input + parts.output + parts.read + parts.write;
};

/** Adds one request's breakdown to the sum; an unpriced request leaves the sum unchanged. */
export const addCostParts = (
  sum: CostParts,
  parts: CostParts | null,
): CostParts =>
  parts === null
    ? sum
    : {
        input: sum.input + parts.input,
        output: sum.output + parts.output,
        read: sum.read + parts.read,
        write: sum.write + parts.write,
      };

/** Month key in `$.store` for the spend total: `spend:2026-10`. */
export const monthKey = (ms: number) => {
  const d = new Date(ms);

  return `spend:${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};

export type MissInput = {
  isCompacted: boolean;
  total: number;
  prevTotal: number;
  model: string;
  prevModel: string;
  isEffortChanged: boolean;
  gapMs: number;
  ttlMs: number;
};

/** `45 min`, from an hour `11.7 h`. */
export const duration = (ms: number) => {
  const minutes = ms / 60_000;

  return minutes < 60
    ? `${Math.round(minutes)} min`
    : `${(minutes / 60).toFixed(1)} h`;
};

/** Most likely cause of a cache miss; it is a guess based on the order of signals. */
export const missReason = (m: MissInput) =>
  m.isCompacted
    ? "compact"
    : m.total < m.prevTotal * 0.5
      ? "context shrank (/clear)"
      : m.model !== m.prevModel
        ? `model changed (${m.model})`
        : m.isEffortChanged
          ? "effort changed"
          : m.gapMs > m.ttlMs
            ? `idle ${duration(m.gapMs)} (TTL ${duration(m.ttlMs)}), cache expired`
            : "unknown cause (system prompt / tools / MCP?)";

export type McpTool = { serverName: string; isLoaded: boolean; tokens: number };

/** Tools from the breakdown grouped by server; an active server has a tool in context. */
export const groupMcp = (tools: readonly McpTool[]) => {
  const servers = new Map<
    string,
    { server: string; tools: number; loaded: number; tokens: number }
  >();
  for (const t of tools) {
    const cur = servers.get(t.serverName) ?? {
      server: t.serverName,
      tools: 0,
      loaded: 0,
      tokens: 0,
    };
    servers.set(t.serverName, {
      ...cur,
      tools: cur.tools + 1,
      loaded: cur.loaded + (t.isLoaded ? 1 : 0),
      tokens: cur.tokens + t.tokens,
    });
  }

  return [...servers.values()];
};

export type AgentTotals = {
  model: string;
  /** All tokens burned: input, cache read, cache write and output. */
  tokens: number;
  usd: number | null;
  /** Sum of the durations of the subagent's completed turns. */
  durationMs: number;
  /** The subagent finished: its turn ended and no further request has arrived yet. */
  isDone: boolean;
  /** Effort abbreviation of the last request; `–` for a model without effort. */
  effort: string;
};

/** Empty subagent total that requests and turns are added to. */
export const emptyAgent = (model = ""): AgentTotals => ({
  model,
  tokens: 0,
  usd: 0,
  durationMs: 0,
  isDone: false,
  effort: "–",
});

/**
 * Subagent status for the list: icon `✅` and run time once finished, an asterisk and
 * `running 1m20s` while running. The icon is always two cells (`✅` is wide, the
 * asterisk gets a space) so the status text lines up. A missing or invalid
 * value (record from an older version of the mod) gives an empty time, never `NaN`.
 */
export const agentStatus = (
  startedAt: number | undefined,
  usage: Partial<Pick<AgentTotals, "isDone" | "durationMs">> | undefined,
  now: number,
  frame: number,
) => {
  const isValid = (ms: number | undefined): ms is number =>
    ms !== undefined && Number.isFinite(ms);
  if (usage?.isDone === true) {
    const text =
      isValid(usage.durationMs) && usage.durationMs > 0
        ? elapsed(usage.durationMs)
        : "";

    return { icon: "✅", text };
  }
  const text = isValid(startedAt)
    ? `running ${elapsed(now - startedAt)}`
    : "running";

  return { icon: `${spinner(frame)} `, text };
};

/** Spinner asterisks as in Claude Code. */
const SPIN = ["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"];

/** Animated asterisk frame for the given frame counter. */
export const spinner = (frame: number) => SPIN[frame % SPIN.length] ?? "·";

/** Adds one subagent request; the cost stays `null` once a single request could not be priced. */
export const addAgentStep = (
  cur: AgentTotals | undefined,
  model: string,
  u: StepUsage,
  cost: number | null,
  effort = "–",
): AgentTotals => {
  const base = cur ?? emptyAgent(model);

  return {
    model,
    tokens:
      base.tokens +
      u.input_tokens +
      u.output_tokens +
      u.cache_read_input_tokens +
      u.cache_creation_input_tokens,
    usd: base.usd === null || cost === null ? null : base.usd + cost,
    durationMs: base.durationMs,
    // A new request means the subagent (even a resumed one) is running again.
    isDone: false,
    effort,
  };
};

/** `5s`, `3m12s`, od hodiny `1h05m`. */
export const elapsed = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${pad(s % 60)}s`;

  return `${Math.floor(m / 60)}h${pad(m % 60)}m`;
};

/** Takes only the organization type and tier from the contents of `~/.claude.json`; broken JSON → `null`. */
export const planFromClaudeJson = (text: string) => {
  type Account = {
    organizationType?: string;
    organizationRateLimitTier?: string;
  };
  let account: Account | undefined;
  try {
    account = (JSON.parse(text) as { oauthAccount?: Account }).oauthAccount;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;

    return null;
  }

  return planLabel(
    account?.organizationType,
    account?.organizationRateLimitTier,
  );
};

/** Thin bar `━━━───` split into a filled and an empty part so they can be colored separately. */
export const thinBar = (percent: number, cells: number) => {
  const filled = Math.max(
    0,
    Math.min(cells, Math.round((percent / 100) * cells)),
  );

  return { filled: "━".repeat(filled), empty: "─".repeat(cells - filled) };
};

/** `claude-opus-5-5` → `opus-5-5`. */
export const shortModel = (model: string) => model.replace(/^claude-/, "");
