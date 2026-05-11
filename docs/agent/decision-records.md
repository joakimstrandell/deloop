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

For these, capture rationale in the issue and PR description.

## ADR Format

Use:

```md
# ADR-NNNN: Title

Status: Proposed | Accepted | Deprecated | Superseded by ADR-NNNN
Date: YYYY-MM-DD

## Context

## Decision

## Consequences

## Amendments
<!-- optional; only present when factual corrections have been made -->
```

## ADR Lifecycle

- New ADRs start as `Proposed` when discussion is still open.
- Mark `Accepted` once the implementation direction is agreed.
- Never rewrite accepted decision history.
- If direction changes, create a new ADR that supersedes the old one and update status links.
- Keep ADR titles architecture-focused; do not include issue IDs in ADR titles.

## Amendments vs Superseding

An ADR may need updating in two distinct cases — handle them differently:

- **Factual correction** (stale package names, renamed files, links that rotted, etc.) — the decision itself is unchanged; only surrounding facts have drifted. Edit the relevant sections in place and append a one-line entry to an `## Amendments` section at the bottom of the ADR: `- **YYYY-MM-DD** — short description of what changed and why`. Keep the original `Date` and `Status` untouched.
- **Decision change** (the original decision is no longer the chosen approach) — do not edit the existing ADR. Create a new ADR and set the old one's `Status` to `Superseded by ADR-NNNN`. Inline amendments must not be used to walk back a decision.

A stale ADR is worse than an amended one; reach for amendments freely when facts drift. Reach for a superseding ADR whenever the decision itself is in question.

## Relationship to the issue tracker

- The issue tracker is the scope and delivery source of truth.
- ADRs capture cross-issue architectural rationale.
- Link relevant ADR IDs in the issue and PR when architecture changes are involved.
