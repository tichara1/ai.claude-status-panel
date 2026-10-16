import type { ElementTable } from "claude-code";

import type { McpServer, SkillInfo } from "../types";
import {
  green,
  mcpTag,
  serverCalls,
  skillTag,
  sortByUse,
  tokens,
  yellow,
} from "./format";

export type ToolsProps = {
  /** Width of the pane body, for the right-aligned switches and the separator. */
  columns: number;
  mcp: readonly McpServer[];
  /** Calls per tool name (`mcp__server__tool`). */
  calls: Readonly<Record<string, number>>;
  skills: readonly SkillInfo[];
  /** Calls per skill name. */
  skillCalls: Readonly<Record<string, number>>;
  /** MCP servers switched off: listed after the active ones, drawn OFF. */
  disabledMcp: readonly string[];
  /** Skills switched off: listed after the active ones, drawn OFF. */
  disabledSkills: readonly string[];
  onToggleMcp?: (server: string) => void;
  onToggleSkill?: (skill: string) => void;
};

/** One row: name and details on the left, the ON/OFF switch at the right edge. */
type Row = {
  key: string;
  name: string;
  detail: string;
  isOn: boolean;
  /** `system`, `plugin`, `claude.ai`; empty for the person's own. */
  tag: string;
  onToggle?: () => void;
};

/** The MCP & skills pane: MCP servers, a separator, then skills; each list active first, most called first. */
export function renderTools(el: ElementTable, p: ToolsProps) {
  const { Box, Button, Text } = el;
  // The rows sit 1 cell in from each side of the pane body.
  const width = Math.max(20, p.columns - 2);

  const mcpRows: Row[] = sortByUse([
    ...p.mcp.map((s) => ({
      name: s.server,
      calls: serverCalls(p.calls, s.server),
      isOn: !p.disabledMcp.includes(s.server),
      detail: `${s.loaded}/${s.tools} tools · ${tokens(s.tokens)} tok`,
      tag: mcpTag(s.server),
    })),
    // A server switched off is no longer in the context: it is only named.
    ...p.disabledMcp
      .filter((name) => !p.mcp.some((s) => s.server === name))
      .map((name) => ({
        name,
        calls: 0,
        isOn: false,
        detail: "",
        tag: mcpTag(name),
      })),
  ]).map((r) => ({
    key: `mcp:${r.name}`,
    name: r.name,
    detail: `${r.calls} calls${r.detail === "" ? "" : ` · ${r.detail}`}`,
    isOn: r.isOn,
    tag: r.tag,
    onToggle:
      p.onToggleMcp === undefined ? undefined : () => p.onToggleMcp?.(r.name),
  }));

  const skillRows: Row[] = sortByUse([
    ...p.skills.map((s) => ({
      name: s.name,
      calls: p.skillCalls[s.name] ?? 0,
      isOn: !p.disabledSkills.includes(s.name),
      detail: `${s.source} · ${tokens(s.tokens)} tok`,
      tag: skillTag(s.source),
      // skillOverrides does not apply to a plugin's skills: no switch for them.
      isSwitchable: s.source !== "plugin",
    })),
    ...p.disabledSkills
      .filter((name) => !p.skills.some((s) => s.name === name))
      .map((name) => ({
        name,
        calls: 0,
        isOn: false,
        detail: "",
        tag: "",
        isSwitchable: true,
      })),
  ]).map((r) => ({
    key: `skill:${r.name}`,
    name: r.name,
    detail: `${r.calls} calls${r.detail === "" ? "" : ` · ${r.detail}`}`,
    isOn: r.isOn,
    tag: r.tag,
    onToggle:
      p.onToggleSkill === undefined || !r.isSwitchable
        ? undefined
        : () => p.onToggleSkill?.(r.name),
  }));

  const row = (r: Row) => (
    <Box key={r.key} justifyContent="space-between" width={width}>
      <Text>
        <Text bold={r.isOn} dimColor={!r.isOn}>
          {r.name}
        </Text>
        {r.tag === "" ? null : (
          <Text
            color={r.tag === "system" ? yellow : undefined}
            dimColor={r.tag !== "system"}
          >
            {" "}
            [{r.tag}]
          </Text>
        )}
        <Text dimColor> {r.detail}</Text>
      </Text>
      {r.onToggle === undefined ? (
        <Text dimColor={!r.isOn} color={r.isOn ? green : undefined}>
          {r.isOn ? " ON" : "OFF"}
        </Text>
      ) : (
        <Button key={`t:${r.key}`} plain onPress={r.onToggle}>
          <Text dimColor={!r.isOn} color={r.isOn ? green : undefined}>
            {r.isOn ? " ON" : "OFF"}
          </Text>
        </Button>
      )}
    </Box>
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* Every switch changes what the model is told it has, so the prompt prefix changes. */}
      <Text color={yellow}>
        ⚠ Any switch changes the tools and skills listed to the model: the next
        request writes the prompt cache again.
      </Text>
      <Text> </Text>
      <Text dimColor>MCP servers {p.mcp.length}</Text>
      {mcpRows.length === 0 ? (
        <Text dimColor>No MCP server.</Text>
      ) : (
        mcpRows.map(row)
      )}
      <Text dimColor>{"─".repeat(width)}</Text>
      <Text dimColor>Skills {p.skills.length}</Text>
      {skillRows.length === 0 ? (
        <Text dimColor>No skill.</Text>
      ) : (
        skillRows.map(row)
      )}
    </Box>
  );
}
