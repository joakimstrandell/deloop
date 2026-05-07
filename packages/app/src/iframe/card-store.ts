import type { ComponentType } from "react";
import type { PseudoState } from "../types.js";

/**
 * Iframe-side card store (AWK-14 extraction).
 *
 * The iframe maintains a `Map<cardId, MountedCard>` keyed by the cardId
 * the shell mints on `componentDropped`. The reducer is the single
 * authoritative state machine for the iframe's view of the canvas;
 * IframeApp.tsx feeds it actions translated from postMessage payloads.
 *
 * Pulled out of `IframeApp.tsx` so the mount/dispatch contract is
 * unit-testable without rendering the chrome host. The reducer must be
 * a pure `(state, action) => state` so distinct cardIds always produce
 * distinct entries — exactly what the AWK-14 acceptance criterion
 * "dropping the same component twice creates two independent cards"
 * depends on.
 */

export interface MountedCard {
  cardId: string;
  /** Vite /@fs/ URL or other module specifier for the component module. */
  componentPath: string;
  /** Export name resolved against the imported module (see MOUNT). */
  componentName: string;
  props: Record<string, unknown>;
  pseudoState: PseudoState;
  Component: ComponentType<Record<string, unknown>> | null;
  error: string | null;
  /** Iframe-document coordinates of the card's top-left anchor. */
  x: number;
  y: number;
}

export type CardState = Map<string, MountedCard>;

export type CardAction =
  | {
      type: "MOUNT";
      cardId: string;
      componentPath: string;
      componentName: string;
      props: Record<string, unknown>;
      x: number;
      y: number;
    }
  | { type: "RESOLVED"; cardId: string; Component: ComponentType<Record<string, unknown>> }
  | { type: "FAILED"; cardId: string; error: string }
  | { type: "UNMOUNT"; cardId: string }
  | { type: "UPDATE_PROPS"; cardId: string; props: Record<string, unknown> }
  | { type: "SET_PSEUDO_STATE"; cardId: string; state: PseudoState }
  | { type: "SET_POSITION"; cardId: string; x: number; y: number };

export function cardReducer(state: CardState, action: CardAction): CardState {
  const next = new Map(state);
  switch (action.type) {
    case "MOUNT":
      next.set(action.cardId, {
        cardId: action.cardId,
        componentPath: action.componentPath,
        componentName: action.componentName,
        props: action.props,
        pseudoState: "default",
        Component: null,
        error: null,
        x: action.x,
        y: action.y,
      });
      return next;
    case "RESOLVED": {
      const entry = next.get(action.cardId);
      if (entry) next.set(action.cardId, { ...entry, Component: action.Component });
      return next;
    }
    case "FAILED": {
      const entry = next.get(action.cardId);
      if (entry) next.set(action.cardId, { ...entry, error: action.error });
      return next;
    }
    case "UNMOUNT":
      next.delete(action.cardId);
      return next;
    case "UPDATE_PROPS": {
      const entry = next.get(action.cardId);
      if (entry) next.set(action.cardId, { ...entry, props: action.props });
      return next;
    }
    case "SET_PSEUDO_STATE": {
      const entry = next.get(action.cardId);
      if (entry) next.set(action.cardId, { ...entry, pseudoState: action.state });
      return next;
    }
    case "SET_POSITION": {
      const entry = next.get(action.cardId);
      if (entry) next.set(action.cardId, { ...entry, x: action.x, y: action.y });
      return next;
    }
  }
}
