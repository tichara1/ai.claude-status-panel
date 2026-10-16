import type { ElementTable } from "claude-code";

import type { MemFile } from "../types";
import type { HookRow, ModRow, SettingsScope } from "./context";
import {
  ago,
  cutLeft,
  cutRight,
  isRule,
  nestImports,
  sortByLoadOrder,
} from "./context";
import type { NestedFile } from "./context";
import { baseName, noLink, shortPath, tokens } from "./format";

/** Line count and modification time of a memory file, read when the context refreshes. */
export type FileDetail = {
  lines: number;
  mtimeMs: number;
  /** Files it imports with `@path`, resolved. */
  imports: string[];
};

export type MemoryProps = {
  /** Width of the pane body. */
  columns: number;
  cwd: string;
  now: number;
  /** Every memory file in context: CLAUDE.md, AGENTS.md, rules, auto memory. */
  files: readonly MemFile[];
  details: Readonly<Record<string, FileDetail>>;
  hooks: readonly HookRow[];
  /** Installed plugins that bring a hooks module, in load order. */
  mods: readonly ModRow[];
  /** The settings file of each source, for the hooks' `↗ open`; absent when unknown. */
  settingsPaths: Readonly<Partial<Record<SettingsScope, string>>>;
  /** Files whose preview is open. */
  expanded: readonly string[];
  /** File text by path, read when its preview opened. */
  previews: Readonly<Record<string, string>>;
  onToggle: (path: string) => void;
  /** Opens the folder a file is in. */
  onOpenFolder: (path: string) => void;
};

/**
 * A file's text as markdown: a leading `---` frontmatter block becomes a yaml fence,
 * and each table (a run of lines starting with `|`) outside a fence becomes a plain
 * fence, so it shows as written instead of being drawn as a table.
 */
export const asMarkdown = (text: string) =>
  rawTables(
    text.replace(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/, "```yaml\n$1\n```\n"),
  );

function rawTables(text: string) {
  const out: string[] = [];
  let fence: string | undefined;
  let table = false;
  for (const line of text.split(/\r?\n/)) {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    const isRow = fence === undefined && /^\s*\|/.test(line);
    if (table && !isRow) {
      out.push("```");
      table = false;
    }
    if (marker !== undefined) {
      if (fence === undefined) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = undefined;
    } else if (isRow && !table) {
      out.push("```");
      table = true;
    }
    out.push(line);
  }
  if (table) out.push("```");
  return out.join("\n");
}

/** Fixed column widths; the first column takes the rest of the row. */
const SCOPE = 9;
const LINES = 7;
const TOKENS = 8;
const MODIFIED = 10;
const OPEN = 7;

