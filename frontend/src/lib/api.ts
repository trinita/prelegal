/**
 * The one place the frontend talks to the backend.
 *
 * In the container FastAPI serves these pages itself, so requests are
 * same-origin and the base URL is empty. Under `npm run dev` the pages come
 * from Next on :3000 while the API stays on :8000, so the default reaches
 * across the gap - no env file to copy before the app works. The session cookie
 * still travels, because the backend allows that origin with credentials.
 *
 * `NEXT_PUBLIC_API_BASE_URL` overrides both, for a backend somewhere else.
 */
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface User {
  id: number;
  name: string;
  email: string;
}

/**
 * FastAPI reports a plain message in `detail`, and a list of field errors when
 * a body fails validation. Either way the user should see a sentence, not a
 * status code.
 */
async function messageFor(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown })?.detail;

    if (typeof detail === "string") return detail;

    if (Array.isArray(detail)) {
      const first = (detail as Array<{ msg?: unknown }>)[0]?.msg;
      if (typeof first === "string") return first;
    }
  } catch {
    // Not JSON, or an empty body; fall through to the generic message.
  }

  return `Something went wrong (${response.status}).`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      credentials: "include",
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    // A network-level failure has no status, so callers cannot mistake it for
    // an answer from the server.
    throw new ApiError(0, "Could not reach the server. Is it running?");
  }

  if (!response.ok) throw new ApiError(response.status, await messageFor(response));

  // 204, as logout returns: there is no body to parse.
  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

export interface Credentials {
  email: string;
  password: string;
}

export const signIn = (credentials: Credentials) =>
  apiFetch<User>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials),
  });

export const signUp = (registration: Credentials & { name: string }) =>
  apiFetch<User>("/api/auth/signup", {
    method: "POST",
    body: JSON.stringify(registration),
  });

export const signOut = () => apiFetch<void>("/api/auth/logout", { method: "POST" });

export const fetchCurrentUser = () => apiFetch<User>("/api/auth/me");

/**
 * One turn of a saved conversation.
 *
 * Declared here rather than imported from `lib/chat.ts`, which already imports
 * `apiFetch` from this module: taking its `ChatTurn` back would close a cycle.
 * The two shapes are held to each other in `turn-drift.test.ts`, in both
 * directions, because a duplicated shape is one that drifts.
 */
export interface SavedTurn {
  role: "user" | "assistant";
  content: string;
}

export interface DocumentSummary {
  /** This saved document's own id — not the catalogue's `documentId`. */
  id: number;
  documentType: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetail extends DocumentSummary {
  values: DocumentValues;
  transcript: SavedTurn[];
}

/**
 * A document's answers, as they travel over the wire.
 *
 * Deliberately `object` rather than `Record<string, unknown>`: the Mutual NDA's
 * values are a declared interface, and an interface has no index signature, so
 * the stricter type would reject the very shape this is for. What is inside is
 * the catalogue's business, not this module's.
 */
export type DocumentValues = object;

export const listDocuments = () => apiFetch<DocumentSummary[]>("/api/documents");

export const fetchDocument = (id: number) =>
  apiFetch<DocumentDetail>(`/api/documents/${id}`);

export const createDocument = (documentType: string) =>
  apiFetch<DocumentDetail>("/api/documents", {
    method: "POST",
    body: JSON.stringify({ documentType }),
  });

/**
 * Saves whichever halves are given. The chat writes the transcript and the
 * form writes the values, and neither has to send the other's state back to
 * leave it undisturbed.
 */
export const saveDocument = (
  id: number,
  patch: { values?: DocumentValues; transcript?: SavedTurn[] },
) =>
  apiFetch<DocumentDetail>(`/api/documents/${id}`, {
    method: "PUT",
    body: JSON.stringify(patch),
  });
