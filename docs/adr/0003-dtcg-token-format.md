# ADR-0003: DTCG token format as source of truth

**Status:** Accepted
**Date:** 2026-03-31

## Context

Deloop owns the design token layer. Tokens need to be stored in a format that is:
- Tool-agnostic (importable/exportable to Figma Tokens, Tokens Studio, Style Dictionary)
- Stable and well-specified (predictable structure for tooling)
- Capable of representing the full range of design tokens (color, spacing, typography, etc.)

Options considered:
1. **Custom JSON format** — simple, but creates a proprietary island.
2. **CSS custom properties file** — directly usable in browsers, but loses semantic metadata.
3. **W3C DTCG (Design Token Community Group) v1** — reached stable status October 2025;
   industry-standard format with broad tooling support.

## Decision

Store tokens in `.deloop/tokens.json` using the W3C DTCG v1 specification. This is the single
source of truth for all design system token values.

On every token change, Deloop transforms the DTCG JSON into output formats (CSS custom
properties by default) written to `.deloop/dist/`. Consuming apps reference these build outputs.

If the DTCG spec proves insufficient, Deloop may extend it with a clearly namespaced superset
rather than diverging from the standard.

## Consequences

**Better:**
- Interoperability with Tokens Studio, Style Dictionary, and other DTCG-compatible tools.
- Import path from existing token formats (CSS, Tailwind config) is well-defined.
- Themes are naturally represented as named sets of token overrides within the same structure.

**Worse:**
- DTCG v1 is new (stable October 2025); library support is still maturing.
- Users unfamiliar with DTCG may find the format verbose compared to simple CSS variables.
