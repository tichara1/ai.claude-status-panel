import type { ElementTable } from "claude-code";

import type { MemFile } from "../types";
import { noLink, shortPath, tokens } from "./format";

/** Lines of a file shown in its preview; the rest is counted, `↗ open` shows it whole. */
export const PREVIEW_LINES = 60;

export type MemoryProps = {
  /** Width of the pane body, for the preview frame. */
  columns: number;
  cwd: string;
  /** CLAUDE.md, CLAUDE.local.md and AGENTS.md files in context. */
  files: readonly MemFile[];
  /** Files whose preview is open. */
  expanded: readonly string[];
  /** File text by path, read when its preview opened; absent while it loads or failed. */
  previews: Readonly<Record<string, string>>;
  onToggle: (path: string) => void;
  /** Opens a file in the system. */
  onOpen: (path: string) => void;
};

/** The CLAUDE.md pane: one row per memory file; a click shows its text in an indented frame. */
export function renderMemory(el: ElementTable, p: MemoryProps) {
  const { Box, Button, Text } = el;

  if (p.files.length === 0) {
    return (
      <Box paddingX={1}>
        <Text dimColor>
          No {noLink("CLAUDE.md")} or {noLink("AGENTS.md")} in context.
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1}>
      {p.files.map((f) => {
        const isOpen = p.expanded.includes(f.path);
        const text = p.previews[f.path];
        const lines = text === undefined ? [] : text.split(/\r?\n/);
        const rest = lines.length - PREVIEW_LINES;

        return (
          <Box key={f.path} flexDirection="column">
            <Box columnGap={2}>
              {/* noLink: the terminal would turn a file name into a link that opens the file. */}
              <Button
                key={`m:${f.path}`}
                plain
                onPress={() => p.onToggle(f.path)}
              >
                <Text>
                  {isOpen ? "▾" : "▸"}{" "}
                  <Text bold color="suggestion">
                    {noLink(shortPath(f.path, p.cwd))}
                  </Text>
                  <Text dimColor>
                    {"  "}
                    {f.type} · {tokens(f.tokens)} tok
                  </Text>
                </Text>
              </Button>
              <Button
                key={`o:${f.path}`}
                plain
                onPress={() => p.onOpen(f.path)}
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
                  width={Math.max(20, p.columns - 6)}
                >
                  {text === undefined ? (
                    <Text dimColor>reading…</Text>
                  ) : (
                    <Text>{lines.slice(0, PREVIEW_LINES).join("\n")}</Text>
                  )}
                  {rest > 0 ? (
                    <Text dimColor>
                      … {rest} more lines · ↗ open shows the whole file
                    </Text>
                  ) : null}
                </Box>
              </Box>
            ) : null}
          </Box>
        );
      })}
    </Box>
  );
}
