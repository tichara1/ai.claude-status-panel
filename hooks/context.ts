import type { MemFile } from "../types";

/** Where a memory file comes from, in the order Claude Code loads them; a later one overrides. */
const SCOPE_ORDER = ["Managed", "User", "Project", "Local", "AutoMem"];

/** Settings sources in the order they load; a later source overrides an earlier one. */
export const SETTINGS_ORDER = [
  "user",
  "project",
  "local",
  "flag",
  "policy",
] as const;
export type SettingsScope = (typeof SETTINGS_ORDER)[number];

/** One configured hook command, from one settings source. */
export type HookRow = {
  scope: SettingsScope;
  event: string;
  /** Tool pattern the hook reacts to; empty for every call or an event without one. */
  matcher: string;
  command: string;
};

/** A rules file lives in a `.claude/rules` folder. */
export const isRule = (path: string) =>
  /[\\/]\.claude[\\/]rules[\\/]/i.test(path);

const depth = (path: string) => path.split(/[\\/]/).length;

/**
 * Memory files in load order: by scope (managed, user, project, local, auto memory), then
 * from the root down (a parent folder's file before a nested one), then by path.
 */
export const sortByLoadOrder = (files: readonly MemFile[]) =>
  [...files].sort((a, b) => {
    const rank = (f: MemFile) => {
      const i = SCOPE_ORDER.indexOf(f.type);

      return i === -1 ? SCOPE_ORDER.length : i;
    };

    return (
      rank(a) - rank(b) ||
      depth(a.path) - depth(b.path) ||
      a.path.localeCompare(b.path)
    );
  });

/** The hook commands of one settings source's `hooks` block; anything malformed is skipped. */
export const hookRows = (scope: SettingsScope, hooks: unknown): HookRow[] => {
  if (typeof hooks !== "object" || hooks === null) return [];
  const rows: HookRow[] = [];
  for (const [event, groups] of Object.entries(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const g = group as { matcher?: unknown; hooks?: unknown } | null;
      const matcher = typeof g?.matcher === "string" ? g.matcher : "";
      if (!Array.isArray(g?.hooks)) continue;
      for (const hook of g.hooks) {
        const h = hook as { command?: unknown; type?: unknown } | null;
        const command =
          typeof h?.command === "string"
            ? h.command
            : typeof h?.type === "string"
              ? `(${h.type})`
              : "";
        if (command !== "") rows.push({ scope, event, matcher, command });
      }
    }
  }

  return rows;
};

