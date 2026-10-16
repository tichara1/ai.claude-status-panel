import type { ElementTable } from "claude-code";

import type {
  CostParts,
  SubagentInfo,
  SubagentUsage,
  KeepAlive,
  Kind,
  Miss,
  Money,
  Repo,
  Snap,
  Tally,
} from "../types";
import {
  baseName,
  clock,
  countdown,
  green,
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
  money as formatMoney,
  yellow,
} from "./format";
import { renderRobot } from "./robot";

export type BandProps = {
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
  keepAlive: KeepAlive;
  onToggleKeepAlive: () => void;
  /** Fast-forwards the branch to its upstream (`git pull --ff-only`). */
  onPull: () => void;
  /** Pushes the branch to its upstream after a confirming second click (`git push`). */
  onPush: () => void;
};

/** Width of the context and money bars in cells. */
const BAR_CELLS = 15;
/** The money bar sits beside the short time limits: a shorter bar keeps that column narrow. */
const MONEY_BAR_CELLS = 8;
/** Width of a row label (`context`, `cache`) including the gap after it. */
const LABEL_CELLS = 9;
/**
 * Column where CLAUDE.md (cache row) and keep-alive's spend (bottom row) start: under the token count
 * on the context row (label, bar, a space, the four-cell percentage and two spaces).
 */
const KEEP_ALIVE_COLUMN = LABEL_CELLS + BAR_CELLS + 1 + 4 + 2;
/** Width of the relative time (`1.5h`, `45m`) including a space so absolute times line up. */
const REL_CELLS = 6;
/** Above this context fill a cold cache is expensive: the frame turns orange. */
const ALERT_CTX_PERCENT = 35;
/** Above this context fill the frame always turns red, even with an active cache. */
const FULL_CTX_PERCENT = 65;
/** Calm: no background, border in the theme's muted color. */
const CALM = { background: undefined, border: "subtle", style: "round" };
const ALERT = { background: "#4a0a0a", border: red, style: "bold" };
const WARN = { background: "#3d2305", border: orange, style: "round" };

const hitColor = (hit: number) =>
  hit >= 80 ? green : hit >= 50 ? yellow : red;

const resetsAtMs = (resetsAt?: string) =>
  resetsAt ? Date.parse(resetsAt) : null;

/** The money row shows only with a known limit and extra usage not switched off. */
export const hasMoneyRow = (money: Money) =>
  money.limit !== null && !money.isOff;

