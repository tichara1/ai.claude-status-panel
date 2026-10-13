import { expect, test } from "claude-code/testing";

import {
  baseName,
  effortShort,
  serverCalls,
  parseAheadBehind,
  parsePullRequest,
  parseAzurePullRequest,
  azureWebUrl,
  isAzureRemote,
  planLabel,
  noLink,
  stepCost,
  stepCostParts,
  addCostParts,
  monthKey,
  missReason,
  groupMcp,
  addAgentStep,
  elapsed,
  agentStatus,
  accountFromClaudeJson,
  parseAccountSpend,
  moneyLine,
  thinBar,
  shortModel,
  countdown,
  percentOf,
  shortPath,
  red,
  green,
  resetAt,
  relIn,
  percentCell,
  scale,
  tokens,
  ttlScale,
} from "./format";

const at = (h: number, m: number) => new Date(2026, 9, 12, h, m).getTime();

test("relIn shows hours with one decimal, under an hour minutes", () => {
  expect([relIn(at(19, 30), at(18, 0)), relIn(at(19, 30), at(18, 45))]).toEqual(
    ["1.5h", "45m"],
  );
});

test("percentCell pads to four cells", () => {
  expect([percentCell(7), percentCell(31.4), percentCell(100)]).toEqual([
    "  7%",
    " 31%",
    "100%",
  ]);
});

test("resetAt shows weekday, date and time only", () => {
  expect(resetAt(at(8, 0))).toBe("[Mon 12.10. 08:00]");
});

test("scale runs green to red", () => {
  expect([scale(10), scale(60), scale(80), scale(95)]).toEqual([
    green,
    "#eab308",
    "#f97316",
    red,
  ]);
});

test("ttlScale turns red as the cache runs out", () => {
  expect(ttlScale(3_000, 60_000)).toBe(red);
});

test("countdown formats mm:ss and h:mm:ss", () => {
  expect([countdown(272_000), countdown(3_725_000)]).toEqual([
    "04:32",
    "1:02:05",
  ]);
});

test("tokens and percentOf", () => {
  expect([tokens(950), tokens(12_400), tokens(1_200_000)]).toEqual([
    "950",
    "12k",
    "1.2M",
  ]);
  expect(percentOf(90, 5, 5)).toBe(90);
  expect(percentOf(0, 0, 0)).toBeNull();
});

test("baseName and shortPath", () => {
  expect(baseName("C:\\Code\\Orca\\www-trainers")).toBe("www-trainers");
  expect(
    shortPath(
      "D:\\Code\\Orca\\www-trainers\\apps\\api\\CLAUDE.md",
      "D:\\Code\\Orca\\www-trainers",
    ),
  ).toBe("apps/api/CLAUDE.md");
  expect(shortPath("C:\\Users\\me\\.claude\\CLAUDE.md", "D:\\Code\\x")).toBe(
    "…/me/.claude/CLAUDE.md",
  );
});

test("effortShort abbreviates levels", () => {
  expect([
    effortShort("low"),
    effortShort("medium"),
    effortShort("high"),
    effortShort("xhigh"),
    effortShort("max"),
    effortShort(undefined),
    effortShort(8000),
  ]).toEqual(["L", "M", "H", "XH", "MAX", "–", "8k"]);
});

test("serverCalls sums an MCP server by its wire name", () => {
  expect(
    serverCalls(
      {
        mcp__claude_ai_Claude_Docs__read: 2,
        mcp__claude_ai_Claude_Docs__create: 1,
        Bash: 5,
      },
      "claude.ai Claude Docs",
    ),
  ).toBe(3);
});

test("parseAheadBehind reads behind then ahead", () => {
  expect(parseAheadBehind("1\t3\n")).toEqual({ behind: 1, ahead: 3 });
  expect(parseAheadBehind("")).toBeNull();
});

test("planLabel names the subscription", () => {
  expect(planLabel("claude_max", "default_claude_max_5x")).toBe("Max 5x");
  expect(planLabel("claude_pro", undefined)).toBe("Pro");
  expect(planLabel(undefined, undefined)).toBe("API");
});

test("noLink swaps dots for a lookalike so terminals do not linkify file names", () => {
  expect(noLink(".claude/CLAUDE.md")).toBe("․claude/CLAUDE․md");
});

