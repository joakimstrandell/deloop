/**
 * Unit tests for the iframe card-store reducer (AWK-14).
 *
 * The load-bearing invariant under AWK-14 is "two drops of the same
 * component create two independent cards". The previous AWK-10 build
 * keyed cards by `component.name`, which collided in the iframe's
 * `Map<cardId, MountedCard>` as soon as the user dropped Button twice.
 * The fix is shell-side cardId minting (`crypto.randomUUID`); these
 * tests pin the reducer's contract so a future regression at the call
 * site is caught here rather than in E2E.
 */
import { describe, it, expect } from "vitest";
import { cardReducer, type CardState } from "./card-store.js";

const empty: CardState = new Map();

const buttonComponentPath = "/@fs/abs/path/to/button.deloop.tsx";
const buttonComponentName = "Button";

function mountAction(cardId: string, x: number, y: number) {
  return {
    type: "MOUNT" as const,
    cardId,
    componentPath: buttonComponentPath,
    componentName: buttonComponentName,
    props: {},
    x,
    y,
  };
}

describe("cardReducer", () => {
  it("MOUNT inserts an entry keyed by cardId with x,y", () => {
    const next = cardReducer(empty, mountAction("card-a", 100, 200));
    expect(next.size).toBe(1);
    const entry = next.get("card-a");
    expect(entry).toMatchObject({
      cardId: "card-a",
      componentPath: buttonComponentPath,
      componentName: buttonComponentName,
      x: 100,
      y: 200,
      pseudoState: "default",
      Component: null,
      error: null,
    });
  });

  it("MOUNTing the same component twice with distinct cardIds yields two cards", () => {
    // The AWK-14 acceptance criterion in spirit: dragging Button twice
    // produces two independent cards. The reducer's job is just to
    // keep distinct cardIds distinct; cardId uniqueness is guaranteed
    // upstream by `crypto.randomUUID()` in the shell. This pins the
    // reducer contract so a regression to `cardId = component.name`
    // (the AWK-10 carryover bug) would fail this test.
    let state: CardState = empty;
    state = cardReducer(state, mountAction("card-a", 10, 10));
    state = cardReducer(state, mountAction("card-b", 200, 300));
    expect(state.size).toBe(2);
    expect(state.get("card-a")?.x).toBe(10);
    expect(state.get("card-b")?.x).toBe(200);
    // Same component metadata, distinct entries.
    expect(state.get("card-a")?.componentName).toBe(buttonComponentName);
    expect(state.get("card-b")?.componentName).toBe(buttonComponentName);
  });

  it("MOUNTing with an existing cardId overwrites the entry", () => {
    // Idempotency property: a `mount` for a known cardId resets the
    // entry to its placeholder shape (Component: null) at the new
    // coords. The shell shouldn't issue a redundant mount under
    // normal flow, but if it does (HMR, retry path), the result is
    // well-defined.
    let state: CardState = empty;
    state = cardReducer(state, mountAction("card-a", 10, 10));
    state = cardReducer(state, mountAction("card-a", 50, 50));
    expect(state.size).toBe(1);
    expect(state.get("card-a")?.x).toBe(50);
    expect(state.get("card-a")?.y).toBe(50);
  });

  it("UNMOUNT removes the entry without affecting siblings", () => {
    let state: CardState = empty;
    state = cardReducer(state, mountAction("card-a", 10, 10));
    state = cardReducer(state, mountAction("card-b", 20, 20));
    state = cardReducer(state, { type: "UNMOUNT", cardId: "card-a" });
    expect(state.has("card-a")).toBe(false);
    expect(state.has("card-b")).toBe(true);
  });

  it("SET_POSITION updates only x,y on the named card", () => {
    let state: CardState = empty;
    state = cardReducer(state, mountAction("card-a", 10, 10));
    state = cardReducer(state, mountAction("card-b", 20, 20));
    state = cardReducer(state, { type: "SET_POSITION", cardId: "card-a", x: 999, y: 888 });
    expect(state.get("card-a")?.x).toBe(999);
    expect(state.get("card-a")?.y).toBe(888);
    // Other card untouched.
    expect(state.get("card-b")?.x).toBe(20);
    expect(state.get("card-b")?.y).toBe(20);
  });

  it("SET_POSITION on an unknown card is a no-op", () => {
    const state = cardReducer(empty, { type: "SET_POSITION", cardId: "nope", x: 1, y: 2 });
    expect(state.size).toBe(0);
  });

  it("UPDATE_PROPS replaces props on the named card without touching position", () => {
    let state: CardState = empty;
    state = cardReducer(state, mountAction("card-a", 10, 10));
    state = cardReducer(state, {
      type: "UPDATE_PROPS",
      cardId: "card-a",
      props: { label: "Hi" },
    });
    expect(state.get("card-a")?.props).toEqual({ label: "Hi" });
    expect(state.get("card-a")?.x).toBe(10);
    expect(state.get("card-a")?.y).toBe(10);
  });

  it("returns a new Map instance on every action (referential change)", () => {
    // useReducer needs reference inequality to trigger a re-render. The
    // reducer's contract here is "always allocate a new Map" so the
    // chrome host never falsely skips an update.
    const state: CardState = empty;
    const next = cardReducer(state, mountAction("card-a", 0, 0));
    expect(next).not.toBe(state);
  });
});
