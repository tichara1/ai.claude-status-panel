import { expect, test } from "claude-code/testing";

import {
  ago,
  cutLeft,
  cutRight,
  hookRows,
  importsOf,
  isRule,
  nestImports,
  pluginRows,
  sortByLoadOrder,
} from "./context";

test("sortByLoadOrder follows the scopes and goes from the root down", () => {
  const files = [
    { path: "D:/repo/app/CLAUDE.md", type: "Project", tokens: 1 },
    { path: "D:/repo/CLAUDE.local.md", type: "Local", tokens: 1 },
    { path: "C:/Users/me/.claude/CLAUDE.md", type: "User", tokens: 1 },
    { path: "D:/repo/CLAUDE.md", type: "Project", tokens: 1 },
    { path: "C:/ProgramData/ClaudeCode/CLAUDE.md", type: "Managed", tokens: 1 },
  ];

  expect(sortByLoadOrder(files).map((f) => f.path)).toEqual([
    "C:/ProgramData/ClaudeCode/CLAUDE.md",
    "C:/Users/me/.claude/CLAUDE.md",
    "D:/repo/CLAUDE.md",
    "D:/repo/app/CLAUDE.md",
    "D:/repo/CLAUDE.local.md",
  ]);
});

test("isRule recognises files in a .claude/rules folder", () => {
  expect([
    isRule("D:\\repo\\.claude\\rules\\api.md"),
    isRule("D:/repo/CLAUDE.md"),
  ]).toEqual([true, false]);
});

test("hookRows lists every command of a hooks block with its matcher", () => {
  const hooks = {
    PreToolUse: [
      {
        matcher: "Bash",
        hooks: [{ type: "command", command: "node guard.mjs" }],
      },
    ],
    Stop: [{ hooks: [{ type: "command", command: "say done" }] }],
    Broken: "nope",
  };

  expect(hookRows("project", hooks)).toEqual([
    {
      scope: "project",
      event: "PreToolUse",
      matcher: "Bash",
      command: "node guard.mjs",
    },
    { scope: "project", event: "Stop", matcher: "", command: "say done" },
  ]);
  expect(hookRows("user", undefined)).toEqual([]);
});

test("ago, cutLeft and cutRight format the table cells", () => {
  const now = 10 * 24 * 3_600_000;

  expect([
    ago(now - 30_000, now),
    ago(now - 5 * 60_000, now),
    ago(now - 3 * 3_600_000, now),
    ago(now - 3 * 24 * 3_600_000, now),
    ago(undefined, now),
  ]).toEqual(["just now", "5m ago", "3h ago", "3d ago", "–"]);
  expect([
    cutLeft("abcdef", 4),
    cutRight("abcdef", 4),
    cutLeft("ab", 4),
  ]).toEqual(["…def", "abc…", "ab"]);
});

test("pluginRows takes version and folder from the install list and state from the last source", () => {
  const installed = JSON.stringify({
    version: 2,
    plugins: {
      "panel@me": [{ version: "1.3.0", installPath: "C:/p/panel" }],
      "old@me": [{ version: "0.1.0", installPath: "C:/p/old" }],
    },
  });

  expect(
    pluginRows(installed, [
      ["user", { "panel@me": true, "old@me": true }],
      ["project", { "old@me": false }],
    ]),
  ).toEqual([
    {
      id: "panel@me",
      version: "1.3.0",
      scope: "user",
      isOn: true,
      path: "C:/p/panel",
    },
    {
      id: "old@me",
      version: "0.1.0",
      scope: "project",
      isOn: false,
      path: "C:/p/old",
    },
  ]);
});

test("importsOf resolves @ references relative to the file, skipping code fences", () => {
  const text = [
    "# Project",
    "@docs/constitution.md",
    "See @./docs/domain/glossary.md and @~/notes.md",
    "```",
    "@not/this.md",
    "```",
  ].join("\n");

  expect(importsOf(text, "D:\\repo\\CLAUDE.md", "C:\\Users\\me")).toEqual([
    "D:/repo/docs/constitution.md",
    "D:/repo/docs/domain/glossary.md",
    "C:/Users/me/notes.md",
  ]);
});

test("nestImports puts imported files under their importer", () => {
  const files = [
    { path: "D:\\repo\\CLAUDE.md" },
    { path: "D:\\repo\\docs\\constitution.md" },
    { path: "D:\\repo\\CLAUDE.local.md" },
  ];

  expect(
    nestImports(files, {
      "D:\\repo\\CLAUDE.md": ["D:/repo/docs/constitution.md"],
    }).map((n) => [n.file.path, n.depth, n.importedBy]),
  ).toEqual([
    ["D:\\repo\\CLAUDE.md", 0, ""],
    ["D:\\repo\\docs\\constitution.md", 1, "D:\\repo\\CLAUDE.md"],
    ["D:\\repo\\CLAUDE.local.md", 0, ""],
  ]);
});
