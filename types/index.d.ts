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

/** `sync` is the state against the upstream branch as of the last fetch; `null` without an upstream. */
export type Repo = {
  cwd: string;
  branch: string;
  sync: { ahead: number; behind: number } | null;
};

export type MemFile = { path: string; type: string; tokens: number };

export type Kind = "claude" | "agents" | "mcp" | "session";

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
      agents: SubagentInfo[];
      agentUsage: Record<string, SubagentUsage>;
      showResets: boolean;
      costParts: CostParts;
      version: string;
      frame: number;
    };
  }
}