test("stepCost prices a request by model and cache TTL", () => {
  const u = {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
  expect(stepCost("claude-opus-5-5", u, 60)).toBe(24);
  expect(stepCost("claude-opus-5", u, 60)).toBe(30);
  expect(stepCost("claude-sonnet-5-5[1m]", u, 60)).toBe(12);
  expect(
    Math.round(
      (stepCost(
        "claude-haiku-5-5",
        {
          ...u,
          input_tokens: 0,
          output_tokens: 0,
          cache_creation_input_tokens: 1_000_000,
        },
        5,
      ) ?? 0) * 1000,
    ),
  ).toBe(125);
  expect(stepCost("gpt-x", u, 60)).toBeNull();
});

test("monthKey keys spend by local month and organization", () => {
  expect(monthKey(new Date(2026, 9, 12).getTime(), "org1")).toBe(
    "spend:2026-10:org1",
  );
});

test("missReason prefers a gap over TTL when nothing else changed", () => {
  const base = {
    isCompacted: false,
    total: 100,
    prevTotal: 100,
    model: "m",
    prevModel: "m",
    isEffortChanged: false,
    gapMs: 7 * 60_000,
    ttlMs: 5 * 60_000,
  };
  expect(missReason(base)).toBe("idle 7 min (TTL 5 min), cache expired");
  expect(missReason({ ...base, gapMs: 700 * 60_000, ttlMs: 60 * 60_000 })).toBe(
    "idle 11.7 h (TTL 1.0 h), cache expired",
  );
  expect(missReason({ ...base, model: "x" })).toBe("model changed (x)");
});

test("groupMcp counts tools per server", () => {
  expect(
    groupMcp([
      { serverName: "a", isLoaded: true, tokens: 10 },
      { serverName: "a", isLoaded: false, tokens: 5 },
    ]),
  ).toEqual([{ server: "a", tools: 2, loaded: 1, tokens: 15 }]);
});

test("addAgentStep sums all tokens and keeps an unpriced agent unpriced", () => {
  const u = {
    input_tokens: 1,
    output_tokens: 2,
    cache_read_input_tokens: 3,
    cache_creation_input_tokens: 4,
  };
  const first = addAgentStep(undefined, "m", u, 0.5);
  expect(first).toEqual({
    model: "m",
    tokens: 10,
    usd: 0.5,
    durationMs: 0,
    isDone: false,
    effort: "–",
  });
  expect(addAgentStep(first, "m", u, 0.5, "H").effort).toBe("H");
  expect(addAgentStep(first, "m", u, null).usd).toBeNull();
});

test("accountFromClaudeJson reads the plan and that a Max plan is not usage based", () => {
  expect(
    accountFromClaudeJson(
      '{"oauthAccount":{"organizationUuid":"o","organizationType":"claude_max","organizationRateLimitTier":"default_claude_max_5x"}}',
    ),
  ).toEqual({ plan: "Max 5x", orgId: "o", isUsageBased: false });
  expect(accountFromClaudeJson("{oops")).toBeNull();
});

test("accountFromClaudeJson marks an Enterprise seat as usage based", () => {
  const account = accountFromClaudeJson(
    '{"oauthAccount":{"organizationUuid":"e","organizationType":"claude_enterprise"}}',
  );

  expect(account?.isUsageBased).toBe(true);
});

test("parseAccountSpend converts minor units to dollars", () => {
  const text = JSON.stringify({
    spend: {
      used: { amount_minor: 1234, currency: "USD", exponent: 2 },
      limit: { amount_minor: 5000, currency: "USD", exponent: 2 },
      balance: { amount_minor: 750, currency: "USD", exponent: 2 },
      enabled: true,
    },
  });

  expect(parseAccountSpend(text)).toEqual({
    used: 12.34,
    limit: 50,
    balance: 7.5,
    isEnabled: true,
  });
});

test("parseAccountSpend returns null without a spend block or for broken JSON", () => {
  expect([
    parseAccountSpend('{"spend":null}'),
    parseAccountSpend("{oops"),
  ]).toEqual([null, null]);
});

const personal = { orgId: "p", isUsageBased: false };
const enterprise = { orgId: "e", isUsageBased: true };
const spend = { used: 3, limit: 20, balance: 5, isEnabled: true };

test("moneyLine on a personal plan shows only extra usage from the account", () => {
  expect(moneyLine(personal, spend, 99, 250)).toEqual({
    label: "extra",
    spent: 3,
    limit: 20,
    balance: 5,
    isOff: false,
  });
});

test("moneyLine on a personal plan never falls back to the local estimate", () => {
  expect(moneyLine(personal, null, 99, 250).spent).toBeNull();
});

test("moneyLine marks switched-off extra usage", () => {
  expect(
    moneyLine(personal, { ...spend, isEnabled: false }, 0, 250).isOff,
  ).toBe(true);
});

test("moneyLine on Enterprise without account figures uses the local estimate and budget", () => {
  expect(moneyLine(enterprise, null, 42, 250)).toEqual({
    label: "month",
    spent: 42,
    limit: 250,
    balance: null,
    isOff: false,
  });
});

test("moneyLine on Enterprise prefers the account's figures once reported", () => {
  const line = moneyLine(enterprise, { ...spend, limit: null }, 42, 250);

  expect([line.spent, line.limit]).toEqual([3, 250]);
});

test("thinBar splits filled and empty cells and caps at the width", () => {
  expect(thinBar(40, 5)).toEqual({ filled: "━━", empty: "───" });
  expect(thinBar(150, 3)).toEqual({ filled: "━━━", empty: "" });
});

test("relIn shows days and hours from a day up", () => {
  expect(relIn(at(19, 30) + (5 * 24 + 5) * 3_600_000, at(19, 30))).toBe("5d5h");
});

test("stepCostParts splits a request by token kind and addCostParts sums it", () => {
  const u = {
    input_tokens: 1_000_000,
    output_tokens: 1_000_000,
    cache_read_input_tokens: 1_000_000,
    cache_creation_input_tokens: 1_000_000,
  };
  const parts = stepCostParts("claude-opus-5-5", u, 60);
  expect(parts).toEqual({ input: 4, output: 20, read: 0.2, write: 8 });
  const zero = { input: 0, output: 0, read: 0, write: 0 };
  expect(addCostParts(zero, parts)).toEqual(parts);
  expect(addCostParts(zero, null)).toEqual(zero);
});

test("shortModel drops the claude- prefix", () => {
  expect([shortModel("claude-opus-5-5"), shortModel("opus")]).toEqual([
    "opus-5-5",
    "opus",
  ]);
});

test("elapsed formats seconds, minutes and hours", () => {
  expect([elapsed(5_000), elapsed(192_000), elapsed(3_900_000)]).toEqual([
    "5s",
    "3m12s",
    "1h05m",
  ]);
});

test("agentStatus shows done with duration, running with elapsed time, never NaN", () => {
  expect(
    agentStatus(0, { isDone: true, durationMs: 5_000 }, 60_000, 0),
  ).toEqual({ icon: "✅", text: "5s" });
  expect(agentStatus(0, { isDone: false, durationMs: 0 }, 80_000, 4)).toEqual({
    icon: "✻ ",
    text: "running 1m20s",
  });
  expect(agentStatus(undefined, {}, 80_000, 1)).toEqual({
    icon: "✢ ",
    text: "running",
  });
  expect(
    agentStatus(undefined, { isDone: true, durationMs: Number.NaN }, 80_000, 0),
  ).toEqual({ icon: "✅", text: "" });
});

test("parsePullRequest returns an open pull request", () => {
  const pr = parsePullRequest(
    '{"number":7,"state":"OPEN","url":"https://github.com/o/r/pull/7"}',
  );

  expect(pr).toEqual({ number: 7, url: "https://github.com/o/r/pull/7" });
});

test("parsePullRequest ignores a merged pull request", () => {
  const pr = parsePullRequest(
    '{"number":7,"state":"MERGED","url":"https://github.com/o/r/pull/7"}',
  );

  expect(pr).toBeNull();
});

test("parsePullRequest returns null for broken output", () => {
  expect(parsePullRequest("no pull requests found")).toBeNull();
});

test("isAzureRemote recognizes Azure DevOps over https and ssh, not GitHub", () => {
  expect(
    [
      "https://org@dev.azure.com/org/proj/_git/repo",
      "git@ssh.dev.azure.com:v3/org/proj/repo",
      "https://org.visualstudio.com/proj/_git/repo",
      "https://github.com/o/r.git",
    ].map(isAzureRemote),
  ).toEqual([true, true, true, false]);
});

test("parseAzurePullRequest links the first pull request to its web page", () => {
  const out = JSON.stringify([
    {
      pullRequestId: 5541,
      repository: { webUrl: "https://dev.azure.com/o/p/_git/r" },
    },
  ]);

  expect(parseAzurePullRequest(out, "")).toEqual({
    number: 5541,
    url: "https://dev.azure.com/o/p/_git/r/pullrequest/5541",
  });
});

test("parseAzurePullRequest without webUrl derives the page from origin", () => {
  const out = JSON.stringify([{ pullRequestId: 5541 }]);

  expect(
    parseAzurePullRequest(out, "git@ssh.dev.azure.com:v3/o/p/r\n")?.url,
  ).toBe("https://dev.azure.com/o/p/_git/r/pullrequest/5541");
});

test("azureWebUrl drops the user name and .git from an https remote", () => {
  expect(azureWebUrl("https://o@dev.azure.com/o/p/_git/r.git")).toBe(
    "https://dev.azure.com/o/p/_git/r",
  );
});

test("parseAzurePullRequest returns null for no pull request or broken output", () => {
  expect([
    parseAzurePullRequest("[]", ""),
    parseAzurePullRequest("oops", ""),
  ]).toEqual([null, null]);
});
