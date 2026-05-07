/**
 * E2E coverage for AWK-14: drag-and-drop canvas placement with live
 * component rendering, plus pointer-event reposition.
 *
 * Per the locked AWK-14 scope, we do NOT exercise the actual HTML5
 * cross-document drag pipeline (Playwright's drag emulation is
 * unreliable and would test Playwright as much as Deloop). Instead:
 *   - Drops are synthesised by dispatching a `drop` event on the iframe
 *     document with a constructed `DataTransfer` carrying the
 *     `application/x-deloop-component` MIME (`dropComponentOnCanvas`).
 *   - Repositioning is exercised via dispatched pointer events at the
 *     card's chrome frame.
 *
 * Acceptance criteria pinned by these tests:
 *   - Dragging a Button from the sidebar and dropping on the canvas
 *     renders a real Button at that position — "renders Button at
 *     drop position".
 *   - Dropping three Buttons creates three independent cards — "three
 *     drops produce three independent cards".
 *   - Dropping a Button and a Tooltip produces two different cards —
 *     "Button and Tooltip coexist".
 *   - Cards can be repositioned by dragging within the canvas —
 *     "pointer-event drag repositions a card".
 */
import { test, expect, type Page } from "@playwright/test";
import { dropComponentOnCanvas } from "./helpers/canvas-drop.js";

async function getCardCount(page: Page): Promise<number> {
  return page.frame({ url: /iframe\.html/ })!.evaluate(() => {
    const host = document.querySelector("[data-deloop-chrome-host]") as HTMLElement | null;
    if (!host?.shadowRoot) return 0;
    return host.shadowRoot.querySelectorAll("[data-card-id]").length;
  });
}

async function getCardPosition(
  page: Page,
  ordinal: number,
): Promise<{ left: number; top: number; cardId: string }> {
  return page.frame({ url: /iframe\.html/ })!.evaluate((index) => {
    const host = document.querySelector("[data-deloop-chrome-host]") as HTMLElement | null;
    if (!host?.shadowRoot) throw new Error("Chrome host not present");
    const cards = host.shadowRoot.querySelectorAll<HTMLElement>("[data-card-id]");
    const card = cards[index];
    if (!card) throw new Error(`Card index ${index} not present (have ${cards.length})`);
    // Inline style is the load-bearing surface — that's how the
    // iframe applies the position from x/y on its mounted entry.
    return {
      left: parseFloat(card.style.left),
      top: parseFloat(card.style.top),
      cardId: card.dataset["cardId"] ?? "",
    };
  }, ordinal);
}

test.describe("AWK-14 canvas placement", () => {
  test("dropping a Button renders a real Button card at the drop position", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Canvas ready")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await dropComponentOnCanvas(page, "Button", 150, 200);

    const canvas = page.frameLocator("iframe#canvas");
    // The user component renders inside the dropped card.
    await expect(canvas.getByRole("button", { name: "Button" })).toBeVisible({ timeout: 10_000 });

    // The chrome card sits at the requested coordinates.
    const pos = await getCardPosition(page, 0);
    expect(pos.left).toBe(150);
    expect(pos.top).toBe(200);
  });

  test("three drops of Button produce three independent cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Canvas ready")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await dropComponentOnCanvas(page, "Button", 50, 60);
    await dropComponentOnCanvas(page, "Button", 200, 80);
    await dropComponentOnCanvas(page, "Button", 350, 250);

    // Wait for all three cards to be present in the chrome host.
    await expect.poll(() => getCardCount(page), { timeout: 10_000 }).toBe(3);

    // Each card has a distinct cardId — the AWK-10 carryover fix
    // pinned at E2E level. Pre-AWK-14 the iframe keyed cards by
    // `component.name`, so two drops of Button collided.
    const ids = await page.frame({ url: /iframe\.html/ })!.evaluate(() => {
      const host = document.querySelector("[data-deloop-chrome-host]") as HTMLElement | null;
      const nodes = host?.shadowRoot?.querySelectorAll<HTMLElement>("[data-card-id]") ?? [];
      return Array.from(nodes).map((n) => n.dataset["cardId"]);
    });
    expect(new Set(ids).size).toBe(3);

    // Three real Button DOM nodes rendered.
    const canvas = page.frameLocator("iframe#canvas");
    await expect(canvas.getByRole("button", { name: "Button" })).toHaveCount(3, {
      timeout: 10_000,
    });
  });

  test("Button and Tooltip coexist as two different component cards", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Canvas ready")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await dropComponentOnCanvas(page, "Button", 80, 80);
    await dropComponentOnCanvas(page, "Tooltip", 280, 200);

    await expect.poll(() => getCardCount(page), { timeout: 10_000 }).toBe(2);

    const canvas = page.frameLocator("iframe#canvas");
    // The Button card renders a Button.
    await expect(canvas.getByRole("button", { name: "Button" })).toBeVisible({ timeout: 10_000 });
    // The Tooltip shim renders a "Hover me" trigger Button as its
    // default trigger (matches component-render.spec coverage).
    await expect(canvas.getByRole("button", { name: "Hover me" })).toBeVisible({
      timeout: 10_000,
    });
  });

  test("pointer-event drag on a card repositions it", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Canvas ready")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Button", exact: true })).toBeVisible({
      timeout: 10_000,
    });

    await dropComponentOnCanvas(page, "Button", 100, 100);
    const canvas = page.frameLocator("iframe#canvas");
    await expect(canvas.getByRole("button", { name: "Button" })).toBeVisible({ timeout: 10_000 });

    const initial = await getCardPosition(page, 0);
    expect(initial.left).toBe(100);
    expect(initial.top).toBe(100);

    // Synthesise pointer events on the chrome card. Dispatched on the
    // card element itself so React's synthetic event system picks them
    // up (the handler sits on the card div). Using `setPointerCapture`
    // requires the events to fire from a real PointerEvent constructor.
    await page.frame({ url: /iframe\.html/ })!.evaluate(() => {
      const host = document.querySelector("[data-deloop-chrome-host]") as HTMLElement | null;
      const card = host?.shadowRoot?.querySelector<HTMLElement>("[data-card-id]");
      if (!card) throw new Error("Card not present");
      // Start at the card's top-left + a small offset inside the chrome
      // padding so the drag handle is hit.
      const startX = 110;
      const startY = 110;
      // Drag delta — the AWK-14 reposition stores final coords on the
      // shell side via `cardMoved` and re-renders via the resulting
      // SET_POSITION dispatch.
      const dx = 200;
      const dy = 150;

      function fire(type: string, x: number, y: number) {
        const ev = new PointerEvent(type, {
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        });
        card!.dispatchEvent(ev);
      }

      fire("pointerdown", startX, startY);
      fire("pointermove", startX + dx / 2, startY + dy / 2);
      fire("pointermove", startX + dx, startY + dy);
      fire("pointerup", startX + dx, startY + dy);
    });

    // The card's position should have changed by the same delta.
    await expect
      .poll(async () => (await getCardPosition(page, 0)).left, { timeout: 5_000 })
      .toBe(300);
    const moved = await getCardPosition(page, 0);
    expect(moved.left).toBe(300);
    expect(moved.top).toBe(250);
    // CardId is preserved across the move (no remount).
    expect(moved.cardId).toBe(initial.cardId);
  });
});
