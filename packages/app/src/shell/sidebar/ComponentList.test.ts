/**
 * Unit tests for ComponentList's drag-payload helper.
 *
 * The full-component lifecycle (EventSource subscription, REST first paint,
 * source dim during drag) is covered by the e2e spec at
 * `e2e/tests/sidebar-live-update.spec.ts` because exercising it here would
 * require a DOM renderer + jsdom + a fake EventSource — more setup than
 * the coverage warrants. The drag-payload contract is the part most likely
 * to silently regress on refactor (it's the protocol bridge to AWK-14), so
 * we pin it explicitly here.
 */
import { describe, it, expect, vi } from "vitest";
import { setComponentDragPayload, COMPONENT_DRAG_MIME } from "./ComponentList.js";
import type { ComponentInfo } from "../../types.js";

function makeDataTransfer(): {
  dt: DataTransfer;
  setData: ReturnType<typeof vi.fn>;
  setDragImage: ReturnType<typeof vi.fn>;
} {
  const data = new Map<string, string>();
  const setData = vi.fn((key: string, value: string) => data.set(key, value));
  const setDragImage = vi.fn();
  // Minimal stub — we only assert on the methods + properties we set.
  const dt = {
    effectAllowed: "none" as DataTransfer["effectAllowed"],
    setData,
    getData: (key: string) => data.get(key) ?? "",
    setDragImage,
  } as unknown as DataTransfer;
  return { dt, setData, setDragImage };
}

const FIXTURE: ComponentInfo = {
  name: "Button",
  path: "/abs/path/to/src/components/Button.tsx",
  relativePath: "src/components/Button.tsx",
};

describe("setComponentDragPayload", () => {
  it("writes the full ComponentInfo as JSON under the custom MIME", () => {
    const { dt, setData } = makeDataTransfer();
    setComponentDragPayload(dt, FIXTURE, null);
    expect(setData).toHaveBeenCalledWith(COMPONENT_DRAG_MIME, JSON.stringify(FIXTURE));
  });

  it("writes the relativePath as a text/plain fallback", () => {
    const { dt, setData } = makeDataTransfer();
    setComponentDragPayload(dt, FIXTURE, null);
    expect(setData).toHaveBeenCalledWith("text/plain", FIXTURE.relativePath);
  });

  it("sets effectAllowed to copy", () => {
    const { dt } = makeDataTransfer();
    setComponentDragPayload(dt, FIXTURE, null);
    expect(dt.effectAllowed).toBe("copy");
  });

  it("calls setDragImage with the ghost node when provided", () => {
    const { dt, setDragImage } = makeDataTransfer();
    const ghost = { textContent: "" } as unknown as HTMLElement;
    setComponentDragPayload(dt, FIXTURE, ghost);
    expect(ghost.textContent).toBe("Button");
    expect(setDragImage).toHaveBeenCalledWith(ghost, 12, 16);
  });

  it("skips setDragImage when ghost is null (browser default kicks in)", () => {
    const { dt, setDragImage } = makeDataTransfer();
    setComponentDragPayload(dt, FIXTURE, null);
    expect(setDragImage).not.toHaveBeenCalled();
  });

  it("MIME constant matches the protocol agreed with AWK-14", () => {
    // Pin the literal so a typo would be caught immediately. AWK-14's drop
    // target reads exactly this string; changing it requires a coordinated
    // update.
    expect(COMPONENT_DRAG_MIME).toBe("application/x-deloop-component");
  });
});
