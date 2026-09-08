/**
 * What the user is drafting, and what they have said about it.
 *
 * One shape covers all eleven documents. The Mutual NDA keeps the structured
 * `MndaValues` its cover page needs; the other ten use a flat map keyed by
 * field name. Which one applies follows from `documentId`, so nothing has to
 * guess.
 */
import { defaultValues, type MndaValues } from "./fields";
import { MUTUAL_NDA_ID, findDocument, type TermValues } from "./documents";

export interface Workspace {
  /** Null until the user has settled on a document. */
  documentId: string | null;
  values: MndaValues | TermValues;
}

export const emptyWorkspace = (): Workspace => ({ documentId: null, values: {} });

/** A workspace for a document just chosen, with nothing filled in yet. */
export function startDocument(documentId: string): Workspace {
  return {
    documentId,
    // The MNDA opens with what the Common Paper template prints; the generated
    // documents have no published defaults to carry.
    values: documentId === MUTUAL_NDA_ID ? defaultValues() : {},
  };
}

export const isMutualNda = (workspace: Workspace) =>
  workspace.documentId === MUTUAL_NDA_ID;

/**
 * Whether a workspace can be rendered.
 *
 * A document id the catalogue no longer has - a stale draft, a renamed
 * template - would otherwise reach the renderer and throw.
 */
export function isRenderable(workspace: Workspace): boolean {
  if (workspace.documentId === null) return false;
  return isMutualNda(workspace) || findDocument(workspace.documentId) !== null;
}
