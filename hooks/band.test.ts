import { expect, test } from "claude-code/testing";

import { green } from "./format";
import type { TestBody } from "claude-code/testing";

type Engine = Parameters<TestBody>[0];
type On = Parameters<TestBody>[1];

const props = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 30,
  bodyColumns: 120,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
};

const breakdown = {
  model: "Opus 5.5",
  memoryFiles: [{ path: "D:/x/CLAUDE.md", type: "Project", tokens: 2000 }],
  mcpTools: [],
  skills: {
    totalSkills: 1,
    includedSkills: 1,
    tokens: 100,
    skillFrontmatter: [{ name: "deploy", source: "userSettings", tokens: 100 }],
  },
};

const fiveHourResetsAt = new Date(2026, 9, 12, 19, 30);

/** Answers everything the mod calls at startup, starts the session and renders the band. */
async function mountBand(
  $: Engine,
  on: On,
  runs: string[] = [],
  answer: (argv: readonly string[]) => string | null = () => null,
  /** Body of `api/oauth/usage`; without it the session has no account to ask. */
  usage?: string,
  /** Content of `~/.claude.json`; without it the plan stays unknown (personal). */
  claudeJson?: string,
  /** One agent definition in the project's .claude/agents; without it there are none. */
  agentMd?: string,
) {
  on("process.run", async (_$, e) => {
    runs.push(JSON.stringify(e));
    const stdout = answer(e.argv);

    return {
      value: {
        exitCode: stdout === null ? 1 : 0,
        stdout: stdout ?? "",
        stderr: "",
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    };
  });
  on(
    "session.usage",
    async () =>
      ({
        value: {
          startedAt: 0,
          context: { tokens: 1000, window: 200_000, percent: 1, breakdown },
          rateLimits: [
            {
              kind: "five_hour",
              percentUsed: 31,
              resetsAt: fiveHourResetsAt.toISOString(),
            },
          ],
          cost: { usd: 0 },
        },
      }) as never,
  );
  on("session.cwd", async () => ({ value: "D:/x" }));
  on("session.authorize", async () => ({
    value: usage === undefined ? null : { handle: "h", kind: "bearer" },
  }));
  on("http.fetch", async () => ({
    value: { status: 200, ok: true, headers: {}, text: usage ?? "" },
  }));
  on("env.get", async (_$, e) => ({
    value:
      claudeJson !== undefined && e.name === "USERPROFILE"
        ? "D:/home"
        : undefined,
  }));
  on("fs.read", async (_$, e) => ({
    value: e.path.endsWith(".md") ? (agentMd ?? "") : (claudeJson ?? ""),
  }));
  on(
    "fs.list",
    async (_$, e) =>
      ({
        value:
          agentMd !== undefined &&
          e.path.replaceAll("\\", "/") === "D:/x/.claude/agents"
            ? [
                {
                  name: "reviewer.md",
                  // ~/.claude/agents often holds symbolic links, listed as `other`.
                  kind: "other",
                  size: 1,
                  mtimeMs: 0,
                  isLink: false,
                },
              ]
            : [],
      }) as never,
  );
  on("clock.now", async () => ({
    value: fiveHourResetsAt.getTime() - 90 * 60_000,
  }));
  on("store.get", async () => ({ value: undefined }));
  on("store.set", async () => ({ value: undefined }));
  on("clock.every", async () => ({ value: undefined }));
  on("session.start", async () => ({ cwd: "D:/x" }));
  await $.session.start({ cwd: "D:/x" } as never);

  return $.ui.mount({
    plugin: "status-panel",
    surface: "terminal",
    component: "AbovePrompt",
    props,
  });
}

test("a personal plan without a known extra usage limit hides the money row", async ($, on) => {
  const ui = await mountBand($, on);

  const line = await ui.find({ text: /extra .* \/ [0-9]/ });

  expect(line).toBeUndefined();
});

test("the session cost always shows", async ($, on) => {
  const ui = await mountBand($, on);

  const session = await ui.find({ key: "k-session" });

  expect(session).toBeDefined();
});

test("an Enterprise account shows its monthly spend and hides the 5h and 7d limits", async ($, on) => {
  const claudeJson = JSON.stringify({
    oauthAccount: {
      organizationType: "claude_enterprise",
      organizationUuid: "e",
    },
  });
  const ui = await mountBand($, on, [], () => null, undefined, claudeJson);

  const month = await ui.find({ text: /month/ });
  const limit = await ui.find({ key: "k-5h" });

  expect(month).toBeDefined();
  expect(limit).toBeUndefined();
});

test("a personal plan shows extra usage and credits the account reports", async ($, on) => {
  const usd = (cents: number) => ({ amount_minor: cents, exponent: 2 });
  const usage = JSON.stringify({
    spend: {
      used: usd(300),
      limit: usd(2000),
      balance: usd(550),
      enabled: true,
    },
  });
  const ui = await mountBand($, on, [], () => null, usage);

  const line = await ui.find({ text: /extra .* 15%  3\.00\$ \/ 20\.00\$/ });
  const credits = await ui.find({ text: /credits 5\.50\$/ });

  expect(line).toBeDefined();
  expect(credits).toBeDefined();
});

test("pressing CLAUDE.md opens its pane and opens no file", async ($, on) => {
  const runs: string[] = [];
  const opened: string[] = [];
  on("ui.panes", async () => ({ value: [] }) as never);
  on("ui.open", async (_$, e) => {
    opened.push(e.id);

    return { value: { isPlaced: true } } as never;
  });
  const ui = await mountBand($, on, runs);
  runs.length = 0;

  await ui.press({ key: "k-claude" });

  expect(runs).toEqual([]);
  expect(opened).toEqual(["memory"]);
});

test("pressing a file in the CLAUDE.md pane shows its text and opens nothing", async ($, on) => {
  const runs: string[] = [];
  const ui = await mountBand(
    $,
    on,
    runs,
    () => null,
    undefined,
    undefined,
    "# Rules\nAlways write tests first.",
  );
  const pane = await $.ui.mount({
    plugin: "status-panel",
    surface: "terminal",
    component: "Pane",
    requestId: "memory",
    props: {
      title: "CLAUDE.md",
      isFocused: false,
      bodyColumns: 96,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 30 },
    },
  } as never);
  runs.length = 0;
  const before = await pane.find({ text: /Always write tests first/ });

  await pane.press({ key: "m:D:/x/CLAUDE.md" });

  expect(ui).toBeDefined();
  expect(before).toBeUndefined();
  expect(await pane.find({ text: /Always write tests first/ })).toBeDefined();
  expect(runs).toEqual([]);
});

