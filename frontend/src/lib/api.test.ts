import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch, signIn } from "./api";

/** Enough of `fetch`'s signature for the assertions below to read the call. */
type FetchLike = (
  input: string,
  init?: RequestInit,
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** A `fetch` that answers once with the given status and body. */
function respondWith(status: number, body?: unknown, asText?: string) {
  const fetchMock = vi.fn<FetchLike>(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (asText !== undefined) throw new SyntaxError("Unexpected token");
      return body;
    },
  }));

  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("returns the parsed body", async () => {
    respondWith(200, { id: 1, name: "Ada" });

    await expect(apiFetch("/api/auth/me")).resolves.toEqual({ id: 1, name: "Ada" });
  });

  it("sends the session cookie", async () => {
    const fetchMock = respondWith(200, {});

    await apiFetch("/api/auth/me");

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: "include" });
  });

  it("has no body to parse on 204", async () => {
    // Calling .json() on a real empty response throws, so a mock that quietly
    // resolves to undefined would pass even without the 204 branch.
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchLike>(async () => ({
        ok: true,
        status: 204,
        json: async () => {
          throw new SyntaxError("Unexpected end of JSON input");
        },
      })),
    );

    await expect(apiFetch("/api/auth/logout", { method: "POST" })).resolves
      .toBeUndefined();
  });

  it("surfaces the server's message", async () => {
    respondWith(401, { detail: "Not signed in" });

    await expect(apiFetch("/api/auth/me")).rejects.toThrow("Not signed in");
  });

  it("surfaces the first field error from a rejected body", async () => {
    // The shape FastAPI returns when a request fails validation.
    respondWith(422, { detail: [{ msg: "Name must not be blank" }] });

    await expect(apiFetch("/api/auth/login")).rejects.toThrow(
      "Name must not be blank",
    );
  });

  it("still explains itself when the error body is not JSON", async () => {
    // A proxy or the static file server answering instead of the API.
    respondWith(502, undefined, "<html>Bad Gateway</html>");

    await expect(apiFetch("/api/auth/me")).rejects.toThrow("(502)");
  });

  it("carries the status so callers can tell 401 from the rest", async () => {
    respondWith(401, { detail: "Not signed in" });

    await expect(apiFetch("/api/auth/me")).rejects.toMatchObject({
      status: 401,
      name: "ApiError",
    });
  });

  it("reports an unreachable server as status 0, not as an answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchLike>(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    const caught = await apiFetch("/api/auth/me").catch((error: unknown) => error);

    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(0);
  });
});

describe("signIn", () => {
  it("posts the name to the login endpoint", async () => {
    const fetchMock = respondWith(200, { id: 1, name: "Ada" });

    await signIn("Ada");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/auth/login");
    expect(init).toMatchObject({ method: "POST", body: '{"name":"Ada"}' });
  });
});
