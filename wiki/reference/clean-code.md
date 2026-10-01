---
type: reference
tags: [sdk, conventions, skills, clean-code]
updated: 2026-09-30
---

# Clean Code skill

Project skill at [`.agents/skills/clean-code/SKILL.md`](../../.agents/skills/clean-code/SKILL.md) (`name: clean-code`, v1.4.0, MIT, author wondelai). This package had no skills directory; the skill now lives at `.agents/skills/clean-code/`, which Cursor discovers. Invoke with `/clean-code` when cleaning or reviewing SDK code.

**Code is read far more often than it is written.** Rate the code 0–10 and name the changes that would reach 10/10.

## Disciplines

| # | Discipline | Reference |
|---|------------|-----------|
| 1 | Meaningful names | [naming-conventions.md](../../.agents/skills/clean-code/references/naming-conventions.md) |
| 2 | Functions | [functions-and-methods.md](../../.agents/skills/clean-code/references/functions-and-methods.md) |
| 3 | Comments and formatting | [comments-formatting.md](../../.agents/skills/clean-code/references/comments-formatting.md) |
| 4 | Error handling | [error-handling.md](../../.agents/skills/clean-code/references/error-handling.md) |
| 5 | Unit testing | [testing-principles.md](../../.agents/skills/clean-code/references/testing-principles.md) |
| 6 | Code smells | [code-smells.md](../../.agents/skills/clean-code/references/code-smells.md) |

Public API and client methods stay in [[usages]]. This skill is the readability pass. Architecture skills named inside it (clean-architecture, refactoring-patterns) are not installed here.
