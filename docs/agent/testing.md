# Testing Guidelines

## Purpose

Ensure each issue is delivered with the right depth of confidence using unit, integration, and E2E tests.

## Test Pyramid for Deloop

- **Unit tests**: pure logic and deterministic modules.
- **Integration tests**: boundaries between modules/processes.
- **E2E tests**: user-visible behavior across shell + iframe + CLI runtime.

## Where Each Test Type Applies

- Unit (`packages/cli/src/` and pure helpers in `packages/app/src/`):
  - component discovery
  - protocol parsing/validation
  - data transformation logic
- Integration:
  - `/api/*` contract behavior
  - shell <-> iframe message handling across boundaries
  - dynamic component mount flow (`/api/components` -> `postMessage` -> iframe render)
- E2E (`e2e/tests/`):
  - primary user workflows
  - iframe rendering correctness from user perspective
  - HMR-visible updates
  - persistence behavior where applicable

## TDD Triggers

Use red-green-refactor for new or changed logic modules before implementation:

- New module in `packages/cli/src/`.
- Behavioral changes to existing CLI modules.
- Protocol validation or message-shape logic.

TDD is not required for pure exploratory spikes, but stable interfaces from spikes must be covered before merge.

## Minimum Test Requirements Per Issue

Each issue should include:

- At least one unit or integration test for each acceptance criterion that is logic-heavy.
- At least one E2E test for each new user-facing workflow.
- Regression coverage for known bug fixes.

## E2E Conventions

- Use `@playwright/test` in `e2e/tests/`.
- Reach canvas content via `frameLocator('iframe#canvas')`.
- Assert visible behavior, not implementation internals.
- Prefer stable selectors and user-facing text.

## Test Determinism

Tests that observe real OS-level events — filesystem watchers (chokidar), process signals, real network timing, real timers — must be made deterministic via mocks. Do not gate assertions on a `setTimeout` long enough to "probably" allow the event to arrive: CI runners are slower than local machines, and the resulting flakes hide real regressions.

When a test passes locally but fails in CI with a timing-sensitive symptom, treat the test instrumentation as broken, not the implementation under test. Diagnose the race and fix it (mock the event source, or wait on a deterministic signal); do not retry or extend the timeout.

## Tests Are Bug Detectors, Not Bug Workarounds

When a test reveals a bug — even a bug the test was not written to catch — fix the bug in product code. Do not paper over it in the test layer.

A test "fix" is a workaround when:

- The failing assertion observes real product behavior, and the proposed fix changes test setup, helpers, or fixtures to dodge a symptom that would still occur in production.
- A real user, not the test harness, would see the same symptom on the same path.
- The fix relocates the symptom in time (e.g., prewarming product code before the assertion) without removing it from the product path.
- The change keeps tests green but leaves the underlying behavior shipping.

Before scoping a fix at the test layer, answer:

1. Is the failing assertion observing real product behavior?
2. Would a real user see the same symptom?
3. Does the proposed fix change product behavior, or only the test's exposure to it?

If (1) and (2) are yes and (3) is "only the test's exposure", the bug is unfixed. Reframe scope to fix the product.

Acceptable test-layer changes:

- Removing real-OS-event nondeterminism (mocks for chokidar, real timers, real network) per "Test Determinism" above.
- Waiting on deterministic signals instead of timing-based ones.
- Replacing brittle selectors with stable ones.
- Repairing test setup that was wrong from the start.

Forbidden test-layer changes:

- Prewarming, pre-loading, or pre-evaluating product code to dodge a runtime side effect (reload, reflow, race) that real users would hit.
- Extending timeouts, raising retries, or marking flaky to mask a real defect.
- Adding helpers that compensate for a product bug rather than testing around it.

When a test surfaces a bug outside its original scope, file a follow-up issue and fix the bug. Do not absorb the workaround into the test suite. When the product fix lands, any prior test-layer mitigation gets removed in the same PR (or a follow-up linked from it) — keeping the workaround alongside the fix is itself a violation.

## Definition of Done (Required Checks)

Before marking an issue Done:

1. `pnpm check` passes with zero warnings.
2. `pnpm test:unit` passes.
3. Relevant integration tests pass.
4. Relevant `pnpm test:e2e` scenarios pass.
5. Issue links PR and includes test evidence summary.

If a check is intentionally deferred, document why in the PR and the issue before merge.
