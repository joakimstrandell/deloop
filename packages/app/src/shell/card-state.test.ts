/**
 * Unit tests for the shell-side card-state helpers (AWK-14).
 *
 * Pins the AC line "Cards can be repositioned by dragging within the
 * canvas" at the level of state plumbing. The reposition flow on the
 * wire is `cardMoved → moveCard(map, id, x, y)`, and the App.tsx
 * handler is a one-liner — most of the contract is here.
 */
import { describe, it, expect } from "vitest";
import { addCard, moveCard, type ShellCardState } from "./card-state.js";
import type { ComponentInfo } from "../types.js";

const button: ComponentInfo = {
  name: "Button",
  path: "/abs/path/button.deloop.tsx",
  relativePath: "src/components/button.deloop.tsx",
};

const tooltip: ComponentInfo = {
  name: "Tooltip",
  path: "/abs/path/tooltip.deloop.tsx",
  relativePath: "src/components/tooltip.deloop.tsx",
};

describe("addCard", () => {
  it("inserts an entry keyed by cardId", () => {
    const next = addCard(new Map(), "card-a", button, 100, 200);
    expect(next.size).toBe(1);
    expect(next.get("card-a")).toEqual({ cardId: "card-a", component: button, x: 100, y: 200 });
  });

  it("preserves existing cards when adding a new one", () => {
    let state: ShellCardState = new Map();
    state = addCard(state, "card-a", button, 10, 20);
    state = addCard(state, "card-b", tooltip, 300, 400);
    expect(state.size).toBe(2);
    expect(state.get("card-a")?.component.name).toBe("Button");
    expect(state.get("card-b")?.component.name).toBe("Tooltip");
  });

  it("returns a new Map (no in-place mutation)", () => {
    const initial = new Map();
    const next = addCard(initial, "card-a", button, 0, 0);
    expect(next).not.toBe(initial);
    expect(initial.size).toBe(0);
  });

  it("supports two cards from the same component (different cardIds)", () => {
    // The AWK-14 AC: dropping Button twice must produce two cards.
    let state: ShellCardState = new Map();
    state = addCard(state, "card-a", button, 0, 0);
    state = addCard(state, "card-b", button, 100, 100);
    expect(state.size).toBe(2);
    expect(state.get("card-a")?.component).toBe(button);
    expect(state.get("card-b")?.component).toBe(button);
  });
});

describe("moveCard", () => {
  it("updates x,y for an existing card", () => {
    let state: ShellCardState = new Map();
    state = addCard(state, "card-a", button, 10, 20);
    state = moveCard(state, "card-a", 333, 444);
    const entry = state.get("card-a");
    expect(entry?.x).toBe(333);
    expect(entry?.y).toBe(444);
    // Component metadata untouched.
    expect(entry?.component).toBe(button);
  });

  it("only mutates the targeted card", () => {
    let state: ShellCardState = new Map();
    state = addCard(state, "card-a", button, 10, 20);
    state = addCard(state, "card-b", tooltip, 50, 60);
    state = moveCard(state, "card-a", 999, 888);
    expect(state.get("card-a")?.x).toBe(999);
    expect(state.get("card-b")?.x).toBe(50);
    expect(state.get("card-b")?.y).toBe(60);
  });

  it("is a no-op for an unknown cardId (returns same reference)", () => {
    // Stale `cardMoved` from a previous iframe instance shouldn't
    // summon a phantom card into the registry.
    const state: ShellCardState = addCard(new Map(), "card-a", button, 10, 20);
    const next = moveCard(state, "ghost", 99, 99);
    expect(next).toBe(state);
    expect(state.size).toBe(1);
  });

  it("returns a new Map when the card exists", () => {
    // useState equality bail-out depends on this.
    const state: ShellCardState = addCard(new Map(), "card-a", button, 10, 20);
    const next = moveCard(state, "card-a", 11, 22);
    expect(next).not.toBe(state);
  });
});
