import type { ElementTable } from "claude-code";

import type {
  CostParts,
  SubagentInfo,
  SubagentUsage,
  Kind,
  McpServer,
  MemFile,
  Miss,
  Money,
  Repo,
  Snap,
  Tally,
} from "../types";
import {
  bar,
  baseName,
  clock,
  countdown,
  green,
  noLink,
  orange,
  red,
  percentCell,
  relIn,
  resetAt,
  scale,
  shortModel,
  thinBar,
  tokens,
  ttlScale,
  usd,
  yellow,
} from "./format";
import { renderList } from "./lists";
import { renderRobot } from "./robot";

export type BandProps = {
  /** Band width in cells (`e.props.bodyColumns`). */
  columns: number;
  now: number;
  ttlMs: number;
  snap: Snap;
  /** Extra usage beyond a personal plan, or all spend this month on Enterprise. */
  money: Money;
  tally: Tally;
  cacheAt: number;
  miss: Miss;
  repo: Repo;
  model: string;
  effort: string;
  /** Subscription, e.g. `Max 5x`; empty when unknown. */
  plan: string;
  claudeFiles: readonly MemFile[];
  agentsFiles: readonly MemFile[];
  mcp: readonly McpServer[];
  calls: Readonly<Record<string, number>>;
  agents: readonly SubagentInfo[];
  agentUsage: Readonly<Record<string, SubagentUsage>>;
  open: Kind | null;
  onToggle: (kind: Kind) => void;
  /** Opens a file or folder in the system. */
  onOpen: (path: string) => void;
  /** A turn is running (`e.props.isWorking`): the robot is working. */
  isWorking: boolean;
  /** Robot animation frame counter. */
  frame: number;
  /** Show the absolute reset time next to limits. */
  showResets: boolean;
  onToggleResets: () => void;
  /** Estimated session cost by token kind. */
  costParts: CostParts;
  /** Claude Code version. */
  version: string;
};

/** Context bar half again as wide as the default 10 cells. */
const CTX_CELLS = 15;
/** Width of the relative time (`1.5h`, `45m`) including a space so absolute times line up. */
const REL_CELLS = 6;
/**
 * Widths of the right block (limits with robot, cache) in cells. Both blocks have the same
 * width and sit at the right edge, so they start in the same column: the cache icon is below
 * the limit icons. The width matches the content exactly so no empty space is left on the right.
 */
// `🕔 5h 100% · ` (13) + relative time (REL_CELLS)
const LIMIT_CELLS = 13 + REL_CELLS;
// `[Mon 12.10. 08:00]` (18) + space, only when reset times are visible
const RESET_CELLS = 19;
// gap between limits and robot (3) + mini Clawd with a space and spinner (7)
const ROBOT_CELLS = 3 + 7;
/** Above this context fill a cold cache is expensive: the band turns red. */
const ALERT_CTX_PERCENT = 35;
/** Above this context fill the band always turns red, even with an active cache. */
const FULL_CTX_PERCENT = 65;
/** Calm: no background, border in the theme's muted color. */
const CALM = { background: undefined, border: "subtle", style: "round" };
const ALERT = { background: "#4a0a0a", border: red, style: "bold" };
const WARN = { background: "#3d2305", border: orange, style: "round" };

const hitColor = (hit: number) =>
  hit >= 80 ? green : hit >= 50 ? yellow : red;

const resetsAtMs = (resetsAt?: string) =>
  resetsAt ? Date.parse(resetsAt) : null;

