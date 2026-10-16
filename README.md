# status-panel

A Claude Code mod that draws a quiet, framed panel above the prompt with everything you want to keep an eye on during a session. Labels are dim; colour appears only where it tells you something.

## Preview

**Personal plan (Max 20x) with extra usage switched on:**

```
╭──────────────────────────────────────────────────────────────────────────────────────────╮
│ www-trainers  main ↓5  PR#1067                                 opus-5-5 · high · Max 20x │
│                                                                                          │
│ context  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  33%  638k [1M]             5h     13%  38m                     │
│ cache ●  100%  Σ 98%  56:32    CLAUDE.md 3   MCP 10  7d     16%  5d4h                    │
│                                                    extra  ━━━━━━━── 84%  42.00$ / 50.00$ │
│ session  11.02$                                                                          │
╰──────────────────────────────────────────────────────────────────────────────────────────╯
```

**Enterprise with a 250$ monthly budget:** the 5-hour and weekly limits are hidden (Enterprise pays per token); in their place the month's spend: the bar with its percentage, and the amount against the budget on the row below.

```
╭──────────────────────────────────────────────────────────────────────────────────────────╮
│ repo-x  feature/abc ✓  PR#5541                              opus-5-5 · high · Enterprise │
│                                                                                          │
│ context  ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬  18%  185k [1M]                             month  ━━━━━━── 76% │
│ cache ●  97%  Σ 96%  42:10     CLAUDE.md 2   MCP 4                   190.40$ / 250.00$   │
│ session  12.40$                                                                          │
╰──────────────────────────────────────────────────────────────────────────────────────────╯
```

On a personal plan with extra usage switched off (or without a limit) the money row is hidden; the session cost always stays.

## What it shows

- **Header:** the folder (click to open it), the git branch with ahead/behind against upstream (`↑2 ↓1`, `✓` in sync), a clickable `PR#n` link when the branch has an open pull request (GitHub via `gh`, Azure DevOps via `az` with the `azure-devops` extension), model, effort and plan.
  - Click `↓n` to fast-forward with `git pull --ff-only`: it never merges, and a diverged branch or conflicting local changes are left untouched; a toast says what happened.
- **Context:** tokens in use against the window (`333k [1M]`), with a bar and percentage coloured by fill (green → yellow → orange → red).
- **Prompt cache:** hit rate of the last request and of the session, and a live countdown until the cache expires. A `cache miss` line explains the most likely cause and disappears once the cache is warm again.
- **Keep-alive:** click the word **cache** to switch it on; the dot next to it turns green. A minute before the TTL runs out it sends one tiny request over the session's own transcript (`$.model.fork`), which reads the prefix from the cache and starts the TTL again. It skips a running turn and an expired cache, switches itself off when a request fails, and shows how many requests it sent and what they cost.
- **Rate limits:** 5-hour and weekly windows with the time left until reset; click one to show the exact reset times. Hidden on Enterprise.
- **Money**, under the limits, with the same colour scale (`/login` to another account is picked up within 30 s):
  - personal plan: `extra` usage beyond the subscription against its monthly limit, from your account; hidden while extra usage is off or has no limit,
  - Enterprise: `month`, all spend this calendar month against the account's limit or `budgetUsd`, from your account once it reports it, otherwise estimated from the price list.
- **CLAUDE.md** and **MCP** on the cache row, under the token count, each open a side pane.
- **Bottom row:** the session cost (always), prepaid `credits` when the account has any, and what keep-alive has sent and cost.
- **Clawd:** a mini Claude Code robot, grey at rest, in colour and animated while a turn is running.
- **Alerts:** the frame turns orange when the cache expired with the context above 35 %, and red above 65 %.
- **Currency:** amounts carry the sign after the number (`3.71$`, `3.71€`). Account amounts use the currency the account reports; the session cost and price-list estimates are in US dollars, as Claude Code computes them.

## Side panes

**session**, **CLAUDE.md** and **MCP** each open a pane docked to the right of the transcript (fullscreen from 110 columns, otherwise above the prompt). Only one is open at a time; click the same button again to close it.

**Session pane:**

