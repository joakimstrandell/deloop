/**
 * Shared types and the postMessage protocol contract between the Deloop
 * shell (outer document) and the canvas iframe.
 *
 * Per AGENTS.md "Contract Source of Truth": this file is canonical. When a
 * message shape changes, both sender and receiver must be updated in the
 * same commit.
 *
 * Protocol overview (see ADR-0001 for why a postMessage bus exists at all):
 *
 *   shell  ──mount/unmount/updateProps/setPseudoState/setColorScheme──▶  iframe
 *   shell  ◀──iframeReady/cardSelected/cardMoved/componentDropped────  iframe
 *
 * The runtime validators live in `./protocol.ts` and turn an `unknown`
 * payload into one of these typed messages — or `null` if it's malformed.
 *
 * Drop choreography (AWK-14):
 *   1. User drags a component from the sidebar onto the canvas iframe.
 *   2. Iframe handles the native `drop` event, parses the MIME payload,
 *      and posts `componentDropped { component, x, y }` to the shell.
 *   3. Shell mints a fresh `cardId` (crypto.randomUUID), records the card
 *      in its state map, and replies with `mount { cardId, x, y, ... }`.
 *   4. Iframe stores x,y on the mounted entry and renders the chrome card
 *      at `position: absolute; left: x; top: y` inside the chrome host.
 *   5. While dragging an existing card, the iframe captures pointer events
 *      and posts a single `cardMoved { cardId, x, y }` on `pointerup`.
 */

export interface ComponentInfo {
  /** Display name — the verbatim identifier of a shim's named export. */
  name: string;
  /** Absolute filesystem path to the shim file. */
  path: string;
  /** Path relative to the project root (for display). */
  relativePath: string;
}

/** CSS pseudo-states the shell can force on a mounted card's root element. */
export type PseudoState = "default" | "hover" | "focus" | "active" | "disabled";

/**
 * Resolved color scheme literal as it appears on the wire.
 *
 * The shell tracks a richer `Mode = "light" | "dark" | "system"` user
 * preference and listens to `prefers-color-scheme` in one place; the
 * iframe only ever receives a resolved literal. This keeps the dark-mode
 * mechanism single-sourced and avoids duplicate `matchMedia` listeners.
 */
export type ColorScheme = "light" | "dark";

/**
 * Messages sent from the shell to the canvas iframe.
 *
 * Each message that targets a specific card carries a `cardId` so the
 * iframe can address its dictionary of mounted cards.
 */
export type ShellToIframeMessage =
  | {
      type: "mount";
      /** Stable identifier the shell uses to reference this card afterwards. */
      cardId: string;
      /**
       * Module specifier the iframe will dynamic-`import()`. In dev this is
       * a Vite `/@fs/<absolute-path>` URL; in production it's a regular URL.
       */
      componentPath: string;
      /**
       * Export name to pull from the imported module. The iframe resolves
       * the renderable strictly as `mod[componentName]` (no default-export
       * fallback) per the strict shim-only discovery model in ADR-0005.
       * The named export must exist; missing exports throw a clear error.
       */
      componentName: string;
      /** Initial props passed to the component on first render. */
      props: Record<string, unknown>;
      /**
       * Iframe-document coordinates (clientX + scrollX, clientY + scrollY)
       * at which the card's top-left should anchor. Set by the shell from
       * the originating `componentDropped` payload; the iframe positions
       * the chrome card at `position: absolute; left: x; top: y`. AWK-14
       * keeps these unclamped — pan/zoom and bounds are out of scope.
       */
      x: number;
      y: number;
    }
  | {
      type: "unmount";
      cardId: string;
    }
  | {
      type: "updateProps";
      cardId: string;
      props: Record<string, unknown>;
    }
  | {
      type: "setPseudoState";
      cardId: string;
      state: PseudoState;
    }
  | {
      /**
       * Shell broadcasts the user's resolved color scheme. The shell owns
       * `Mode` tracking (light / dark / system) and `matchMedia`; the wire
       * only carries the resolved literal so the iframe never duplicates
       * the OS listener.
       */
      type: "setColorScheme";
      scheme: ColorScheme;
    };

/** Messages sent from the canvas iframe back to the shell. */
export type IframeToShellMessage =
  | {
      /**
       * Sent once after the iframe finishes hydrating. The shell waits for
       * this before issuing any `mount` to avoid a race against module init.
       */
      type: "iframeReady";
    }
  | {
      type: "cardSelected";
      cardId: string;
    }
  | {
      type: "cardMoved";
      cardId: string;
      x: number;
      y: number;
    }
  | {
      /**
       * Iframe announces a sidebar-originated drop landing inside the
       * canvas document. The iframe owns the drop event because the
       * sidebar drag crosses the iframe boundary; only the iframe sees
       * the native `drop` event with the component MIME payload. The
       * shell mints the cardId and replies with a `mount` carrying the
       * same x,y so it remains the source of truth for the card list.
       */
      type: "componentDropped";
      component: ComponentInfo;
      /** Iframe-document coordinates of the drop point (top-left anchor). */
      x: number;
      y: number;
    };
