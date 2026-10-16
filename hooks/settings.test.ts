import { expect, test } from "claude-code/testing";

import { asMarkdown } from "./memory";

const breakdown = {
  model: "Opus 5.5",
  memoryFiles: [
    { path: "D:/x/CLAUDE.md", type: "Project", tokens: 2000 },
    { path: "D:/x/.claude/rules/api.md", type: "Project", tokens: 300 },
    { path: "D:/x/docs/constitution.md", type: "Project", tokens: 900 },
    { path: "C:/home/.claude/memory/MEMORY.md", type: "AutoMem", tokens: 400 },
  ],
  mcpTools: [],
};

test("the settings pane draws its four sections with real-looking settings", async ($, on) => {
  on(
    "process.run",
    async () =>
      ({
        value: {
          exitCode: 1,
          stdout: "",
          stderr: "",
          isStdoutTruncated: false,
          isStderrTruncated: false,
        },
      }) as never,
  );
  on(
    "session.usage",
    async () =>
      ({
        value: {
          startedAt: 0,
          context: { tokens: 1000, window: 200_000, percent: 1, breakdown },
          rateLimits: [],
          cost: { usd: 0 },
        },
      }) as never,
  );
  on("session.cwd", async () => ({ value: "D:/x" }));
  on("session.authorize", async () => ({ value: null }));
  on("env.get", async (_$, e) => ({
    value: e.name === "USERPROFILE" ? "C:/home" : undefined,
  }));
  on("fs.read", async (_$, e) => ({
    value: e.path.endsWith("installed_plugins.json")
      ? JSON.stringify({
          plugins: {
            "panel@me": [{ version: "1.3.0", installPath: "C:/p/panel" }],
          },
        })
      : e.path.endsWith("hooks.json")
        ? '{ "modules": ["./register.tsx"] }'
        : e.path.replaceAll("\\", "/").endsWith("x/CLAUDE.md")
          ? "# Title\n@docs/constitution.md"
          : "# Title\nline",
  }));
  on(
    "fs.stat",
    async () =>
      ({
        value: { kind: "file", size: 1, mtimeMs: 1, isLink: false },
      }) as never,
  );
  on("fs.list", async () => ({ value: [] }) as never);
  on(
    "settings.read",
    async (_$, e) =>
      ({
        value:
          e.source === "project"
            ? {
                hooks: {
                  PreToolUse: [
                    {
                      matcher: "Bash",
                      hooks: [{ type: "command", command: "node guard.mjs" }],
                    },
                  ],
                },
              }
            : e.source === "user"
              ? { enabledPlugins: { "panel@me": true } }
              : {},
      }) as never,
  );
  on("clock.now", async () => ({ value: 1000 }));
  on("store.get", async () => ({ value: undefined }));
  on("store.set", async () => ({ value: undefined }));
  on("clock.every", async () => ({ value: undefined }));
  on("session.start", async () => ({ cwd: "D:/x" }));
  await $.session.start({ cwd: "D:/x" } as never);

  const pane = await $.ui.mount({
    plugin: "status-panel",
    surface: "terminal",
    component: "Pane",
    requestId: "memory",
    props: {
      title: "Settings",
      isFocused: false,
      bodyColumns: 96,
      placement: "dock",
      scroll: { offset: 0, bodyRows: 40 },
    },
  } as never);

  expect(await pane.find({ text: /RULES/ })).toBeDefined();
  // Auto memory has a section of its own.
  expect(await pane.find({ text: /^MEMORY 1$/ })).toBeDefined();
  expect(await pane.find({ text: /node guard\.mjs/ })).toBeDefined();
  expect(await pane.find({ text: /panel@me/ })).toBeDefined();
  // Pulled in by CLAUDE.md with @docs/constitution.md: shown under it, naming the importer.
  expect(
    await pane.find({ text: /↳ docs.constitution.md ← CLAUDE.md/ }),
  ).toBeDefined();
});

test("asMarkdown turns a leading frontmatter block into a yaml fence", () => {
  expect(asMarkdown("---\nname: x\n---\n# Title")).toBe(
    "```yaml\nname: x\n```\n# Title",
  );
  expect(asMarkdown("# Plain")).toBe("# Plain");
});

test("asMarkdown keeps tables raw by fencing them, but not tables already in a fence", () => {
  expect(asMarkdown("# T\n| a | b |\n|---|---|\n| 1 | 2 |\ntext")).toBe(
    "# T\n```\n| a | b |\n|---|---|\n| 1 | 2 |\n```\ntext",
  );
  expect(asMarkdown("| a |\n| - |")).toBe("```\n| a |\n| - |\n```");
  expect(asMarkdown("```md\n| a |\n```")).toBe("```md\n| a |\n```");
});
