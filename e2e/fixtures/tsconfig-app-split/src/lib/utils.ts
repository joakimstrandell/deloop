/**
 * Trivial alias target consumed via `@/lib/utils`.
 *
 * This file's only job is to be reachable via the path-alias declared in
 * `tsconfig.app.json` so the dev server has to resolve `@/lib/utils` to
 * here. If the AWK-75 path-alias propagation regresses, the import below
 * will fail at runtime and the e2e mount assertion will fail.
 */
export function label(): string {
  return "alias-resolved";
}
