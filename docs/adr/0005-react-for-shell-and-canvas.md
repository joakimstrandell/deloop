# ADR-0005: React for both shell and canvas

**Status:** Accepted
**Date:** 2026-03-31

## Context

The shell (tool chrome) and the canvas iframe are separate browser documents. The canvas
renders the user's React components — React is therefore a required dependency regardless.

The question was whether to use React or a lighter alternative (Svelte) for the shell.

Arguments for Svelte in the shell:
- Smaller runtime bundle, less memory overhead.
- Compiles to vanilla JS with no runtime library.

Arguments for React in the shell:
- The canvas iframe already uses React; no additional dependency per total project.
- The shell is isolated from the canvas (separate document); React's runtime in the shell
  does not affect canvas rendering performance.
- Consistent framework reduces cognitive overhead and tooling complexity.
- The developer knows React well; Svelte would slow iteration.

## Decision

Use React 19 for both the shell and the canvas iframe. The VitePlus toolchain manages the
shell's build; the canvas iframe is a separate Vite entry point in the same app package.

## Consequences

**Better:**
- Single framework across the project — one mental model, one set of tools.
- No risk of "React in iframe, Svelte in shell" confusion.
- React 19's concurrent features are available if needed for the shell's complex state.

**Worse:**
- The shell carries React's runtime (~45 KB gzipped), which Svelte would not.
  This is acceptable given the iframe isolation — the shell's bundle does not affect
  canvas performance.
- If Deloop later supports non-React user projects (Svelte, Vue), the canvas iframe
  will need framework-specific entry points. The shell is unaffected by this.