/** The settings pane: CLAUDE.md, RULES, HOOKS and MODS tables, each in load order (a later row overrides). */
export function renderMemory(el: ElementTable, p: MemoryProps) {
  const { Box, Button, Markdown, Text } = el;
  const width = Math.max(40, p.columns - 2);
  const nameWidth = width - SCOPE - LINES - TOKENS - MODIFIED - OPEN;
  const ordered = sortByLoadOrder(p.files);
  const importsByPath = Object.fromEntries(
    Object.entries(p.details).map(([path, d]) => [path, d.imports]),
  );
  const isAutoMemory = (f: MemFile) => f.type === "AutoMem";
  const memory = ordered.filter((f) => !isRule(f.path) && !isAutoMemory(f));
  const autoMemory = ordered.filter((f) => !isRule(f.path) && isAutoMemory(f));
  const rules = ordered.filter((f) => isRule(f.path));

  const cell = (text: string, cells: number, isRight = false) =>
    isRight ? text.padStart(cells - 1).padEnd(cells) : text.padEnd(cells);

  const heading = (title: string, count: number) => (
    <Text bold>
      {title}
      <Text dimColor> {count}</Text>
    </Text>
  );

  const fileHeader = (
    <Text dimColor>
      {cell("  path", nameWidth)}
      {cell("scope", SCOPE)}
      {cell("lines", LINES, true)}
      {cell("tokens", TOKENS, true)}
      {cell("modified", MODIFIED, true)}
    </Text>
  );

  const fileRow = (n: NestedFile<MemFile>) => {
    const f = n.file;
    // Pulled in with `@path`: indented under the file that imports it, in another colour.
    const indent = n.depth === 0 ? "" : `${"  ".repeat(n.depth - 1)}↳ `;
    // The path comes first; the importer is named only where it still fits.
    const room = nameWidth - 2 - indent.length;
    const name = cutLeft(shortPath(f.path, p.cwd), Math.max(4, room - 1));
    const fullVia = n.importedBy === "" ? "" : ` ← ${baseName(n.importedBy)}`;
    const via = name.length + fullVia.length < room ? fullVia : "";
    const isOpen = p.expanded.includes(f.path);
    const detail = p.details[f.path];
    const text = p.previews[f.path];

    return (
      <Box key={f.path} flexDirection="column">
        <Box>
          {/* noLink: the terminal would turn a file name into a link that opens the file. */}
          <Button key={`m:${f.path}`} plain onPress={() => p.onToggle(f.path)}>
            <Text>
              {isOpen ? "▾ " : "▸ "}
              <Text dimColor>{indent}</Text>
              <Text
                bold={n.depth === 0}
                color={n.depth === 0 ? "suggestion" : "claude"}
              >
                {noLink(name)}
              </Text>
              <Text dimColor>
                {noLink(via).padEnd(Math.max(0, room - name.length))}
              </Text>
              <Text dimColor>{cell(f.type, SCOPE)}</Text>
              {cell(
                detail === undefined ? "–" : String(detail.lines),
                LINES,
                true,
              )}
              {cell(tokens(f.tokens), TOKENS, true)}
              <Text dimColor>
                {cell(ago(detail?.mtimeMs, p.now), MODIFIED, true)}
              </Text>
            </Text>
          </Button>
          <Button
            key={`o:${f.path}`}
            plain
            onPress={() => p.onOpenFolder(f.path)}
          >
            <Text dimColor underline>
              ↗ open
            </Text>
          </Button>
        </Box>
        {isOpen ? (
          // The text in its own dim frame, indented under the row, with an empty row after.
          <Box flexDirection="column" paddingLeft={4} paddingBottom={1}>
            <Box
              flexDirection="column"
              borderStyle="round"
              borderColor="subtle"
              paddingX={1}
              width={Math.max(20, width - 4)}
            >
              {text === undefined ? (
                <Text dimColor>reading…</Text>
              ) : (
                // The whole file, drawn as markdown: headings, emphasis, links, lists, code.
                <Markdown text={asMarkdown(text)} />
              )}
            </Box>
          </Box>
        ) : null}
      </Box>
    );
  };

  const files = (title: string, list: readonly MemFile[], empty: string) => (
    <Box flexDirection="column">
      {heading(title, list.length)}
      {list.length === 0 ? (
        <Text dimColor>{empty}</Text>
      ) : (
        <Box flexDirection="column">
          {fileHeader}
          {nestImports(list, importsByPath).map(fileRow)}
        </Box>
      )}
    </Box>
  );

  // Hooks: event, matcher, command, scope; the command takes what the others leave.
  const EVENT = 18;
  const MATCHER = 14;
  const commandWidth = width - EVENT - MATCHER - SCOPE - OPEN;
  const hookTable = (
    <Box flexDirection="column">
      {heading("HOOKS", p.hooks.length)}
      {p.hooks.length === 0 ? (
        <Text dimColor>No hook in the settings.</Text>
      ) : (
        <Box flexDirection="column">
          <Text dimColor>
            {cell("  event", EVENT)}
            {cell("matcher", MATCHER)}
            {cell("command", commandWidth)}
            {cell("scope", SCOPE)}
          </Text>
          {/* Not `h`: that is the JSX factory. */}
          {p.hooks.map((hook, i) => {
            const file = p.settingsPaths[hook.scope];

            return (
              <Box key={`h:${i}`}>
                <Text>
                  {"  "}
                  <Text bold>
                    {cell(cutRight(hook.event, EVENT - 3), EVENT - 2)}
                  </Text>
                  <Text dimColor>
                    {cell(
                      cutRight(
                        hook.matcher === "" ? "*" : hook.matcher,
                        MATCHER - 1,
                      ),
                      MATCHER,
                    )}
                  </Text>
                  {cell(cutRight(hook.command, commandWidth - 1), commandWidth)}
                  <Text dimColor>{cell(hook.scope, SCOPE)}</Text>
                </Text>
                {file === undefined ? null : (
                  <Button
                    key={`ho:${i}`}
                    plain
                    onPress={() => p.onOpenFolder(file)}
                  >
                    <Text dimColor underline>
                      ↗ open
                    </Text>
                  </Button>
                )}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );

  // Mods: plugin, version, the source that switches it, and whether it is on.
  const VERSION = 10;
  const STATE = 6;
  const modWidth = width - VERSION - SCOPE - STATE - OPEN;
  const modTable = (
    <Box flexDirection="column">
      {heading("MODS", p.mods.length)}
      {p.mods.length === 0 ? (
        <Text dimColor>No mod installed.</Text>
      ) : (
        <Box flexDirection="column">
          <Text dimColor>
            {cell("  plugin", modWidth)}
            {cell("version", VERSION)}
            {cell("scope", SCOPE)}
            {cell("state", STATE)}
          </Text>
          {p.mods.map((m) => (
            <Box key={`mod:${m.id}`}>
              <Text>
                {"  "}
                <Text bold={m.isOn} dimColor={!m.isOn}>
                  {cell(cutRight(m.id, modWidth - 3), modWidth - 2)}
                </Text>
                <Text dimColor>
                  {cell(m.version === "" ? "–" : m.version, VERSION)}
                </Text>
                <Text dimColor>
                  {cell(m.scope === "" ? "–" : m.scope, SCOPE)}
                </Text>
                <Text color={m.isOn ? "success" : undefined} dimColor={!m.isOn}>
                  {cell(m.isOn ? "on" : "off", STATE)}
                </Text>
              </Text>
              {m.path === "" ? null : (
                <Button
                  key={`mo:${m.id}`}
                  plain
                  onPress={() => p.onOpenFolder(`${m.path}/.`)}
                >
                  <Text dimColor underline>
                    ↗ open
                  </Text>
                </Button>
              )}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text dimColor>In load order: a later row overrides an earlier one.</Text>
      <Text> </Text>
      {files(
        noLink("CLAUDE.md"),
        memory,
        `No ${noLink("CLAUDE.md")} or ${noLink("AGENTS.md")} in context.`,
      )}
      <Text dimColor>{"─".repeat(width)}</Text>
      {files("RULES", rules, "No rules file in context.")}
      <Text dimColor>{"─".repeat(width)}</Text>
      {files("MEMORY", autoMemory, "No auto memory in context.")}
      <Text dimColor>{"─".repeat(width)}</Text>
      {hookTable}
      <Text dimColor>{"─".repeat(width)}</Text>
      {modTable}
    </Box>
  );
}
