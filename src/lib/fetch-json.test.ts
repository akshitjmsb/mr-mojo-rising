import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson, HttpResponseError } from "./fetch-json";

test("retries a transient server failure and returns JSON", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? Response.json({ error: "temporary" }, { status: 503 })
      : Response.json({ id: "song-1" });
  };

  try {
    const result = await fetchJson<{ id: string }>("https://example.test", {
      attempts: 2,
      retryDelayMs: 0,
    });
    assert.equal(result.id, "song-1");
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("does not retry a permanent request error", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ error: "Invalid YouTube URL" }, { status: 400 });
  };

  try {
    await assert.rejects(
      fetchJson("https://example.test", { attempts: 3, retryDelayMs: 0 }),
      (error: unknown) =>
        error instanceof HttpResponseError &&
        error.status === 400 &&
        error.message === "Invalid YouTube URL",
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("turns a non-JSON gateway response into a useful HTTP error", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("gateway unavailable", { status: 502 });

  try {
    await assert.rejects(
      fetchJson("https://example.test", { attempts: 1 }),
      (error: unknown) =>
        error instanceof HttpResponseError && error.status === 502,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
