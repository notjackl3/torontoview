/**
 * Shared types for how a user is taking a site. The analysis pipeline (permits,
 * shadow, drainage, traffic, stakeholder, grants) branches on this — renting
 * an existing space looks very different from a ground-up build, so we plumb
 * the mode through everything that scopes its output to the proposal.
 */

export type BuildMode = "new-build" | "demolish-rebuild" | "move-in";

export type LeaseTerm = "short" | "long";

export const BUILD_MODE_LABELS: Record<BuildMode, string> = {
  "new-build": "New build",
  "demolish-rebuild": "Demolish & rebuild",
  "move-in": "Move in / lease",
};

export function isOwnershipMode(mode: BuildMode | undefined): boolean {
  return mode === "new-build" || mode === "demolish-rebuild";
}

export function involvesNewConstruction(mode: BuildMode | undefined): boolean {
  return mode === "new-build" || mode === "demolish-rebuild";
}
