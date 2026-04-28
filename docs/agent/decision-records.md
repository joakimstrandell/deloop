# Decision Records Policy

## Purpose

Keep architectural decisions close to code while avoiding unnecessary ADR overhead.

## When to Create an ADR

Create an ADR in `docs/adr/` when a decision is:

- hard to reverse,
- cross-package or cross-boundary,
- likely to be questioned later,
- impactful to long-term maintainability or delivery velocity.

Examples:

- runtime architecture (iframe, server model, module boundaries),
- protocol contracts used by multiple surfaces,
- repository/package structure decisions.

## When Not to Create an ADR

Do not create ADRs for:

- local implementation details inside one issue,
- short-lived experiments,
- naming or cosmetic refactors,
- routine library upgrades without architectural impact.

For these, capture rationale in the Linear issue and PR description.

## ADR Format

Use:

```md
# ADR-NNNN: Title
Status: Proposed | Accepted | Deprecated | Superseded by ADR-NNNN
Date: YYYY-MM-DD

## Context
## Decision
## Consequences
```

## ADR Lifecycle

- New ADRs start as `Proposed` when discussion is still open.
- Mark `Accepted` once the implementation direction is agreed.
- Never rewrite accepted decision history.
- If direction changes, create a new ADR that supersedes the old one and update status links.
- Keep ADR titles architecture-focused; do not include Linear issue IDs in ADR titles.

## Relationship to Linear

- Linear is the scope and delivery source of truth.
- ADRs capture cross-issue architectural rationale.
- Link relevant ADR IDs in the Linear issue and PR when architecture changes are involved.