```
  🔥 47.2M tokens · ≈14.96$ by price list · engine 16.15$
  ────────────────────────────────────────────────────────────────
  Subagents  clear
  ▸ ● Color test: csharp-reviewer (csharp-reviewer)  haiku-5-5 (XH)  🔥 96k  ✅ 13s  ≈0.01$
  ▾   Feedback on error message (Explore)            haiku-5-5 (XH)  🔥 25k  ✅ 12s  ≈0.00$
      ╭────────────────────────────────────────────────────────────╮
      │ ▌ request                                                  │
      │   A client of a personal trainer tries to cancel …         │
      │ ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ │
      │ ▌ response                                                 │
      │   - Tone: "Error" and "Operation not permitted" …          │
      ╰────────────────────────────────────────────────────────────╯
  ════════════════════════════════════════════════════════════════
  Σ subagents 12 spawned · 🔥 609k of 47.2M tokens · ≈0.28$ of 16.15$ this session
```

- Each subagent with its type, model, effort, tokens, status (`✻ running 1m20s` or `✅ 8s`) and estimated cost, in aligned columns.
- The coloured dot is the `color` from the agent's definition (`~/.claude/agents`, the project's `.claude/agents`; symbolic links are followed). Built-in types have none.
- Click a subagent to expand its request and response; **clear** drops the finished ones (running ones stay); the summary counts every subagent spawned this session.

**CLAUDE.md pane:** the loaded `CLAUDE.md`, `CLAUDE.local.md` and `AGENTS.md` files with where they come from and their tokens. Click a file to read it in an indented frame right in the pane (the first 60 lines); `↗ open` opens it in your editor.

```
  ▾ CLAUDE.md  Project · 5k tok   ↗ open
      ╭──────────────────────────────────────────────────────────╮
      │ # www-trainers                                           │
      │                                                          │
      │ ## Než začneš                                            │
      │ - Pracuješ na oblasti NNN: přečti spec.md a design.md.   │
      │ … 112 more lines · ↗ open shows the whole file           │
      ╰──────────────────────────────────────────────────────────╯

  ▸ ~/.claude/CLAUDE.md  User · 3k tok   ↗ open
```

**MCP & skills pane:** MCP servers, then skills, each list with the active ones first and the most called first. Every row has an `ON`/`OFF` switch at the right edge.

```
  ⚠ Any switch changes the tools and skills listed to the model: the next request
    writes the prompt cache again.

  MCP servers
  claude_ai_Claude_Docs [claude.ai]  12 calls · 3/3 tools · 4k tok          ON
  restapi                            0 calls · 0/2 tools · 1k tok           ON
  ────────────────────────────────────────────────────────────────────────────
  Skills
  plugin-authoring [system]          3 calls · built-in · 2k tok            ON
  superpowers:brainstorming [plugin] 0 calls · plugin · 1k tok              ON
  spec-write                         0 calls · projectSettings · 1k tok    OFF
```

- A switch writes to the project's `.claude/settings.local.json` (personal, not committed), the same file `/skills` writes:
  - MCP server: `deniedMcpServers: [{ "serverName": … }]`; it takes effect when the server reconnects (`/mcp` or a new session),
  - skill: `skillOverrides: { "<name>": "off" }`.
- Plugin skills have no switch: `skillOverrides` does not apply to them.
- `[system]` marks Claude Code's own skills, `[plugin]` and `[claude.ai]` where a server or skill comes from. Any switch changes what the model is told it has, so the next request writes the prompt cache again.
- A settings file that is not valid JSON is never overwritten; the toast says so.

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
| `ttlMinutes` | `60` | Prompt-cache TTL your requests use (`5` or `60`). Drives the countdown, keep-alive and the cache-write price. |
| `budgetUsd` | `250` | Monthly Enterprise budget in USD that the `month` bar is measured against when the account reports no limit of its own. |

## Update and uninstall

```
claude plugin update status-panel@status-panel
claude plugin uninstall status-panel@status-panel
```

Run `/reload-plugins` in sessions that are already open.

## Good to know

- **Costs are estimates.** The session cost comes from Claude Code itself; per-kind, per-subagent and keep-alive costs are computed from public API prices. On a subscription plan they show the value of what you used, not money you are billed.
- **The monthly total is local** on Enterprise without account figures: it sums the sessions this mod has seen on this machine.
- **The plan label** is read from `oauthAccount.organizationType` and `organizationRateLimitTier` in `~/.claude.json`; nothing else from that file is used.
- **Opening files and folders** uses `start` on Windows, `open` on macOS and `xdg-open` on Linux.
- **Tested with** Claude Code 2.1.301 in the terminal.

## Development

```
claude plugin validate .
claude plugin test .
```

The band is in `hooks/band.tsx`, the session pane in `hooks/lists.tsx`, the CLAUDE.md pane in `hooks/memory.tsx`, the MCP & skills pane in `hooks/tools.tsx`, state and hooks in `hooks/register.tsx`, pure helpers (with tests) in `hooks/format.ts`.

## License

MIT
