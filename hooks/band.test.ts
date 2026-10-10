import { expect, test } from "claude-code/testing";
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
};

const fiveHourResetsAt = new Date(2026, 9, 12, 19, 30);

/** Answers everything the mod calls at startup, starts the session and renders the band. */
async function mountBand(
  $: Engine,
  on: On,
  runs: string[] = [],
  answer: (argv: readonly string[]) => string | null = () => null,
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
  on("env.get", async () => ({ value: undefined }));
  on("clock.now", async () => ({
    value: fiveHourResetsAt.getTime() - 90 * 60_000,
  }));
  on("store.get", async () => ({ value: undefined }));
  on("store.set", async () => ({ value: undefined }));
  on("clock.every", async () => ({ value: undefined }));
  on("session.version", async () => ({ value: { version: "" } }) as never);
  on("session.start", async () => ({ cwd: "D:/x" }));
  await $.session.start({ cwd: "D:/x" } as never);

  return $.ui.mount({
    plugin: "status-panel",
    surface: "terminal",
    component: "AbovePrompt",
    props,
  });
}

test("pressing CLAUDE.md expands the file list and opens nothing", async ($, on) => {
  const runs: string[] = [];
  const ui = await mountBand($, on, runs);
  runs.length = 0;

  await ui.press({ key: "k-claude" });

  expect(runs).toEqual([]);
  expect(await ui.find({ key: "o:D:/x/CLAUDE.md" })).toBeDefined();
});

test("the reset time of a limit shows only after pressing the limit", async ($, on) => {
  const ui = await mountBand($, on);
  const before = await ui.find({ text: /\[19:30\]/ });

  await ui.press({ key: "k-5h" });

  expect(before).toBeUndefined();
  expect(await ui.find({ text: /\[19:30\]/ })).toBeDefined();
});

test("an open pull request of the branch shows as a [PR] link after the branch", async ($, on) => {
  const url = "https://github.com/o/r/pull/7";
  const ui = await mountBand($, on, [], (argv) =>
    argv[0] === "gh"
      ? JSON.stringify({ number: 7, url, state: "OPEN" })
      : argv.includes("--show-current")
        ? "feat/x\n"
        : null,
  );

  const link = await ui.find({ text: /\[PR\]/ });

  expect(link).toBeDefined();
});

test("without a pull request no [PR] link is shown", async ($, on) => {
  const ui = await mountBand($, on, [], (argv) =>
    argv.includes("--show-current") ? "main\n" : null,
  );

  const link = await ui.find({ text: /\[PR\]/ });

  expect(link).toBeUndefined();
});
