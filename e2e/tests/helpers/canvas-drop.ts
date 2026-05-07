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
import type { Frame, Page } from "@playwright/test";
import { COMPONENT_DRAG_MIME } from "../../../packages/app/src/component-drag.js";

interface ComponentInfo {
  name: string;
  path: string;
  relativePath: string;
}

/**
 * Polls until `page.frame({url: /iframe\.html/})` returns a non-null
 * Frame. Used after operations that may trigger a Vite full-reload
 * (e.g. cold-Vite dep optimization), where the iframe is briefly torn
 * down before the new document loads.
 */
async function waitForCanvasFrame(page: Page, deadlineMs: number): Promise<Frame> {
  while (Date.now() < deadlineMs) {
    const frame = page.frame({ url: /iframe\.html/ });
    if (frame && !frame.isDetached()) return frame;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Canvas iframe not present before deadline");
}

/**
 * Resolves to a canvas iframe Frame whose document-level drop listener
 * is installed and recognizes Deloop's component-drag MIME. Survives a
 * Vite full-reload mid-probe by detecting the resulting "frame detached"
 * error, polling for the new iframe, and retrying the probe.
 *
 * The dragover-defaultPrevented probe is the load-bearing readiness
 * signal — see comments at the call site.
 */
async function waitForReadyCanvasFrame(page: Page, timeoutMs: number): Promise<Frame> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = await waitForCanvasFrame(page, deadline);
    try {
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
        { timeout: Math.max(deadline - Date.now(), 100) },
      );
      // Probe succeeded on a still-attached frame — caller can dispatch
      // the synthetic drop against this Frame safely.
      if (!frame.isDetached()) return frame;
      // Frame got detached between probe success and return — loop and
      // re-acquire the post-reload iframe.
    } catch (err) {
      // Re-throw any error that isn't a frame-detached symptom; those
      // mean the iframe really is gone (test-author error, page closed,
      // etc.) and a longer wait wouldn't help.
      const message = err instanceof Error ? err.message : String(err);
      if (!/frame was detached|execution context was destroyed/i.test(message)) {
        throw err;
      }
      // Frame got detached mid-probe — that's a Vite reload firing
      // exactly as we want. Loop and re-acquire the post-reload frame.
    }
  }
  throw new Error("Canvas iframe drop listener not ready before deadline");
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

  // Prewarm Vite for this component's module graph (AWK-90).
  //
  // Failure mode being prevented: under `CI=1`, `playwright.config.ts`
  // sets `reuseExistingServer: false`, so each `pnpm test:e2e`
  // invocation boots a fresh Vite. The first iframe `import()` of a
  // user component (the one triggered by the shell's `mount` after a
  // synthetic drop) makes Vite discover new bare-import deps
  // (e.g. `class-variance-authority`, `radix-ui`, `clsx`,
  // `tailwind-merge`) and rebuild the depOptimize bundle. After the
  // rebuild Vite issues a full page reload to swap the iframe over to
  // the freshly-bundled deps. That reload tears down the iframe's
  // `mounted` Map state, so the dropped card disappears mid-test —
  // observed as `toBeVisible` timeout for the rendered Button on the
  // first attempt, recovering on retry once Vite is warm.
  //
  // Fix shape: trigger an ESM evaluation of the user component module
  // BEFORE we synthesize the drop, then await the post-warmup readiness
  // probe below. If the prewarm import causes Vite to reload, the
  // reload happens here — not after the drop. By the time the probe
  // returns true, the iframe's drop-listener `useEffect` has run on a
  // hot Vite, and the synthetic drop's downstream `mount` import hits a
  // cache hit (~30-50ms locally vs. 300ms+ on cold transform).
  //
  // We catch errors from the prewarm `import()` call: if Vite reloads
  // mid-import, the in-flight module evaluation is aborted with an
  // error. That's expected — the readiness probe below is the
  // load-bearing post-condition, not the prewarm import's resolution.
  //
  // Side-effect note: this evaluates the user component module's top
  // level. Current `@deloop/ui` shims (button.deloop.tsx, tooltip.deloop.tsx)
  // are pure imports + a function declaration with no top-level effects
  // (no telemetry, no registration, no console writes). A future user
  // component with top-level effects would fire those twice — once on
  // warmup, once on real mount. That is a known constraint of this
  // helper, not a defect; if it ever bites, move the prewarm into a
  // Playwright fixture that uses a side-effect-free probe component.
  const componentImportPath = `/@fs${component.path}`;
  const frameForWarmup = page.frame({ url: /iframe\.html/ });
  if (!frameForWarmup) {
    throw new Error("Canvas iframe not loaded — did you call page.goto first?");
  }
  await frameForWarmup
    .evaluate((path) => {
      // `/* @vite-ignore */` matches the iframe's own dynamic-import
      // call site, so Vite treats this exactly the same way at module-
      // graph level.
      return import(/* @vite-ignore */ path).then(
        () => undefined,
        () => undefined,
      );
    }, componentImportPath)
    .catch(() => {
      // If Vite tears down the iframe context to reload, this
      // `frame.evaluate` itself can reject with an "execution context
      // destroyed" error. That's the success case — the reload is what
      // we want to happen here, not after the drop.
    });

  // Re-acquire the frame and run the drop-listener readiness probe.
  // Wrapped in a retry loop because a Vite full-reload triggered by
  // the prewarm above can detach the frame mid-probe (the old document
  // is being torn down). On detach we poll for the new iframe and
  // retry; once the post-reload iframe's drop listener is installed
  // the probe succeeds and we exit.
  //
  // Readiness signal: dispatch a probe `dragover` carrying our MIME
  // and check `event.defaultPrevented`. The iframe's handler calls
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
  const frame = await waitForReadyCanvasFrame(page, 10_000);

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
