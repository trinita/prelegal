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
  /**
   * The saved document this is, once the server has one — a different thing
   * from `documentId`, which says which of the eleven templates is being
   * drafted. Null while the document is still only in this browser.
   */
  recordId: number | null;
  values: MndaValues | TermValues;
}

export const emptyWorkspace = (): Workspace => ({
  documentId: null,
  recordId: null,
  values: {},
});

/** A workspace for a document just chosen, with nothing filled in yet. */
export function startDocument(documentId: string): Workspace {
  return {
    documentId,
    // No saved row yet: one is created once the document is known to be real.
    recordId: null,
    // The MNDA opens with what the Common Paper template prints; the generated
    // documents have no published defaults to carry.
    values: documentId === MUTUAL_NDA_ID ? defaultValues() : {},
  };
}

/** A workspace restored from a saved document. */
export function restoreDocument(
  recordId: number,
  documentId: string,
  values: Workspace["values"],
): Workspace {
  return {
    documentId,
    recordId,
    // A document saved before it was filled in has no values; the MNDA's
    // template defaults belong there just as they would on a new one.
    values:
      documentId === MUTUAL_NDA_ID
        ? { ...defaultValues(), ...(values as Partial<MndaValues>) }
        : values,
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
