export interface ComponentInfo {
  /** Display name derived from the filename (e.g. "Button") */
  name: string;
  /** Absolute filesystem path to the component file */
  path: string;
  /** Path relative to the project root (for display) */
  relativePath: string;
}

// postMessage protocol — authoritative type definitions
// See ADR-0001 and CLAUDE.md: never change these without updating both shell and iframe.

export type ShellToIframeMessage =
  | { type: "MOUNT_COMPONENT"; id: string; path: string; props: Record<string, unknown> }
  | { type: "UNMOUNT_COMPONENT"; id: string }
  | { type: "UPDATE_PROPS"; id: string; props: Record<string, unknown> };

export type IframeToShellMessage =
  | { type: "COMPONENT_READY"; id: string }
  | { type: "COMPONENT_ERROR"; id: string; error: string };
