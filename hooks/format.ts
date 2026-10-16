import type {
  AccountSpend,
  Billing,
  CostParts,
  Money,
  PullRequest,
} from "../types";

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
    ? `${Number((n / 1_000_000).toFixed(1))}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : String(n);

/** Amounts in US dollars (the engine's session cost, price-list estimates): `3.71$`. */
export const usd = (n: number) => `${n.toFixed(2)}$`;

const CURRENCY_SIGNS: Readonly<Record<string, string>> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CZK: " Kč",
};

/** An amount in the account's currency, the sign after the number: `3.71€`; `null` is dollars. */
export const money = (n: number, currency: string | null) =>
  `${n.toFixed(2)}${currency === null ? "$" : (CURRENCY_SIGNS[currency] ?? ` ${currency}`)}`;

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

  return behind !== undefined &&
    ahead !== undefined &&
    Number.isFinite(behind) &&
    Number.isFinite(ahead)
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

/** An `origin` URL of Azure DevOps (`dev.azure.com`, `*.visualstudio.com`, also over SSH). */
export const isAzureRemote = (url: string) =>
  /(^|[@./])(dev\.azure\.com|visualstudio\.com)[:/]/i.test(url.trim());

/**
 * `az repos pr list --status active -o json` → the first pull request with its web page;
 * an empty list or broken JSON → `null`.
 */
/**
 * Web page of an Azure DevOps repository from its `origin` URL:
 * `https://org@dev.azure.com/o/p/_git/r` or `git@ssh.dev.azure.com:v3/o/p/r` → `https://dev.azure.com/o/p/_git/r`.
 */
export const azureWebUrl = (remote: string) => {
  const url = remote.trim().replace(/\.git$/, "");
  const ssh = /[:/]v3\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(url);
  if (ssh) return `https://dev.azure.com/${ssh[1]}/${ssh[2]}/_git/${ssh[3]}`;

  return url.replace(/^https:\/\/[^@/]+@/, "https://");
};

/**
 * `az repos pr list --status active -o json` → the first pull request with its web page
 * (the repository's `webUrl`, else derived from `origin`); an empty list or broken JSON → `null`.
 */
export const parseAzurePullRequest = (
  out: string,
  remote: string,
): PullRequest | null => {
  let list: unknown;
  try {
    list = JSON.parse(out);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;

    return null;
  }
  const pr = (Array.isArray(list) ? list[0] : undefined) as
    | { pullRequestId?: unknown; repository?: { webUrl?: unknown } }
    | undefined;
  const id = pr?.pullRequestId;
  const webUrl = pr?.repository?.webUrl;
  const web = typeof webUrl === "string" ? webUrl : azureWebUrl(remote);

  return typeof id === "number"
    ? { number: id, url: `${web}/pullrequest/${id}` }
    : null;
};

/** `gh pr view --json number,url,state` → the open pull request; closed, merged or broken JSON → `null`. */
export const parsePullRequest = (out: string): PullRequest | null => {
  let pr: { number?: unknown; url?: unknown; state?: unknown };
  try {
    pr = JSON.parse(out) as typeof pr;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;

    return null;
  }

  return pr.state === "OPEN" &&
    typeof pr.number === "number" &&
    typeof pr.url === "string"
    ? { number: pr.number, url: pr.url }
    : null;
};

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

