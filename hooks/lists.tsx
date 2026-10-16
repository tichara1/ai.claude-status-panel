import type { ElementTable } from "claude-code";

import type {
  CostParts,
  SubagentInfo,
  SubagentUsage,
  Kind,
  Tally,
} from "../types";
import {
  agentStatus,
  agentTerminalColor,
  shortModel,
  tokens,
  usd,
} from "./format";

/** Longest subagent description including its type; longer ones are cut to "…". */
const MAX_LABEL = 40;

export type ListProps = {
  open: Kind | null;
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
  /** Width of the area the list is drawn in, for the separator lines. */
  columns?: number;
  /** Subagents whose request and response are shown. */
  expanded?: readonly string[];
  /** Expands or collapses one subagent. */
  onToggleAgent?: (id: string) => void;
  /** Agent type → the `color` of its definition. */
  agentColors?: Readonly<Record<string, string>>;
  /** Removes the finished subagents from the list. */
  onClearAgents?: () => void;
  /** Subagents spawned this session, the cleared ones included. */
  spawnedAgents?: number;
};

/** Expanded list below the button row; `null` when nothing is open. */
export function renderList(el: ElementTable, p: ListProps) {
  const { Box, Button, Text } = el;

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
    // The list sits 2 cells in from the left edge.
    const rule = (glyph: string) =>
      glyph.repeat(Math.max(1, (p.columns ?? 80) - 2));
    const expanded = p.expanded ?? [];
    // Inside the detail frame: the list's 2, the frame's indent of 4, its border 2 and padding 2.
    const detailWidth = Math.max(1, (p.columns ?? 80) - 10);

    return (
      <Box flexDirection="column" paddingLeft={2}>
        <Text>
          🔥 {tokens(totalTokens)}
          <Text dimColor>
            {" "}
            tokens · ≈{usd(totalUsd)} by price list · engine {usd(p.sessionUsd)}
          </Text>
        </Text>
        <Text dimColor>{rule("─")}</Text>
        <Box columnGap={2}>
          <Text dimColor>Subagents</Text>
          {/* Drops the finished subagents from the list; running ones stay. */}
          {ids.length > 0 && p.onClearAgents !== undefined ? (
            <Button key="k-clear-agents" plain onPress={p.onClearAgents}>
              <Text dimColor underline>
                clear
              </Text>
            </Button>
          ) : null}
        </Box>
        {ids.length === 0 ? (
          <Text dimColor>No subagents in this session yet.</Text>
        ) : (
          rows.map((r) => {
            const isOpen = expanded.includes(r.id);
            const a = info.get(r.id);
            const agentColor =
              a === undefined ? undefined : p.agentColors?.[a.type];

            return (
              <Box key={r.id} flexDirection="column">
                <Button
                  key={`a:${r.id}`}
                  plain
                  onPress={() => p.onToggleAgent?.(r.id)}
                >
                  <Text>
                    {isOpen ? "▾" : "▸"}{" "}
                    {/* The agent's own color from its definition; a blank keeps the columns. */}
                    {agentColor === undefined ? (
                      "  "
                    ) : (
                      <Text color={agentTerminalColor(agentColor)}>● </Text>
                    )}
                    <Text bold color="suggestion">
                      {r.desc}
                    </Text>
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
                </Button>
                {isOpen ? (
                  // Its own dim frame, indented under the row: request and response stand apart
                  // from the list of subagents, with an empty row before the next one.
                  <Box flexDirection="column" paddingLeft={4} paddingBottom={1}>
                    <Box
                      flexDirection="column"
                      borderStyle="round"
                      borderColor="subtle"
                      paddingX={1}
                    >
                      <Text bold color="suggestion">
                        ▌ request
                      </Text>
                      <Box paddingLeft={2}>
                        <Text>
                          {a?.prompt ??
                            "– (started before the mod recorded requests)"}
                        </Text>
                      </Box>
                      {/* A dotted line between the two halves, as wide as the frame's inside. */}
                      <Text dimColor>{"┄".repeat(detailWidth)}</Text>
                      <Text bold color="success">
                        ▌ response
                      </Text>
                      <Box paddingLeft={2}>
                        <Text>
                          {a?.result ??
                            (p.agentUsage[r.id]?.isDone
                              ? "–"
                              : "still running…")}
                        </Text>
                      </Box>
                    </Box>
                  </Box>
                ) : null}
              </Box>
            );
          })
        )}
        {ids.length > 0 ? <Text dimColor>{rule("═")}</Text> : null}
        {ids.length > 0 ? (
          <Text dimColor>
            Σ subagents {p.spawnedAgents ?? ids.length} spawned · 🔥{" "}
            {tokens(agentsTokens)} of {tokens(totalTokens)} tokens · ≈
            {usd(agentsUsd)} of {usd(p.sessionUsd)} this session (estimate from
            model prices)
          </Text>
        ) : null}
      </Box>
    );
  }

  return null;
}
