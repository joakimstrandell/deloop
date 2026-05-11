# App Views

Status: Draft

## Problem Statement

Token edits and theme switches need to be validated against real applications, not just isolated component cards. A button might look right alone and wrong in a real navbar; a colour token might pass component review and clash inside an actual product page.

App Views embed the user's own running applications inside Deloop and apply the same token / theme overrides used on the canvas, letting the user verify that design-system decisions hold up in production-shaped layouts.

## Solution

Apps becomes the fourth segment in the mode-switcher chassis (after Pages, Components, Screens). Apps are configured by name and localhost URL in `.deloop/config.ts`; the user runs their dev server externally and Deloop embeds it as a full-document iframe in the canvas. Deloop posts token / theme updates to the embedded iframe via `postMessage`; a small Deloop helper script in the app listens and applies them via CSS custom property overrides — the same mechanism as the canvas iframe, layered on top of the app's own styles. Without the helper, the iframe still embeds; token / theme changes just don't reflect. Per-app navigation works like any browser tab; no route state persistence in V1 (the iframe reloads when entering Apps mode).

Example configuration:

```ts
// .deloop/config.ts
export default {
  apps: [
    { name: "Marketing site", url: "http://localhost:3000" },
    { name: "Dashboard", url: "http://localhost:3001" },
  ],
};
```

## User Stories

- As a developer, I want to configure my running apps by name and URL in `.deloop/config.ts`, so that Deloop can embed them without managing my dev servers.
- As a developer, I want Apps as the fourth segment of the mode-switcher chassis, so that switching to an app is the same gesture as switching between Pages, Components, and Screens.
- As a developer, I want to select an app from the left sidebar and see it embedded in the canvas as a full-document iframe, so that I can navigate inside my real application without leaving Deloop.
- As a developer, I want Deloop's token and theme updates to reach the embedded app via `postMessage`, so that I can see token edits ripple through real app layouts, not just isolated Cards.
- As a developer, I want a small opt-in helper script for the embedded app, so that I keep production app code free of Deloop coupling but can light up the injection loop when needed.
- As a developer, I want apps without the helper to still embed (just without token injection), so that I can browse the app even before opting in.

## Implementation Decisions

- **Apps segment in the mode-switcher chassis** — see ADR-0006. When re-scheduled, Apps lands as the fourth segment alongside Pages, Components, Screens.
- **Token / theme injection via `postMessage` + helper script** is the load-bearing feature, not the iframe embedding alone. Confirms M3 is a hard prerequisite.
- **User runs the app's dev server externally.** Deloop does not manage, deploy, or host apps. Configuration is name + localhost URL in `.deloop/config.ts`.
- **No route state persistence in V1.** The iframe reloads when entering Apps mode; per-app navigation works like any browser tab.

## Testing Decisions

- **Unit** — `.deloop/config.ts` apps-schema parsing.
- **Integration** — Shell ↔ embedded-app `postMessage` injection; helper-script presence detection (gracefully degrade without).
- **E2E** — Apps segment selection, iframe embed, token-edit-with-helper round-trip on a fixture app.

See [docs/agent/testing.md](../agent/testing.md).

## Out of Scope

- Code-editing surface. App Views are read-only — interaction in the iframe is for navigation, not modification.
- Driving the user's app's dev server. The user starts their dev server externally; Deloop embeds it.
- Deploying or hosting apps.
- Cross-origin authentication or session sharing. Apps must be locally accessible.
- Multi-app split-view. V1 likely embeds one app at a time.

## Further Notes

### Why this is unscheduled

App Views was originally part of foundation's P1 ("Deepen the experience"). It's been demoted out of the active milestone sequence (M0 → M1 → M2 → M3) for two reasons:

1. **Weakest standalone value.** Without M3 (live token editing), App Views is just an embedded iframe of the user's running app — there's no token-driven "see the ripple in real apps" loop yet. Its value is conditional on M3.
2. **Operational overhead for the user.** App Views requires the user to run a separate dev server and configure URLs in `.deloop/config.ts`. Friction users won't pay until the embedded iframe carries unique value.

M2 (Screens) may also absorb part of App Views' job — design-system components used inside a Screen file is in-context validation without a separate running app.

This PRD captures the scope so the work isn't lost; it does not commit to a delivery date. Revisit after M3 ships and there's adopter feedback on whether the in-app validation loop is missed.

### Open questions

- **Helper script distribution.** How does the embedded app load Deloop's postMessage listener? A `<script>` snippet, a small npm package, an opt-in import? The cheapest path is a snippet copied into the app's HTML; the cleanest is a published helper. Decide when re-scheduling.
- **Cross-origin constraints.** Localhost-to-localhost embedding is permissive; real-world setups (proxies, docker, custom hostnames) need testing. Document supported configurations.
- **Multiple apps simultaneously.** V1 likely embeds one app at a time. Multi-app split-view is a future ergonomic.
- **What does Apps mode add over a browser tab?** The token-injection loop is the unique value. If that loop is weak in practice, Apps mode is just an iframe with no win — confirm the value before reactivating this PRD.
