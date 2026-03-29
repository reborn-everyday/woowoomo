# AGENTS.md — canonical agent entrypoint

> Scope and product behavior come from `docs/PRD.md` first.
> Execution order comes from `docs/TASKS.md`.
> Deferred skill loading comes from `/SKILLS.md`.

---

## Default read order

Load core docs in this order:

1. `docs/PRD.md`
2. `docs/AGENTS.md`
3. `docs/TASKS.md`

Load `/SKILLS.md` only when the active task needs one of the local skill domains.

---

## Agent operating rules

- Plan before execute.
- Follow the documented task order in `docs/TASKS.md`.
- For competition/tmux operation, use the documented helper workflow in `docs/competition/QUICKSTART_ko.md` and the operator constraints in `docs/competition/RUNBOOK.md` and `docs/competition/OPERATOR_POLICY.md`.
- Do not invent alternative entrypoints or preload every skill document.

---

## Detailed implementation conventions

When the task requires detailed application coding conventions, import ordering, TypeScript guardrails, UI rules, IPC rules, or provider/capture implementation specifics, read:

- `competition/main/AGENTS.md`

Treat that file as the detailed implementation reference, while this document remains the canonical repo-level starting point.
