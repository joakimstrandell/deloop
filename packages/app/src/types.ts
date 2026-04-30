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
 *   shell  ──mount/unmount/updateProps/setPseudoState──▶  iframe
 *   shell  ◀──iframeReady/cardSelected/cardMoved────────  iframe
 *
 * The runtime validators live in `./protocol.ts` and turn an `unknown`
 * payload into one of these typed messages — or `null` if it's malformed.
 */

export interface ComponentInfo {
  /** Display name derived from the filename (e.g. "Button"). */
  name: string;
  /** Absolute filesystem path to the component file. */
  path: string;
  /** Path relative to the project root (for display). */
  relativePath: string;
}

/** CSS pseudo-states the shell can force on a mounted card's root element. */
export type PseudoState = "default" | "hover" | "focus" | "active" | "disabled";

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
      /** Initial props passed to the component on first render. */
      props: Record<string, unknown>;
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
    };