/** The whole band above the prompt in a quiet frame: header, meters with limits, links and the expanded list. */
export function renderBand(el: ElementTable, p: BandProps) {
  const { Box, Button, Link, Text } = el;

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
  // Usage-based billing (Enterprise) pays per token: the 5h and 7d windows say nothing there.
  const showsLimits = money.label !== "month";
  const moneyPercent =
    money.spent !== null && money.limit !== null && money.limit > 0
      ? (money.spent / money.limit) * 100
      : 0;

  /** A row label, dim and padded so the bars start in one column. */
  const label = (text: string) => (
    <Text dimColor>{text.padEnd(LABEL_CELLS)}</Text>
  );
  /** A thin bar and its percentage, both in the fill's color. */
  const meter = (percent: number, cells = BAR_CELLS, isTall = false) => {
    const thin = thinBar(percent, cells);
    // The tall bar draws the same cells as ▬, a block centred in the row (the eighth blocks
    // ▁–▇ grow from the bottom and sit low); the empty part keeps the height, only dim.
    const filled = isTall ? thin.filled.replaceAll("━", "▬") : thin.filled;
    const empty = isTall ? thin.empty.replaceAll("─", "▬") : thin.empty;

    return (
      <Text>
        <Text color={scale(percent)}>{filled}</Text>
        <Text dimColor>{empty}</Text>
        <Text color={scale(percent)}> {percentCell(percent)}</Text>
      </Text>
    );
  };
  const header = [
    p.model === "" ? "–" : shortModel(p.model),
    p.effort,
    p.plan,
  ].filter((part) => part !== "");

  return (
    <Box
      flexDirection="column"
      borderStyle={theme.style}
      borderColor={theme.border}
      backgroundColor={theme.background}
      paddingX={1}
    >
      <Box justifyContent="space-between" columnGap={4}>
        <Box columnGap={2}>
          <Button key="k-folder" plain onPress={() => p.onOpen(p.repo.cwd)}>
            <Text bold underline>
              {baseName(p.repo.cwd)}
            </Text>
          </Button>
          {p.repo.branch ? (
            <Box>
              <Text>
                <Text color={green}>{p.repo.branch}</Text>
                {p.repo.sync === null ? null : p.repo.sync.ahead === 0 &&
                  p.repo.sync.behind === 0 ? (
                  <Text dimColor> ✓</Text>
                ) : p.repo.sync.ahead > 0 && p.repo.sync.behind > 0 ? (
                  <Text color={green}> ↑{p.repo.sync.ahead}</Text>
                ) : null}{" "}
              </Text>
              {/* Only ahead of upstream: a click (confirmed by a second one) pushes. */}
              {p.repo.sync !== null &&
              p.repo.sync.ahead > 0 &&
              p.repo.sync.behind === 0 ? (
                <Button key="k-push" plain onPress={p.onPush}>
                  <Text color={green} underline>
                    ↑{p.repo.sync.ahead}
                  </Text>
                </Button>
              ) : null}
              {/* Behind upstream: a click fast-forwards the branch. */}
              {p.repo.sync !== null && p.repo.sync.behind > 0 ? (
                <Button key="k-pull" plain onPress={p.onPull}>
                  <Text color={orange} underline>
                    ↓{p.repo.sync.behind}
                  </Text>
                </Button>
              ) : null}
              {p.repo.pr ? (
                <Text>
                  {"  "}
                  <Link href={p.repo.pr.url} label={`PR#${p.repo.pr.number}`} />
                </Text>
              ) : null}
            </Box>
          ) : null}
        </Box>
        <Text dimColor>{header.join(" · ")}</Text>
      </Box>
      <Text> </Text>

      <Box justifyContent="space-between" flexWrap="wrap" columnGap={3}>
        <Box flexDirection="column">
          <Text>
            {label("context")}
            {meter(p.snap.ctxPercent, BAR_CELLS, true)}
            <Text dimColor>
              {"  "}
              {tokens(p.snap.ctxTokens)} [{tokens(p.snap.ctxWindow)}]
            </Text>
          </Text>
          <Box>
            <Box width={KEEP_ALIVE_COLUMN}>
              {/* The word cache switches keep-alive: a tiny request shortly before the TTL
                  runs out keeps the cache warm. The dot is green while it is on. */}
              <Button key="k-keep" plain onPress={p.onToggleKeepAlive}>
                <Text dimColor underline>
                  cache
                </Text>
                {p.keepAlive.isOn ? (
                  <Text color={green}> ●</Text>
                ) : (
                  <Text dimColor> ●</Text>
                )}
                <Text>{" ".repeat(LABEL_CELLS - "cache ●".length)}</Text>
              </Button>
              <Text>
                {p.tally.lastHit === null ? (
                  <Text dimColor>–</Text>
                ) : (
                  <Text color={hitColor(p.tally.lastHit)}>
                    {p.tally.lastHit}%
                  </Text>
                )}
                <Text dimColor>
                  {"  "}Σ {sessionHit ?? "–"}%{"  "}
                </Text>
                {p.cacheAt === 0 ? (
                  <Text dimColor>–</Text>
                ) : left > 0 ? (
                  <Text color={ttlScale(left, p.ttlMs)}>{countdown(left)}</Text>
                ) : (
                  <Text bold color={red}>
                    expired
                  </Text>
                )}
              </Text>
            </Box>
            {/* The side panes start under the token count of the context row. */}
            <Box columnGap={3}>
              {/* CLAUDE.md, rules, hooks and mods: the counts are in the pane. */}
              <Button key="k-claude" plain onPress={() => p.onToggle("claude")}>
                <Text underline>SETTINGS</Text>
              </Button>
              <Button key="k-mcp" plain onPress={() => p.onToggle("mcp")}>
                <Text underline>MCP</Text>
              </Button>
            </Box>
          </Box>
          {p.miss ? (
            <Text color={orange}>
              {" ".repeat(LABEL_CELLS)}cache miss {clock(p.miss.at)} ·{" "}
              {p.miss.reason}
            </Text>
          ) : null}
        </Box>
        <Box columnGap={3}>
          {/* Clicking a limit shows or hides when the windows reset. */}
          <Box flexDirection="column">
            {showsLimits && five ? (
              <Button key="k-5h" plain onPress={p.onToggleResets}>
                <Text dimColor>5h </Text>
                <Text color={scale(five.percentUsed)}>
                  {percentCell(five.percentUsed)}
                </Text>
                <Text dimColor>
                  {"  "}
                  {(fiveAt ? relIn(fiveAt, p.now) : "").padEnd(REL_CELLS)}
                  {p.showResets && fiveAt ? `[${clock(fiveAt)}]` : ""}
                </Text>
              </Button>
            ) : null}
            {showsLimits && week ? (
              <Button key="k-7d" plain onPress={p.onToggleResets}>
                <Text dimColor>7d </Text>
                <Text color={scale(week.percentUsed)}>
                  {percentCell(week.percentUsed)}
                </Text>
                <Text dimColor>
                  {"  "}
                  {(weekAt ? relIn(weekAt, p.now) : "").padEnd(REL_CELLS)}
                  {p.showResets && weekAt ? resetAt(weekAt) : ""}
                </Text>
              </Button>
            ) : null}
            {/* Money under the time limits: both say how much of an allowance is used. */}
            {hasMoneyRow(money) ? (
              // With no limits above it (Enterprise) the amounts go on a row of their own
              // under the bar, so the block stays narrow; otherwise all on one row.
              <Box flexDirection={showsLimits ? "row" : "column"}>
                <Text>
                  <Text dimColor>{money.label} </Text>
                  {meter(moneyPercent, MONEY_BAR_CELLS)}
                  {showsLimits ? <Text>{"  "}</Text> : null}
                </Text>
                <Text dimColor>
                  {money.spent === null
                    ? "–"
                    : formatMoney(money.spent, money.currency)}{" "}
                  / {formatMoney(money.limit ?? 0, money.currency)}
                </Text>
              </Box>
            ) : null}
          </Box>
          {renderRobot(el, {
            isWorking: p.isWorking,
            frame: p.frame,
            now: p.now,
          })}
        </Box>
      </Box>

      <Box>
        {/* Session cost and credits on the left, keep-alive's spend from the token column on. */}
        <Box width={KEEP_ALIVE_COLUMN} columnGap={3}>
          <Button key="k-session" plain onPress={() => p.onToggle("session")}>
            {/* The same label width as context and cache: the amount sits under their values. */}
            {label("session")}
            <Text bold underline>
              {usd(p.snap.usd)}
            </Text>
          </Button>
          {money.balance === null ? null : (
            <Text>
              <Text dimColor>credits </Text>
              {formatMoney(money.balance, money.currency)}
            </Text>
          )}
        </Box>
        {/* What keep-alive has sent and cost; nothing until its first request. */}
        {p.keepAlive.pings === 0 ? null : (
          <Text dimColor>
            keep-alive {p.keepAlive.pings}× {usd(p.keepAlive.usd)}
          </Text>
        )}
      </Box>
    </Box>
  );
}
