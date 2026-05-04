# PRDs

Vertical-slice PRDs for Deloop. Each PRD describes *what* and *why* for a coherent product initiative; *how* lives in `docs/plans/`, decision rationale lives in `docs/adr/`.

## Active

| File | Status | Scope |
| ---- | ------ | ----- |
| [foundation.md](foundation.md) | Draft (v0) | Application vision, problem, core concepts, P0 spatial canvas |

## Conventions

- **Naming**: descriptive slug, no version suffix. Example: `live-token-editing.md`, not `live-token-editing-v1.md`.
- **When to write**: initiative spans more than ~3 Linear issues, introduces a user-facing concept, or has cross-cutting architectural impact. Below that threshold, the Linear issue description suffices.
- **Issue linkage**: each consuming Linear issue references its parent PRD path in the issue description (e.g. `PRD: docs/prd/<slug>.md`).
- **Status field**: Draft | Active | Shipped | Archived. Update inline as the initiative moves.

## Template

```md
# <Title>

Status: Draft | Active | Shipped | Archived
Created: YYYY-MM-DD
Updated: YYYY-MM-DD
Linear: <milestone or initiative link, if any>

## Problem
## Goals
## Non-goals
## Scope
## Success criteria
## Open questions
## Linked ADRs / Plans
```
