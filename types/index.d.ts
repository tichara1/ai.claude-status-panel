export type Snap = {
  ctxTokens: number;
  ctxWindow: number;
  ctxPercent: number;
  usd: number;
  limits: { kind: string; percentUsed: number; resetsAt?: string }[];
};

export type Tally = {
  input: number;
  output: number;
  read: number;
  write: number;
  lastHit: number | null;
  turns: number;
};

export type Miss = { at: number; reason: string } | null;

/** An open pull request of the current branch as `gh pr view` reports it. */
export type PullRequest = { number: number; url: string };

/**
 * `sync` is the state against the upstream branch as of the last fetch; `null` without an upstream.
 * `pr` is the branch's open pull request; `null` without one, outside GitHub or without `gh`.
 */
export type Repo = {
  cwd: string;
  branch: string;
  sync: { ahead: number; behind: number } | null;
  pr?: PullRequest | null;
};

export type MemFile = { path: string; type: string; tokens: number };

export type Kind = "claude" | "mcp" | "session";

/** A skill the session lists, from the context breakdown. */
export type SkillInfo = {
  name: string;
  /** Where it comes from (`userSettings`, `plugin`, `built-in`, …). */
  source: string;
  tokens: number;
};

export type McpServer = {
  server: string;
  tools: number;
  loaded: number;
  tokens: number;
};

/** Subagent as reported by `agent.spawn`; `startedAt` is the start time (ms). */
export type SubagentInfo = {
  id: string;
  description: string;
  type: string;
  startedAt: number;
  /** The task it was given; absent in a record from an older version of the mod. */
  prompt?: string;
  /** Its final answer, once it finished. */
  result?: string;
};

/** Usage of one subagent: tokens and a price estimate from the model price list. */
export type SubagentUsage = {
  model: string;
  /** All tokens burned. */
  tokens: number;
  /** `null` when the model is not in the price list. */
  usd: number | null;
  /** Sum of the durations of completed turns. */
  durationMs: number;
  /** The subagent finished. */
  isDone: boolean;
  /** Effort abbreviation of the last request (`L`, `M`, `H`…); `–` for a model without effort. */
  effort: string;
};

/** Cost in USD split by token kind. */
export type CostParts = {
  input: number;
  output: number;
  read: number;
  write: number;
};

/** Usage beyond the plan as `api/oauth/usage` reports it under `spend`, in USD. */
export type AccountSpend = {
  used: number;
  /** Monthly cap; `null` without one. */
  limit: number | null;
  /** Prepaid credits left; `null` when the account reports none. */
  balance: number | null;
  /** Extra usage is switched on. */
  isEnabled: boolean;
  /** ISO code the account bills in (`USD`, `EUR`); `null` when it says none. */
  currency: string | null;
};

/** The signed-in organization; an Enterprise seat pays for every request. */
export type Billing = { orgId: string; isUsageBased: boolean };

/** The money line: `extra` beyond a personal plan, or all of `month` on Enterprise. */
/** Keeps the prompt cache warm with a tiny request shortly before the TTL runs out. */
export type KeepAlive = {
  isOn: boolean;
  /** Requests sent this session. */
  pings: number;
  /** Their estimated cost in USD. */
  usd: number;
};

export type Money = {
  label: "extra" | "month";
  /** `null` while unknown. */
  spent: number | null;
  limit: number | null;
  balance: number | null;
  /** Extra usage is switched off. */
  isOff: boolean;
  /** ISO code of the amounts; `null` for US dollars from the price list or the budget. */
  currency: string | null;
};

declare module "claude-code" {
  interface PluginState {
    "status-panel": {
      snap: Snap | null;
      tally: Tally;
      cacheAt: number;
      now: number;
      miss: Miss;
      repo: Repo;
      mem: MemFile[];
      open: Kind | null;
      model: string;
      effort: string;
      plan: string;
      mcp: McpServer[];
      calls: Record<string, number>;
      spent: number;
      account: AccountSpend | null;
      billing: Billing;
      agents: SubagentInfo[];
      agentUsage: Record<string, SubagentUsage>;
      showResets: boolean;
      keepAlive: KeepAlive;
      /** Subagents whose request and response are expanded in the session pane. */
      expandedAgents: string[];
      /** Agent type → the `color` of its definition, for the dot in the session pane. */
      agentColors: Record<string, string>;
      /** Subagents spawned this session, the cleared ones included. */
      spawnedAgents: number;
      /** Skills the session lists. */
      skills: SkillInfo[];
      /** Calls per skill name. */
      skillCalls: Record<string, number>;
      /** MCP servers and skills switched off in the project's local settings. */
      disabled: { mcp: string[]; skills: string[] };
      costParts: CostParts;
      frame: number;
    };
  }
}
