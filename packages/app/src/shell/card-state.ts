import type { ComponentInfo } from "../types.js";

/**
 * Shell-side card state helpers (AWK-14).
 *
 * The shell maintains a `Map<cardId, CardEntry>` registry — see
 * `App.tsx`. The actual map lives in component state, but the
 * transitions are pure functions extracted here so the AWK-14
 * acceptance criteria around "drop creates a card", "cardMoved updates
 * stored position", and "cardSelected resolves to the right entry" can
 * be unit-tested without rendering the shell.
 */

export interface CardEntry {
  cardId: string;
  component: ComponentInfo;
  /** Iframe-document coordinates of the card's top-left anchor. */
  x: number;
  y: number;
}

export type ShellCardState = Map<string, CardEntry>;

/**
 * Inserts a freshly-dropped card into the registry. Returns a new Map
 * so callers can pass the result straight into `setCards`. The shell
 * has already minted the cardId via `crypto.randomUUID()` before
 * calling — this function does not generate IDs.
 */
export function addCard(
  state: ShellCardState,
  cardId: string,
  component: ComponentInfo,
  x: number,
  y: number,
): ShellCardState {
  const next = new Map(state);
  next.set(cardId, { cardId, component, x, y });
  return next;
}

/**
 * Updates the stored x,y for an existing card. No-op (returns the same
 * reference) if the cardId is unknown — the shell shouldn't apply a
 * `cardMoved` for a card it never minted, and a stray message from a
 * stale iframe shouldn't summon a phantom card into the registry.
 */
export function moveCard(
  state: ShellCardState,
  cardId: string,
  x: number,
  y: number,
): ShellCardState {
  const entry = state.get(cardId);
  if (!entry) return state;
  const next = new Map(state);
  next.set(cardId, { ...entry, x, y });
  return next;
}
