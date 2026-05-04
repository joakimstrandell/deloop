# ADR-0004: SSE for server→shell push

**Status:** Accepted
**Date:** 2026-05-04

## Context

Deloop needs to push state from the CLI server to the shell whenever it changes
on disk — initially just the discovered Component entry list, with token files
and build/watch errors likely to follow. The first concrete consumer is AWK-12's
sidebar, which must update when component files are added or removed.

Three transports were considered:

1. **WebSocket (full duplex).** A `WebSocketServer` stub already existed in
   `packages/cli/src/server.ts` from earlier scaffolding (no clients). Wiring
   the sidebar through it would establish a duplex realtime channel.
2. **Server-Sent Events (SSE) — server→client only.** Plain HTTP, browser
   builds in `EventSource` with `Last-Event-ID` resume and automatic
   reconnection.
3. **Polling.** Sidebar re-fetches `/api/components` on a fixed interval.

## Decision

Use Server-Sent Events (`text/event-stream`) for all server→shell push,
delivered via `GET /api/events`. The component watcher publishes a `discovery`
event with the full Component entry list inline whenever a file is added or
removed under the configured sources.

The pre-existing `WebSocketServer` stub is removed (no consumers, no roadmap
fit), and the `ws` dependency is dropped from `packages/cli`.

## Consequences

**Better:**

- The actual traffic shape is broadcast (server→client), not duplex. SSE matches
  it exactly; WebSocket would be unused capacity. Future shell→server actions
  (persist token edits, trigger re-scan) fit cleanly into request/response HTTP
  endpoints — no need for a duplex channel.
- `EventSource` provides automatic reconnection and `Last-Event-ID` resume out
  of the box. WebSocket reconnect is hand-rolled and easy to get wrong.
- Plain HTTP framing — no upgrade handshake, fewer proxy edge cases, easier to
  debug in the browser's Network tab.
- One less production dependency (`ws` removed from `packages/cli`).
- Symmetric with Vite's own HMR channel: Vite uses a separate WebSocket for
  module updates inside the iframe; the SSE channel covers shell-side state.
  Two specialised channels are clearer than one general-purpose pipe.

**Worse:**

- Adds a long-lived per-client HTTP connection. Express handles this with
  `res.flushHeaders()` plus a periodic comment frame to defeat idle proxies.
- If a future feature genuinely needs sub-100ms shell→server interactivity,
  SSE alone won't cover it — we'd add a WebSocket then. That feature does not
  exist today and pre-investing in WebSocket is harder to justify than
  retrofitting it later.
- One small race on reconnect: SSE auto-reconnect doesn't replay missed events.
  The sidebar mitigates this by re-fetching `GET /api/components` on every
  `EventSource` `open` after the first, guarded by a `lastSseAt` timestamp so
  a slow REST result can't overwrite a fresher SSE update.

## Event shape

Currently one event type:

```
event: discovery
data: [<ComponentInfo>, <ComponentInfo>, ...]
```

Payload is the full Component entry list (always inline, never a diff or
invalidate signal). Coalesced with a 100ms debounce on the publisher side so
chokidar bursts (e.g. `git checkout` adding many files) collapse into a single
push.

Future event types (token changes, watch errors) will use distinct `event:`
names so consumers can subscribe selectively without payload-shape coupling.

## Related

- Implements the live-update side of AWK-12 (Component list sidebar).
- Removes the unused WebSocket scaffolding originally added in AWK-10's shell
  groundwork — superseded by the decision above.
