import type { ElementTable } from "claude-code";

import type {
  CostParts,
  SubagentInfo,
  SubagentUsage,
  Kind,
  McpServer,
  MemFile,
  Tally,
} from "../types";
import {
  agentStatus,
  noLink,
  serverCalls,
  shortModel,
  shortPath,
  tokens,
  usd,
} from "./format";

/** Longest subagent description including its type; longer ones are cut to "…". */
const MAX_LABEL = 40;

export type ListProps = {
  open: Kind | null;
  cwd: string;
  files: readonly MemFile[];
  mcp: readonly McpServer[];
  calls: Readonly<Record<string, number>>;
  agents: readonly SubagentInfo[];
  agentUsage: Readonly<Record<string, SubagentUsage>>;
  sessionUsd: number;
  /** Current time in milliseconds, for the run time of a subagent that has not finished yet. */
  now: number;
  /** Animation frame counter for the asterisk of a running subagent. */
  frame: number;
  /** Session tokens by kind (main thread and subagents). */
  tally: Tally;
  costParts: CostParts;
  onOpen: (path: string) => void;
};

/** Expanded list below the button row; `null` when nothing is open. */
export function renderList(el: ElementTable, p: ListProps) {
  const { Box, Button, Text } = el;

  if (p.open === "claude") {
    return (
      <Box flexDirection="column" paddingLeft={2}>
        {p.files.length === 0 ? (
          <Text dimColor>
            No {noLink("CLAUDE.md")} or {noLink("AGENTS.md")} in context.
          </Text>
        ) : (
          p.files.map((f) => (
            <Box key={f.path} columnGap={1}>
              <Text>▸ {noLink(shortPath(f.path, p.cwd))}</Text>
              <Text dimColor>
                {f.type} · {tokens(f.tokens)} tok
              </Text>
              <Button
                key={`o:${f.path}`}
                label="↗ open"
                onPress={() => p.onOpen(f.path)}
              />
            </Box>
          ))
        )}
      </Box>
    );
  }

  if (p.open === "mcp") {
    return (
      <Box flexDirection="column" paddingLeft={2}>
        {p.mcp.length === 0 ? (
          <Text dimColor>No active MCP server.</Text>
        ) : (
          p.mcp.map((s) => (
            <Text key={s.server}>
              ▸ {s.server}
              <Text dimColor>
                {" "}
                · {s.loaded}/{s.tools} tools · {tokens(s.tokens)} tok ·{" "}
                {serverCalls(p.calls, s.server)} calls
              </Text>
            </Text>
          ))
        )}
      </Box>
    );
  }

  if (p.open === "session") {
    // A subagent without a spawn record (e.g. started before the mod loaded) has only an id.
    const ids = [
      ...new Set([...p.agents.map((a) => a.id), ...Object.keys(p.agentUsage)]),
    ];
    const info = new Map(p.agents.map((a) => [a.id, a]));
    const agentsUsd = ids.reduce(
      (sum, id) => sum + (p.agentUsage[id]?.usd ?? 0),
      0,
    );
    const agentsTokens = ids.reduce(
      (sum, id) => sum + (p.agentUsage[id]?.tokens ?? 0),
      0,
    );

    const totalTokens =
      p.tally.input + p.tally.read + p.tally.write + p.tally.output;
    const totalUsd =
      p.costParts.input +
      p.costParts.output +
      p.costParts.read +
      p.costParts.write;

    // Subagent rows in columns: description, model, tokens, status and cost aligned.
    const rows = ids.map((id) => {
      const a = info.get(id);
      const u = p.agentUsage[id];
      const type = ` (${a?.type ?? "?"})`;
      const rawDesc = a?.description ?? id;
      const room = Math.max(1, MAX_LABEL - type.length);
      const desc =
        rawDesc.length > room ? `${rawDesc.slice(0, room - 1)}…` : rawDesc;

      return {
        id,
        desc,
        type,
        model: u !== undefined && u.model !== "" ? shortModel(u.model) : "–",
        effort:
          u?.effort !== undefined && u.effort !== "–" ? ` (${u.effort})` : "",
        tokens: tokens(u?.tokens ?? 0),
        status: agentStatus(a?.startedAt, u, p.now, p.frame),
        cost: u?.usd === null || u === undefined ? "?" : `≈${usd(u.usd)}`,
      };
    });
    const widest = (values: readonly string[]) =>
      Math.max(0, ...values.map((v) => v.length));
    const labelWidth = widest(rows.map((r) => r.desc + r.type));
    const modelWidth = widest(rows.map((r) => r.model + r.effort));
    const tokensWidth = widest(rows.map((r) => r.tokens));
    const statusWidth = widest(rows.map((r) => r.status.text));
    const costWidth = widest(rows.map((r) => r.cost));

    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Text>
          🔥 {tokens(totalTokens)}
          <Text dimColor>
            {" "}
            tokens · ≈{usd(totalUsd)} by price list · engine {usd(p.sessionUsd)}
          </Text>
        </Text>
        <Text dimColor>Subagents</Text>
        {ids.length === 0 ? (
          <Text dimColor>No subagents in this session yet.</Text>
        ) : (
          rows.map((r) => (
            <Text key={r.id}>
              ▸ {r.desc}
              <Text dimColor>
                {r.type.padEnd(labelWidth - r.desc.length)}
                {"  "}
              </Text>
              {r.model}
              <Text dimColor>
                {r.effort.padEnd(modelWidth - r.model.length)}
                {"  "}🔥{" "}
              </Text>
              {r.tokens.padStart(tokensWidth)}
              {"  "}
              {r.status.icon} {r.status.text.padEnd(statusWidth)}
              {"  "}
              {r.cost.padStart(costWidth)}
            </Text>
          ))
        )}
        {ids.length > 0 ? (
          <Text dimColor>
            Σ subagents 🔥 {tokens(agentsTokens)} of {tokens(totalTokens)}{" "}
            tokens · ≈{usd(agentsUsd)} of {usd(p.sessionUsd)} this session
            (estimate from model prices)
          </Text>
        ) : null}
      </Box>
    );
  }

  return null;
}
