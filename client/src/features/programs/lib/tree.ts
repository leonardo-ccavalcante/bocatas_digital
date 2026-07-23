/**
 * tree.ts — pure helpers for the program tree (ADR-0013).
 * No React, no tRPC — safe to import in tests and server-side code.
 */
import type { Program } from "../schemas";

/** Returns only root-level programs (no parent). */
export function getRoots(programs: Program[]): Program[] {
  return programs.filter((p) => !p.parent_id);
}

/** Returns the ordered ancestor chain for programId, nearest-root first. */
export function getAncestors(programs: Program[], programId: string): Program[] {
  const byId = new Map(programs.map((p) => [p.id, p]));
  const ancestors: Program[] = [];
  let current = byId.get(programId);
  while (current?.parent_id) {
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    ancestors.unshift(parent);
    current = parent;
  }
  return ancestors;
}

/** Returns direct children of a given program id. */
export function getChildren(programs: Program[], parentId: string): Program[] {
  return programs.filter((p) => p.parent_id === parentId);
}

/**
 * Suggests a tipo for a new child based on the parent's tipo.
 * "curso" parents spawn "edicion" children; everything else spawns "basico".
 */
export function suggestChildTipo(
  parentTipo: string | undefined | null
): "edicion" | "basico" {
  return parentTipo === "curso" ? "edicion" : "basico";
}
