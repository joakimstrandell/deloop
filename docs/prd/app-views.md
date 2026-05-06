# App Views

Status: Unscheduled
Created: 2026-04-28
Updated: 2026-05-06
Linear: not yet scoped to a milestone

## Why this is unscheduled

App Views was originally part of foundation's P1 ("Deepen the experience"). It's been demoted out of the active milestone sequence (M0 → M1 → M2 → M3) for two reasons:

1. **Weakest standalone value.** Without M3 (live token editing), App Views is just an embedded iframe of the user's running app — there's no token-driven "see the ripple in real apps" loop yet. Its value is conditional on M3.
2. **Operational overhead for the user.** App Views requires the user to run a separate dev server and configure URLs in `.deloop/config.ts`. Friction users won't pay until the embedded iframe carries unique value.

M2 (Screens) may also absorb part of App Views' job — design-system components used inside a Screen file is in-context validation without a separate running app.

This PRD captures the scope so the work isn't lost; it does not commit to a delivery date. Revisit after M3 ships and there's adopter feedback on whether the in-app validation loop is missed.

## Problem (when re-scheduled)

Token edits and theme switches need to be validated against real applications, not just isolated component cards. A button might look right alone and wrong in a real navbar; a color token might pass component review and clash inside an actual product page.

App Views embed the user's own running applications inside Deloop and apply the same token / theme overrides used on the canvas, letting the user verify that design-system decisions hold up in production-shaped layouts.

## Goals (when re-scheduled)

- Embed running applications as read-only iframes inside Deloop's canvas.
- Inject Deloop's CSS custom properties into the embedded iframe so token edits and theme switches reflect in the running app.
- Configure apps by name and localhost URL in `.deloop/config.ts`. Users start app dev servers themselves; Deloop embeds them.
- Add Apps as the fourth segment of the mode-switcher chassis (ADR-0006).

## Non-goals

- Not a code-editing surface. App Views are read-only — interaction in the iframe is for navigation, not modification.
- Not driving the user's app's dev server. The user starts their dev server externally; Deloop embeds it.
- Not deploying or hosting apps.
- Not cross-origin authentication or session sharing. Apps must be locally accessible.

## Scope (when re-scheduled)

### Configuration

```ts
// .deloop/config.ts
export default {
  apps: [
    { name: "Marketing site", url: "http://localhost:3000" },
    { name: "Dashboard",      url: "http://localhost:3001" },
  ],
};
```

### Apps mode

Apps becomes the fourth segment in the mode-switcher chassis (after Pages, Components, Screens). Selecting an app from the left sidebar embeds it in the canvas as a full-document iframe.

### Token / theme injection

Deloop posts token / theme updates to the embedded iframe via `postMessage`. The embedded app's design-system layer applies them via CSS custom property overrides — same mechanism as the canvas iframe, layered on top of the app's own styles.

This requires the embedded app to opt in (a small Deloop helper script that listens for the postMessage and updates `:root` custom properties). Without the helper, the iframe still embeds; token / theme changes just don't reflect.

### Per-app navigation

The user navigates inside the embedded iframe like any browser tab. No persistence of route state across mode switches in V1 — the iframe reloads when entering Apps mode.

## Open questions

- **Helper script distribution.** How does the embedded app load Deloop's postMessage listener? A `<script>` snippet, a small npm package, an opt-in import? The cheapest path is a snippet copied into the app's HTML; the cleanest is a published helper. Decide when re-scheduling.
- **Cross-origin constraints.** Localhost-to-localhost embedding is permissive; real-world setups (proxies, docker, custom hostnames) need testing. Document supported configurations.
- **Multiple apps simultaneously.** V1 likely embeds one app at a time. Multi-app split-view is a future ergonomic.
- **What does Apps mode add over a browser tab?** The token-injection loop is the unique value. If that loop is weak in practice, Apps mode is just an iframe with no win — confirm the value before reactivating this PRD.

## Decisions

- **2026-05-06** — Demoted from M-series to unscheduled. Revisit after M3 ships.
- **2026-05-06** — When re-scheduled, lands as the Apps segment of the mode-switcher chassis (ADR-0006).
- **2026-05-06** — Token / theme injection is the load-bearing feature, not the iframe embedding alone. Confirms M3 is a hard prerequisite.

## Linked ADRs / Plans

- [ADR-0006](../adr/0006-mode-taxonomy.md) — defines the Apps mode segment.
- `docs/prd/foundation.md` — App Views originated here.
- `docs/prd/m3-tokens-and-themes.md` — hard prerequisite.