/** `just now`, `5m ago`, `3h ago`, `2d ago` for a modification time; `–` when unknown. */
export const ago = (mtimeMs: number | undefined, now: number) => {
  if (mtimeMs === undefined || mtimeMs <= 0) return "–";
  const minutes = Math.max(0, Math.floor((now - mtimeMs) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);

  return hours < 48 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
};

/** Cuts a text to `width` cells from the left, keeping its end: `…ude/rules/api.md`. */
export const cutLeft = (text: string, width: number) =>
  text.length <= width ? text : `…${text.slice(text.length - width + 1)}`;

/** Cuts a text to `width` cells from the right: `node hooks/guard…`. */
export const cutRight = (text: string, width: number) =>
  text.length <= width ? text : `${text.slice(0, width - 1)}…`;

/** One installed plugin with a hooks module (a mod), as the settings enable it. */
export type ModRow = {
  /** `name@marketplace`. */
  id: string;
  version: string;
  /** The last settings source that switches it on or off: the one that wins. */
  scope: SettingsScope | "";
  isOn: boolean;
  /** The folder the plugin is installed in; empty when unknown. */
  path: string;
};

/**
 * Installed plugins from `installed_plugins.json` with the settings that switch them, in
 * load order: the last source naming a plugin decides whether it is on.
 */
export const pluginRows = (
  installedJson: string | null,
  enabledBySource: readonly (readonly [SettingsScope, unknown])[],
): ModRow[] => {
  let installed: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(installedJson ?? "{}") as { plugins?: unknown };
    if (typeof parsed.plugins === "object" && parsed.plugins !== null) {
      installed = parsed.plugins as Record<string, unknown>;
    }
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const state = new Map<string, { scope: SettingsScope; isOn: boolean }>();
  for (const [scope, enabled] of enabledBySource) {
    if (typeof enabled !== "object" || enabled === null) continue;
    for (const [id, value] of Object.entries(enabled)) {
      state.set(id, { scope, isOn: value === true });
    }
  }
  const ids = [...new Set([...Object.keys(installed), ...state.keys()])];
  const order = (id: string) => {
    const s = state.get(id)?.scope;

    return s === undefined ? SETTINGS_ORDER.length : SETTINGS_ORDER.indexOf(s);
  };

  return ids
    .map((id): ModRow => {
      const entry = (Array.isArray(installed[id]) ? installed[id] : [])[0] as
        | { version?: unknown; installPath?: unknown }
        | undefined;

      return {
        id,
        version: typeof entry?.version === "string" ? entry.version : "",
        scope: state.get(id)?.scope ?? "",
        isOn: state.get(id)?.isOn ?? false,
        path: typeof entry?.installPath === "string" ? entry.installPath : "",
      };
    })
    .sort((a, b) => order(a.id) - order(b.id) || a.id.localeCompare(b.id));
};

/** A path compared the Windows way: forward slashes, no case. */
export const samePath = (path: string) =>
  path.replaceAll("\\", "/").toLowerCase();

/**
 * The files a memory file imports with `@path` lines (outside code fences), resolved: relative
 * to the importing file's folder, `~/` to the home folder, an absolute path as it is.
 */
export const importsOf = (text: string, filePath: string, home: string) => {
  const dir = filePath.replaceAll("\\", "/").replace(/\/[^/]*$/, "");
  const found: string[] = [];
  let isCode = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) isCode = !isCode;
    if (isCode) continue;
    const refs = line.matchAll(
      /(?:^|\s)@((?:~\/|\.{1,2}\/|[A-Za-z]:[\\/]|\/)?[\w.\-/\\]+\.\w+)/g,
    );
    for (const m of refs) {
      const ref = (m[1] ?? "").replaceAll("\\", "/");
      const resolved = ref.startsWith("~/")
        ? `${home.replaceAll("\\", "/")}/${ref.slice(2)}`
        : /^([A-Za-z]:)?\//.test(ref)
          ? ref
          : `${dir}/${ref}`;
      // Collapse `./` and `../` so the path matches the one Claude Code reports.
      const parts: string[] = [];
      for (const part of resolved.split("/")) {
        if (part === "." || part === "") {
          if (parts.length === 0) parts.push(part);
          continue;
        }
        if (part === "..") parts.pop();
        else parts.push(part);
      }
      found.push(parts.join("/"));
    }
  }

  return found;
};

/** A file in the order it is read, with who imported it (`@path`) and how deep. */
export type NestedFile<T> = { file: T; depth: number; importedBy: string };

/**
 * Puts each imported file right under the file that imports it, as Claude Code inlines it;
 * the rest stay in load order. A file imported by several keeps its first place.
 */
export const nestImports = <T extends { path: string }>(
  files: readonly T[],
  importsByPath: Readonly<Record<string, readonly string[]>>,
): NestedFile<T>[] => {
  const byKey = new Map(files.map((f) => [samePath(f.path), f]));
  const importedKeys = new Set(
    Object.values(importsByPath)
      .flat()
      .map(samePath)
      .filter((k) => byKey.has(k)),
  );
  const out: NestedFile<T>[] = [];
  const placed = new Set<string>();
  const place = (f: T, depth: number, importedBy: string) => {
    const key = samePath(f.path);
    if (placed.has(key)) return;
    placed.add(key);
    out.push({ file: f, depth, importedBy });
    const imports =
      Object.entries(importsByPath).find(([p]) => samePath(p) === key)?.[1] ??
      [];
    for (const ref of imports) {
      const child = byKey.get(samePath(ref));
      if (child !== undefined) place(child, depth + 1, f.path);
    }
  };
  for (const f of files) {
    if (!importedKeys.has(samePath(f.path))) place(f, 0, "");
  }
  // Imported files whose importer is not in context still show, at the top level.
  for (const f of files) place(f, 0, "");

  return out;
};