test("the reset time of a limit shows only after pressing the limit", async ($, on) => {
  const ui = await mountBand($, on);
  const before = await ui.find({ text: /\[19:30\]/ });

  await ui.press({ key: "k-5h" });

  expect(before).toBeUndefined();
  expect(await ui.find({ text: /\[19:30\]/ })).toBeDefined();
});

test("an open pull request of the branch shows as a PR#n link after the branch", async ($, on) => {
  const url = "https://github.com/o/r/pull/7";
  const ui = await mountBand($, on, [], (argv) =>
    argv[0] === "gh"
      ? JSON.stringify({ number: 7, url, state: "OPEN" })
      : argv.includes("--show-current")
        ? "feat/x\n"
        : null,
  );

  const link = await ui.find({ text: /PR#7/ });

  expect(link).toBeDefined();
});

test("on Azure DevOps the pull request is looked up with az", async ($, on) => {
  const ui = await mountBand($, on, [], (argv) =>
    argv.includes("get-url")
      ? "https://org@dev.azure.com/org/proj/_git/repo\n"
      : argv.includes("repos")
        ? JSON.stringify([
            {
              pullRequestId: 5541,
              repository: {
                webUrl: "https://dev.azure.com/org/proj/_git/repo",
              },
            },
          ])
        : argv.includes("--show-current")
          ? "feat/x\n"
          : null,
  );

  const link = await ui.find({ text: /PR#5541/ });

  expect(link).toBeDefined();
});

test("without a pull request no PR link is shown", async ($, on) => {
  const ui = await mountBand($, on, [], (argv) =>
    argv.includes("--show-current") ? "main\n" : null,
  );

  const link = await ui.find({ text: /PR#/ });

  expect(link).toBeUndefined();
});

test("the context shows its tokens with the window in brackets", async ($, on) => {
  const ui = await mountBand($, on);

  const line = await ui.find({ text: /1k \[200k\]/ });

  expect(line).toBeDefined();
});

test("pressing the word cache switches keep-alive on and turns its dot green", async ($, on) => {
  const ui = await mountBand($, on);

  await ui.press({ key: "k-keep" });

  // Only the dot's own Text holds exactly " ●"; its parents hold more.
  const dot = await ui.find({ text: /^ ●$/ });
  expect(dot?.props?.color).toBe(green);
});

test("the CLAUDE.md button label is no file name a terminal would turn into a link", async ($, on) => {
  const ui = await mountBand($, on);

  const plain = await ui.find({ text: /CLAUDE\.md/ });

  expect(plain).toBeUndefined();
});

test("pressing the behind arrow fast-forwards the branch with git pull --ff-only", async ($, on) => {
  const runs: string[] = [];
  const ui = await mountBand($, on, runs, (argv) =>
    argv.includes("--show-current")
      ? "main\n"
      : argv.includes("--left-right")
        ? "5\t0\n"
        : argv.includes("pull")
          ? ""
          : null,
  );
  runs.length = 0;

  await ui.press({ key: "k-pull" });

  expect(runs.some((r) => r.includes('"pull","--ff-only"'))).toBe(true);
});

test("pressing the session cost opens the session pane instead of a list in the band", async ($, on) => {
  const opened: string[] = [];
  on("ui.panes", async () => ({ value: [] }) as never);
  on("ui.open", async (_$, e) => {
    opened.push(e.id);

    return { value: { isPlaced: true } } as never;
  });
  const ui = await mountBand($, on);

  await ui.press({ key: "k-session" });

  expect(opened).toEqual(["session"]);
});

test("pressing a subagent in the session pane shows its request", async ($, on) => {
  on("agent.spawn", async () => ({ model: "haiku", agentId: "a1" }));
  await mountBand($, on);
  await $.agent.spawn({
    prompt: "Count the ADR files",
    description: "Count ADRs",
    subagentType: "Explore",
  } as never);
  const pane = await $.ui.mount({
    plugin: "status-panel",
    surface: "terminal",
    component: "Pane",
    requestId: "session",
    props: {
      title: "Session",
      isFocused: false,
      bodyColumns: 96,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 30 },
    },
  } as never);
  const before = await pane.find({ text: /Count the ADR files/ });

  await pane.press({ key: "a:a1" });

  expect(before).toBeUndefined();
  expect(await pane.find({ text: /Count the ADR files/ })).toBeDefined();
});

test("a subagent whose definition has a color gets a dot in that color", async ($, on) => {
  on("agent.spawn", async () => ({ model: "haiku", agentId: "a1" }));
  await mountBand(
    $,
    on,
    [],
    () => null,
    undefined,
    undefined,
    "---\nname: reviewer\ncolor: blue\n---\nBody",
  );
  await $.agent.spawn({
    prompt: "Review it",
    description: "Review",
    subagentType: "reviewer",
  } as never);
  const pane = await $.ui.mount({
    plugin: "status-panel",
    surface: "terminal",
    component: "Pane",
    requestId: "session",
    props: {
      title: "Session",
      isFocused: false,
      bodyColumns: 96,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 30 },
    },
  } as never);

  const dot = await pane.find({ text: /●/ });

  expect(dot).toBeDefined();
});

test("clear drops the finished subagents and keeps the running ones", async ($, on) => {
  let next = 0;
  on("agent.spawn", async () => ({ model: "haiku", agentId: `a${++next}` }));
  on("turn.complete", async () => ({ text: "All done" }));
  await mountBand($, on);
  for (const description of ["Finished one", "Running one"]) {
    await $.agent.spawn({
      prompt: description,
      description,
      subagentType: "Explore",
    } as never);
  }
  await $.turn.complete({
    answer: "All done",
    durationMs: 1000,
    isAborted: false,
    turnId: "t1",
    agentId: "a1",
    reason: "answer",
  } as never);
  const pane = await $.ui.mount({
    plugin: "status-panel",
    surface: "terminal",
    component: "Pane",
    requestId: "session",
    props: {
      title: "Session",
      isFocused: false,
      bodyColumns: 96,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 30 },
    },
  } as never);

  await pane.press({ key: "k-clear-agents" });

  expect(await pane.find({ text: /Finished one/ })).toBeUndefined();
  expect(await pane.find({ text: /Running one/ })).toBeDefined();
  // The summary still counts both spawned subagents.
  expect(await pane.find({ text: /Σ subagents 2 spawned/ })).toBeDefined();
});

test("pressing MCP opens the MCP & skills pane", async ($, on) => {
  const opened: string[] = [];
  on("ui.panes", async () => ({ value: [] }) as never);
  on("ui.open", async (_$, e) => {
    opened.push(e.id);

    return { value: { isPlaced: true } } as never;
  });
  const ui = await mountBand($, on);

  await ui.press({ key: "k-mcp" });

  expect(opened).toEqual(["tools"]);
});

test("opening the MCP pane closes an open session pane", async ($, on) => {
  const closed: string[] = [];
  on("ui.panes", async () => ({ value: [{ id: "session" }] }) as never);
  on("ui.close", async (_$, e) => {
    closed.push(e.id);

    return { value: undefined } as never;
  });
  on("ui.open", async () => ({ value: { isPlaced: true } }) as never);
  const ui = await mountBand($, on);

  await ui.press({ key: "k-mcp" });

  expect(closed).toEqual(["session"]);
});

test("pressing a skill's switch writes it off to the project's local settings", async ($, on) => {
  const writes: { path: string; text: string }[] = [];
  on("fs.write", async (_$, e) => {
    writes.push({ path: e.path.replaceAll("\\", "/"), text: e.text });

    return { value: undefined } as never;
  });
  await mountBand($, on);
  const pane = await $.ui.mount({
    plugin: "status-panel",
    surface: "terminal",
    component: "Pane",
    requestId: "tools",
    props: {
      title: "MCP & skills",
      isFocused: false,
      bodyColumns: 96,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 30 },
    },
  } as never);

  await pane.press({ key: "t:skill:deploy" });

  expect(writes).toEqual([
    {
      path: "D:/x/.claude/settings.local.json",
      text: '{\n  "skillOverrides": {\n    "deploy": "off"\n  }\n}\n',
    },
  ]);
});

test("on Enterprise the spent amount and budget sit on their own row under the bar", async ($, on) => {
  const claudeJson = JSON.stringify({
    oauthAccount: {
      organizationType: "claude_enterprise",
      organizationUuid: "e",
    },
  });
  const ui = await mountBand($, on, [], () => null, undefined, claudeJson);

  // The bar row ends at the percentage; the amounts are a Text of their own.
  const amounts = await ui.find({ text: /^0\.00\$ \/ 250\.00\$$/ });

  expect(amounts).toBeDefined();
});