/** The whole band above the prompt in a frame: header, context, money, buttons and the expanded list. */
export function renderBand(el: ElementTable, p: BandProps) {
  const { Box, Button, Link, Text } = el;
  // The frame takes 2 cells, the padding another 2.
  const divider = "─".repeat(Math.max(0, p.columns - 4));

  const five = p.snap.limits.find((l) => l.kind === "five_hour");
  const week = p.snap.limits.find((l) => l.kind === "seven_day");
  const fiveAt = resetsAtMs(five?.resetsAt);
  const weekAt = resetsAtMs(week?.resetsAt);

  const left = p.cacheAt > 0 ? p.cacheAt + p.ttlMs - p.now : 0;
  const isExpired = p.cacheAt > 0 && left <= 0;
  // Above 65 % always red; 35–65 % with a cold cache orange.
  const theme =
    p.snap.ctxPercent > FULL_CTX_PERCENT
      ? ALERT
      : isExpired && p.snap.ctxPercent > ALERT_CTX_PERCENT
        ? WARN
        : CALM;
  const sum = p.tally.read + p.tally.write + p.tally.input;
  const sessionHit = sum === 0 ? null : Math.round((p.tally.read / sum) * 100);
  const { money } = p;
  const moneyPercent =
    money.spent !== null && money.limit !== null && money.limit > 0
      ? (money.spent / money.limit) * 100
      : 0;
  const rightCells =
    LIMIT_CELLS + (p.showResets ? RESET_CELLS : 0) + ROBOT_CELLS;

  return (
    <Box
      flexDirection="column"
      borderStyle={theme.style}
      borderColor={theme.border}
      backgroundColor={theme.background}
      paddingX={1}
    >
      <Box justifyContent="space-between">
        <Box columnGap={2}>
          <Button
            key="k-folder"
            label={`📁 ${baseName(p.repo.cwd)}`}
            onPress={() => p.onOpen(p.repo.cwd)}
          />
          {p.repo.branch ? (
            <Text>
              <Text dimColor>git:</Text>
              <Text color={green}>{p.repo.branch}</Text>
              {p.repo.pr ? (
                <Text>
                  {" "}
                  <Link
                    href={p.repo.pr.url}
                    label={`[PR#${p.repo.pr.number}]`}
                  />
                </Text>
              ) : null}
              {p.repo.sync === null ? null : p.repo.sync.ahead === 0 &&
                p.repo.sync.behind === 0 ? (
                <Text dimColor> ✓</Text>
              ) : (
                <Text>
                  {p.repo.sync.ahead > 0 ? (
                    <Text color={green}> ↑{p.repo.sync.ahead}</Text>
                  ) : null}
                  {p.repo.sync.behind > 0 ? (
                    <Text color={orange}> ↓{p.repo.sync.behind}</Text>
                  ) : null}
                </Text>
              )}
            </Text>
          ) : null}
        </Box>
        <Box columnGap={3}>
          <Text>
            🤖 <Text bold>{p.model === "" ? "–" : shortModel(p.model)}</Text>
            <Text dimColor> (</Text>
            {p.effort}
            <Text dimColor>)</Text>
          </Text>
          {p.plan === "" ? null : (
            <Text>
              👑 <Text bold>{p.plan}</Text>
            </Text>
          )}
          {p.version === "" ? null : <Text dimColor>v{p.version}</Text>}
        </Box>
      </Box>
      <Text dimColor>{divider}</Text>

      <Box justifyContent="space-between" flexWrap="wrap" columnGap={3}>
        <Box flexDirection="column">
          <Text>
            🧠{" "}
            <Text color={scale(p.snap.ctxPercent)}>
              {bar(p.snap.ctxPercent, CTX_CELLS)}{" "}
              {Math.round(p.snap.ctxPercent)}%
            </Text>
            <Text dimColor>
              {" "}
              {tokens(p.snap.ctxTokens)}/{tokens(p.snap.ctxWindow)}
            </Text>
          </Text>
          <Box columnGap={1}>
            <Text>
              💰{" "}
              <Text color={scale(moneyPercent)} dimColor>
                {thinBar(moneyPercent, CTX_CELLS).filled}
              </Text>
              <Text dimColor>{thinBar(moneyPercent, CTX_CELLS).empty} </Text>
              <Text dimColor>{money.label} </Text>
              <Text bold>{money.spent === null ? "–" : usd(money.spent)}</Text>
              {money.limit === null ? null : (
                <Text dimColor> / {usd(money.limit)}</Text>
              )}
              {money.isOff ? <Text dimColor> (off)</Text> : null}
              {money.balance === null ? null : (
                <Text>
                  {"  "}💳 <Text bold>{usd(money.balance)}</Text>
                </Text>
              )}
            </Text>
            <Button
              key="k-session"
              label={`session: ${usd(p.snap.usd)}`}
              onPress={() => p.onToggle("session")}
            />
          </Box>
          {p.miss ? (
            <Text color={orange}>
              ⚠ cache miss {clock(p.miss.at)} · {p.miss.reason}
            </Text>
          ) : null}
        </Box>
        <Box columnGap={3} width={rightCells}>
          {/* Clicking a limit shows or hides when the windows reset. */}
          <Box flexDirection="column">
            {five ? (
              <Button key="k-5h" plain onPress={p.onToggleResets}>
                🕔 <Text dimColor>5h </Text>
                <Text color={scale(five.percentUsed)}>
                  {percentCell(five.percentUsed)}
                </Text>
                <Text dimColor>
                  {" "}
                  · {(fiveAt ? relIn(fiveAt, p.now) : "").padEnd(REL_CELLS)}
                  {p.showResets && fiveAt ? `[${clock(fiveAt)}]` : ""}
                </Text>
              </Button>
            ) : null}
            {week ? (
              <Button key="k-7d" plain onPress={p.onToggleResets}>
                📅 <Text dimColor>7d </Text>
                <Text color={scale(week.percentUsed)}>
                  {percentCell(week.percentUsed)}
                </Text>
                <Text dimColor>
                  {" "}
                  · {(weekAt ? relIn(weekAt, p.now) : "").padEnd(REL_CELLS)}
                  {p.showResets && weekAt ? resetAt(weekAt) : ""}
                </Text>
              </Button>
            ) : null}
          </Box>
          {renderRobot(el, {
            isWorking: p.isWorking,
            frame: p.frame,
            now: p.now,
          })}
        </Box>
      </Box>
      <Text dimColor>{divider}</Text>

      <Box justifyContent="space-between" flexWrap="wrap" columnGap={3}>
        <Box columnGap={1}>
          <Button
            key="k-claude"
            label={`📄 ${noLink("CLAUDE.md")} ×${p.claudeFiles.length}`}
            onPress={() => p.onToggle("claude")}
          />
          <Button
            key="k-agents"
            label={`📋 ${noLink("AGENTS.md")} ×${p.agentsFiles.length}`}
            onPress={() => p.onToggle("agents")}
          />
          <Button
            key="k-mcp"
            label={`🔌 MCP ×${p.mcp.length}`}
            onPress={() => p.onToggle("mcp")}
          />
        </Box>
        <Box columnGap={3} width={rightCells}>
          <Text>
            💾{" "}
            {p.tally.lastHit === null ? (
              "–"
            ) : (
              <Text color={hitColor(p.tally.lastHit)}>{p.tally.lastHit}%</Text>
            )}
            <Text dimColor> Σ {sessionHit ?? "–"}%</Text>
          </Text>
          {p.cacheAt === 0 ? (
            <Text dimColor>⏳ –</Text>
          ) : left > 0 ? (
            <Text color={ttlScale(left, p.ttlMs)}>⏳ {countdown(left)}</Text>
          ) : (
            <Text bold color={red}>
              ❄ expired
            </Text>
          )}
        </Box>
      </Box>

      {renderList(el, {
        open: p.open,
        cwd: p.repo.cwd,
        files: p.open === "agents" ? p.agentsFiles : p.claudeFiles,
        mcp: p.mcp,
        calls: p.calls,
        agents: p.agents,
        agentUsage: p.agentUsage,
        sessionUsd: p.snap.usd,
        now: p.now,
        frame: p.frame,
        tally: p.tally,
        costParts: p.costParts,
        onOpen: p.onOpen,
      })}
    </Box>
  );
}
