# Working on tickets with agent skills

**Last updated:** 2026-10-15
**Audience:** Anyone picking up a Linear ticket in Pinch, human or agent.

We work tickets with an AI agent (Claude Code or Cursor) and [Matt Pocock's skills](https://github.com/mattpocock/skills). Each skill is a short, repeatable way of working: interview before building, research before deciding, test before shipping. Every open ticket in Linear has an **Approach** label that says which skill to start with.

---

## 1. Install the skills

Install them once per machine.

**Claude Code** (recommended): the official plugin, which updates itself.

```bash
claude plugins install mattpocock-skills
# or, inside a Claude Code session:
/plugin install mattpocock-skills
```

**Cursor, Codex and other agents**: the repo already pins a few skills in `.agents/skills/` (listed in `skills-lock.json`), so they work after cloning. To get the full set:

```bash
npx skills@latest add mattpocock/skills
```

Don't install both ways into Claude Code, or every skill shows up twice.

Check it worked: start a session and type `/ask-matt`. It routes you to the right skill for your situation.

### One-time repo setup

The engineering skills (`/wayfinder`, `/to-spec`, `/to-tickets`, `/triage`) need to know where tickets live. Someone runs `/setup-matt-pocock-skills` once, picks **Other → Linear** (workspace `pinch-recipe`, team `PIN`, via the Linear MCP), keeps single-context domain docs (`CONTEXT.md` + `docs/adr/`), and commits the resulting `docs/agents/*.md` and the `## Agent skills` block in `CLAUDE.md`. After that, nobody else needs to run it.

You'll also need the **Linear MCP** connected in your agent, so it can read and update tickets.

---

## 2. Pick the approach from the ticket's label

| Approach label | Use it when | Start with | Then |
|---|---|---|---|
| `wayfinder` | The work is big and foggy, more than one session can hold, with several linked decisions | `/wayfinder` on the ticket. It becomes the map; decisions become child tickets | Work one child ticket per session. Each ends in a decision, not code |
| `grill-with-docs` | Scope is clear but the decisions aren't | `/grill-with-docs`. The agent interviews you and writes `CONTEXT.md` and ADRs as you go | `/to-spec`, then `/to-tickets` for a multi-session build, or `/implement` for a small one |
| `research` | You need facts from docs, APIs or vendors before deciding | `/research`. It writes a cited file to `docs/research/` | Usually `/grill-with-docs` with the findings |
| `prototype` | The question needs something you can see or run (a UI, a state model) | `/prototype`. Throwaway code, several variants | Pick one, then `/implement` |
| `wizard` | Mostly human steps in dashboards: Cloudflare, store consoles, secrets | Let the agent do the code part, then `/wizard` for a guided script of the manual steps | `/implement` for any code left |
| `implement` | Already specced and agent-ready | `/implement`. It drives `/tdd` and ends with `/code-review` | Open the PR |

Skills you'll reach for along the way:

- `/tdd`: red, green, refactor, one slice at a time.
- `/diagnosing-bugs`: for anything broken, failing or slow. Build a loop that reproduces it first.
- `/codebase-design` and `/improve-codebase-architecture`: where a module boundary should go.
- `/code-review`: review a branch against our standards and the ticket.
- `/handoff`: write the session down so a fresh session (or teammate) can continue.

If the label looks wrong once you start, change it and leave a comment on the ticket saying why.

---

## 3. The loop for one ticket

1. In Linear: assign yourself, set **In Progress**, copy the branch name.
2. `git checkout -b <branch-name-from-linear>`
3. Start a fresh agent session. Give it the ticket id (e.g. `PIN-49`) and run the skill from the Approach label.
4. Keep the grill, spec and tickets in **one** session. Don't clear context until after `/to-tickets`. Start each `/implement` fresh.
5. Write decisions and findings back to the ticket as comments. Non-obvious decisions also get an ADR in `docs/adr/`.
6. Open the PR (title ends with the ticket id). When it merges, set the ticket to **Done**.

---

## 4. Labelling new tickets

When you create a ticket, add one Approach label. Rough guide:

- Can you write the done-when list right now? → `implement`.
- You know what you want but not how → `grill-with-docs`.
- You don't know the facts yet → `research`.
- It spans many sessions and has many unknowns → `wayfinder`.
- You need to see it to decide → `prototype`.
- Most of it happens in someone's dashboard → `wizard`.