/** Month key in `$.store` for one organization's spend total: `spend:2026-10:<org>`. */
export const monthKey = (ms: number, orgId: string) => {
  const d = new Date(ms);

  return `spend:${d.getFullYear()}-${pad(d.getMonth() + 1)}:${orgId}`;
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

/**
 * Takes the plan label and billing from the contents of `~/.claude.json`; broken JSON → `null`.
 * An Enterprise seat pays for every request, a personal subscription only for extra usage.
 */
export const accountFromClaudeJson = (
  text: string,
): ({ plan: string } & Billing) | null => {
  type Account = {
    organizationUuid?: string;
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

  return {
    plan: planLabel(
      account?.organizationType,
      account?.organizationRateLimitTier,
    ),
    orgId: account?.organizationUuid ?? "",
    isUsageBased: account?.organizationType === "claude_enterprise",
  };
};

/** `{ amount_minor: 1234, exponent: 2 }` or a plain number → USD; anything else → `null`. */
const dollars = (value: unknown) => {
  if (typeof value === "number") return value;
  const m = value as { amount_minor?: unknown; exponent?: unknown } | null;
  if (typeof m?.amount_minor !== "number") return null;

  return (
    m.amount_minor / 10 ** (typeof m.exponent === "number" ? m.exponent : 2)
  );
};

/** The ISO currency code of a `{ amount_minor, currency }` amount; `null` without one. */
const currencyOf = (value: unknown) => {
  const c = (value as { currency?: unknown } | null)?.currency;

  return typeof c === "string" && c !== "" ? c.toUpperCase() : null;
};

/** The `spend` block of `api/oauth/usage` (usage beyond the plan); missing or broken JSON → `null`. */
export const parseAccountSpend = (text: string): AccountSpend | null => {
  let spend: Record<string, unknown> | null | undefined;
  try {
    spend = (JSON.parse(text) as { spend?: Record<string, unknown> | null })
      .spend;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;

    return null;
  }
  if (spend === null || spend === undefined) return null;

  return {
    used: dollars(spend.used) ?? 0,
    limit: dollars(spend.limit) ?? dollars(spend.cap),
    balance: dollars(spend.balance),
    isEnabled: spend.enabled === true,
    currency:
      currencyOf(spend.used) ??
      currencyOf(spend.limit) ??
      currencyOf(spend.balance),
  };
};

/**
 * What the money line shows. A personal subscription: only extra usage beyond the plan
 * from the account (`null` until it is read). Enterprise: all spend this month against the
 * budget, from the account once it reports it, otherwise the local estimate.
 */
export const moneyLine = (
  billing: Billing,
  account: AccountSpend | null,
  localSpent: number,
  budget: number,
): Money =>
  billing.isUsageBased
    ? {
        label: "month",
        spent: account?.isEnabled === true ? account.used : localSpent,
        limit: account?.limit ?? budget,
        balance: account?.balance ?? null,
        isOff: false,
        // Without the account's own figures the amounts are the local estimate in dollars.
        currency: account?.isEnabled === true ? account.currency : null,
      }
    : {
        label: "extra",
        spent: account?.used ?? null,
        limit: account?.limit ?? null,
        balance: account?.balance ?? null,
        isOff: account !== null && !account.isEnabled,
        currency: account?.currency ?? null,
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

/**
 * Whether keep-alive should send its request now: switched on, a cache to keep, not expired
 * yet (a request would write the whole context again) and at most `leadMs` left of its TTL.
 */
export const isKeepAliveDue = (
  isOn: boolean,
  cacheAt: number,
  ttlMs: number,
  leadMs: number,
  now: number,
) => {
  const left = cacheAt + ttlMs - now;

  return isOn && cacheAt > 0 && left > 0 && left <= leadMs;
};

/** `name` and `color` from an agent definition's frontmatter; `null` without both. */
export const parseAgentDefinition = (text: string) => {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (front === undefined) return null;
  const field = (key: string) =>
    new RegExp(`^${key}:\\s*["']?([^"'\\r\\n]+?)["']?\\s*$`, "m")
      .exec(front)?.[1]
      ?.trim();
  const name = field("name");
  const color = field("color");

  return name && color ? { name, color } : null;
};

/** Agent colors are names Claude Code knows; the terminal knows purple as magenta. */
const AGENT_COLORS: Readonly<Record<string, string>> = {
  purple: "magenta",
  pink: "magentaBright",
  orange: "#ff8c00",
};

/** The terminal color an agent definition's `color` is drawn in. */
export const agentTerminalColor = (color: string) =>
  AGENT_COLORS[color.toLowerCase()] ?? color.toLowerCase();

/** Active first, then the most called, then by name: the order of the MCP & skills pane. */
export const sortByUse = <
  T extends { name: string; calls: number; isOn: boolean },
>(
  items: readonly T[],
): T[] =>
  [...items].sort(
    (a, b) =>
      Number(b.isOn) - Number(a.isOn) ||
      b.calls - a.calls ||
      a.name.localeCompare(b.name),
  );

/** Switched-off MCP servers and skills, as a settings file holds them. */
export type Disabled = { mcp: string[]; skills: string[] };

/** Parses a settings file as an object; `null` when it is no JSON object. */
const settingsObject = (text: string): Record<string, unknown> | null => {
  try {
    const value: unknown = JSON.parse(text);

    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;

    return null;
  }
};

/** MCP servers named in `deniedMcpServers` and skills set to `"off"` in `skillOverrides`. */
export const disabledFromSettings = (text: string | null): Disabled => {
  const s = text === null ? null : settingsObject(text);
  const denied = Array.isArray(s?.deniedMcpServers) ? s.deniedMcpServers : [];
  const overrides =
    typeof s?.skillOverrides === "object" && s.skillOverrides !== null
      ? (s.skillOverrides as Record<string, unknown>)
      : {};

  return {
    mcp: denied
      .map((d) => (d as { serverName?: unknown } | null)?.serverName)
      .filter((n): n is string => typeof n === "string"),
    skills: Object.entries(overrides)
      .filter(([, v]) => v === "off")
      .map(([k]) => k),
  };
};

/**
 * The settings text with one MCP server or skill switched on or off; every other key kept.
 * `null` when the existing text is no JSON object: nothing is written over it then.
 */
export const toggleInSettings = (
  text: string | null,
  kind: "mcp" | "skill",
  name: string,
  isOn: boolean,
): string | null => {
  const s = text === null || text.trim() === "" ? {} : settingsObject(text);
  if (s === null) return null;
  const next: Record<string, unknown> = { ...s };
  if (kind === "mcp") {
    const denied = (
      Array.isArray(s.deniedMcpServers) ? s.deniedMcpServers : []
    ).filter(
      (d) => (d as { serverName?: unknown } | null)?.serverName !== name,
    );
    const list = isOn ? denied : [...denied, { serverName: name }];
    if (list.length === 0) delete next.deniedMcpServers;
    else next.deniedMcpServers = list;
  } else {
    const overrides = {
      ...(typeof s.skillOverrides === "object" && s.skillOverrides !== null
        ? (s.skillOverrides as Record<string, unknown>)
        : {}),
    };
    if (isOn) delete overrides[name];
    else overrides[name] = "off";
    if (Object.keys(overrides).length === 0) delete next.skillOverrides;
    else next.skillOverrides = overrides;
  }

  return `${JSON.stringify(next, null, 2)}\n`;
};

/** Where an MCP server comes from, as far as its name tells: `plugin`, `claude.ai`, or nothing. */
export const mcpTag = (server: string) =>
  /^plugin[_:]/i.test(server)
    ? "plugin"
    : /^claude[_.]ai[_ ]/i.test(server)
      ? "claude.ai"
      : "";

/** A skill's origin worth a tag: Claude Code's own (`system`) or a plugin's. */
export const skillTag = (source: string) =>
  source === "built-in" ? "system" : source === "plugin" ? "plugin" : "";
