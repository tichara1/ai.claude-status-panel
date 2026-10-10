# status-panel

A Claude Code mod that draws a framed panel above the prompt with everything you want to keep an eye on during a session.

```
╭────────────────────────────────────────────────────────────────────────────────────╮
│ [📁 my-repo]  git:main ↓3                      🤖 opus-5-5 (M)  👑 Max 20x  v2.1.295 │
│ ────────────────────────────────────────────────────────────────────────────────── │
│ 🧠 ███████░░░░░░░░ 46% 456k/1.0M                     🕔 5h  13% · 38m      ▐▛█▜▌   │
│ 💰 ━━──────────── $29.80 / $250.00 [session: $29.80] 📅 7d  16% · 5d4h     ▗▟█▙▖ ✻ │
│ ────────────────────────────────────────────────────────────────────────────────── │
│ [📄 CLAUDE.md ×2] [📋 AGENTS.md ×0] [🔌 MCP ×10]      💾 100% Σ 97%   ⏳ 19:18      │
╰────────────────────────────────────────────────────────────────────────────────────╯
```

## What it shows

- **Header:** current folder (click to open it), git branch with ahead/behind against upstream (`↑2 ↓1`, `✓` when in sync), a clickable `[PR]` link when the branch has an open pull request (needs `gh`), model with effort, subscription plan and Claude Code version.
- **Context:** fill of the context window with a colour scale (green → yellow → orange → red).
- **Rate limits:** 5-hour and weekly windows with the time left until reset. Click a limit to show the exact reset times.
- **Cost:** spend this calendar month against your budget (thin bar under the context bar) and the cost of the current session. Click **session** to expand:
  - tokens burned this session with a price-list estimate,
  - every subagent with its type, model, effort, tokens, status (animated `✻ running 1m20s` or `✅ 8s`) and estimated cost, in aligned columns.
- **Prompt cache:** hit rate of the last request and of the session, plus a live countdown until the cache expires (TTL). A `⚠ cache miss` line explains the most likely cause (idle longer than TTL, model or effort change, compaction, `/clear`) and disappears once the cache is warm again.
- **Lists:** loaded `CLAUDE.md` / `AGENTS.md` files (with token size and an **open** button) and active MCP servers.
- **Clawd:** a mini animated Claude Code robot that works while a turn is running.
- **Alerts:** the frame turns orange when the cache expired with the context above 35 %, and red when the context is above 65 %.

## Install

In a Claude Code terminal session:

```
/plugin install status-panel --marketplace tichara1/ai.claude-status-panel
```

Answer `y` to add the marketplace and pick the **user** scope so the panel shows in every project.

## Configure

```
/plugin configure status-panel
```

| Option | Default | Meaning |
|---|---|---|
| `ttlMinutes` | `60` | Prompt-cache TTL your requests use (`5` or `60`). Drives the countdown and the cache-write price. |
| `budgetUsd` | `250` | Monthly budget in USD that the cost bar is measured against. |

## Update and uninstall

```
claude plugin update status-panel@status-panel
claude plugin uninstall status-panel@status-panel
```

Run `/reload-plugins` in sessions that are already open.

## Good to know

- **Costs are estimates.** The session cost comes from Claude Code itself; per-kind and per-subagent costs are computed from public API prices. On a subscription plan they show the value of what you used, not money you are billed.
- **The monthly total is local.** It sums the sessions this mod has seen on this machine since it was installed.
- **The plan label** is read from `oauthAccount.organizationType` and `organizationRateLimitTier` in `~/.claude.json`; nothing else from that file is used.
- **Opening files and folders** uses `start` on Windows, `open` on macOS and `xdg-open` on Linux.
- **Tested with** Claude Code 2.1.295 in the terminal.

## Development

```
claude plugin validate .
claude plugin test .
```

The panel layout is in `hooks/band.tsx`, the expanded lists in `hooks/lists.tsx`, state and hooks in `hooks/register.tsx`, pure helpers (with tests) in `hooks/format.ts`.

## License

MIT
