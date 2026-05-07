/**
 * E2E helper: synthesise a Deloop sidebar → canvas drop.
 *
 * Why synthesise rather than use Playwright's drag/drop primitives:
 * Playwright emulates HTML5 drag-and-drop by faking pointer movement,
 * which is unreliable for cross-document drags (sidebar in the shell,
 * drop target in the iframe). The locked AWK-14 scope explicitly opts
 * for synthetic drops at the iframe document level — that's what we do
 * here.
 *
 * The helper picks a sidebar entry by name to obtain the ComponentInfo
 * the shell would have set on `dragstart`, then dispatches a `drop`
 * event on the iframe document with a constructed `DataTransfer`
 * carrying the same MIME payload.
 */
import type { Page } from "@playwright/test";
import { COMPONENT_DRAG_MIME } from "../../../packages/app/src/component-drag.js";

interface ComponentInfo {
  name: string;
  path: string;
  relativePath: string;
}

/**
 * Resolves the ComponentInfo that the shell sidebar would emit on
 * dragstart for a given component name. Reads it from the live REST
 * endpoint (`/api/components`) so the test stays in step with whatever
 * the discovery layer actually serves.
 */
async function fetchComponentInfo(page: Page, name: string): Promise<ComponentInfo> {
  const components = await page.evaluate(async () => {
    const resp = await fetch("/api/components");
    return (await resp.json()) as ComponentInfo[];
  });
  const match = components.find((c) => c.name === name);
  if (!match) {
    throw new Error(
      `No component named "${name}" found in /api/components — got ${components
        .map((c) => c.name)
        .join(", ")}`,
    );
  }
  return match;
}

/**
 * Dispatches a synthetic `drop` event on the iframe document at the
 * given coordinates, carrying a Deloop component drag payload for
 * `componentName`. Returns once the shell has processed the drop and
 * the resulting `mount` has produced a card with a real cardId.
 *
 * `x`/`y` are iframe-document coordinates (clientX/Y inside the iframe),
 * matching what the iframe handler will read from `event.clientX +
 * window.scrollX`.
 */
export async function dropComponentOnCanvas(
  page: Page,
  componentName: string,
  x: number,
  y: number,
): Promise<void> {
  const component = await fetchComponentInfo(page, componentName);

  // Reach the iframe via Playwright's frame() API (not frameLocator,
  // which doesn't expose .evaluate). Match the canvas iframe by URL.
  const frame = page.frame({ url: /iframe\.html/ });
  if (!frame) {
    throw new Error("Canvas iframe not loaded — did you call page.goto first?");
  }

  // Wait for the iframe's React tree to hydrate AND the document-level
  // drag/drop listeners to be attached before dispatching the synthetic
  // drop. Without this wait, callers running immediately after sidebar
  // setup can race the iframe: the synthetic drop fires before
  // `IframeApp`'s drop-listener `useEffect` has run, and the event is
  // silently lost — manifests as flake under parallel workers.
  //
  // Readiness signal chosen: dispatch a probe `dragover` carrying our
  // MIME and check `event.defaultPrevented`. The iframe's handler calls
  // `preventDefault()` only when it matches `COMPONENT_DRAG_MIME`, so
  // `defaultPrevented === true` is positive proof the document-level
  // listener is installed and recognizes our payload — strictly
  // stronger than checking for `data-deloop-chrome-host` alone (the
  // host attribute is present after React's first commit, but the
  // listener-attaching `useEffect` runs in a separate tick afterward).
  //
  // The probe dragover does flip `dragOver` state in the iframe (a side
  // effect of `preventDefault`-ing the spec-required precursor), but the
  // real dropComponentOnCanvas dispatches its own dragover anyway, so
  // the state is the same as it would be on a real drag.
  await frame.waitForFunction(
    (mime) => {
      const probe = new Event("dragover", { bubbles: true, cancelable: true });
      const dt = new DataTransfer();
      dt.setData(mime, "{}");
      Object.defineProperty(probe, "dataTransfer", { value: dt });
      Object.defineProperty(probe, "clientX", { value: 0 });
      Object.defineProperty(probe, "clientY", { value: 0 });
      document.dispatchEvent(probe);
      return probe.defaultPrevented === true;
    },
    COMPONENT_DRAG_MIME,
    { timeout: 10_000 },
  );

  await frame.evaluate(
    ({ component, mime, x, y }) => {
      // `new DataTransfer()` works in Chromium for the constructor itself,
      // but `new DragEvent("drop", { dataTransfer })` quietly drops the
      // dataTransfer property on synthetic events — `event.dataTransfer`
      // ends up null. The reliable workaround is to dispatch a raw Event
      // and stamp `dataTransfer` on it via `Object.defineProperty`. The
      // iframe handler reads `event.dataTransfer` regardless of event
      // class, so this is functionally identical to a real drop.
      const dt = new DataTransfer();
      dt.setData(mime, JSON.stringify(component));
      dt.setData("text/plain", component.relativePath);

      function fireDragEvent(
        type: string,
        clientX: number,
        clientY: number,
      ): { defaultPrevented: boolean } {
        const ev = new Event(type, { bubbles: true, cancelable: true });
        // Stamp drop-event surface needed by the handler.
        Object.defineProperty(ev, "dataTransfer", { value: dt });
        Object.defineProperty(ev, "clientX", { value: clientX });
        Object.defineProperty(ev, "clientY", { value: clientY });
        document.dispatchEvent(ev);
        return { defaultPrevented: ev.defaultPrevented };
      }

      // dragover lets the handler call preventDefault and set
      // dropEffect, which is the spec-required precursor to the drop
      // event being honoured.
      fireDragEvent("dragover", x, y);
      fireDragEvent("drop", x, y);
    },
    { component, mime: COMPONENT_DRAG_MIME, x, y },
  );
}
