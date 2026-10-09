import assert from "node:assert/strict";
import test from "node:test";
import { customFetch } from "../../../lib/api-client-react/src/custom-fetch";

function stalledFetch(_input: unknown, options?: RequestInit): Promise<Response> {
  return new Promise((_, reject) => {
    const signal = options?.signal;
    const abort = () => reject(signal?.reason ?? new DOMException("Aborted", "AbortError"));
    if (signal?.aborted) abort();
    else signal?.addEventListener("abort", abort, { once: true });
  });
}

test("an unresponsive request stops waiting and warns against blindly retrying a save", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stalledFetch as typeof fetch;
  try {
    await assert.rejects(customFetch("/api/topics", { timeoutMs: 15 }),
      /request timed out.*may already have been saved.*check before trying again/i);
  } finally {
    globalThis.fetch = original;
  }
});

test("caller cancellation is preserved rather than reported as a timeout", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = stalledFetch as typeof fetch;
  try {
    const controller = new AbortController();
    const request = customFetch("/api/topics", { signal: controller.signal });
    controller.abort(new Error("Caller cancelled"));
    await assert.rejects(request, /Caller cancelled/);
  } finally {
    globalThis.fetch = original;
  }
});

test("504 errors explain an uncertain save without displaying nginx HTML", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html>504 Gateway Time-out nginx</html>", {
    status: 504, statusText: "Gateway Time-out", headers: { "content-type": "text/html" },
  });
  try {
    await assert.rejects(customFetch("/api/topics"), (error: unknown) => {
      assert.match((error as Error).message, /Refresh this page and check/);
      assert.doesNotMatch((error as Error).message, /<html>/);
      return true;
    });
  } finally {
    globalThis.fetch = original;
  }
});

test("a stalled CSRF request is included in the mutation deadline", async () => {
  const original = globalThis.fetch;
  const globals = globalThis as unknown as { window?: unknown };
  const previousWindow = globals.window;
  globals.window = {};
  let requestedUrl: unknown;
  globalThis.fetch = ((input, options) => {
    requestedUrl = input;
    return stalledFetch(input, options);
  }) as typeof fetch;
  try {
    await assert.rejects(customFetch("/api/topics", {
      method: "PATCH", body: "{}", timeoutMs: 15,
    }), /request timed out/i);
    assert.equal(requestedUrl, "/api/auth/csrf");
  } finally {
    globalThis.fetch = original;
    if (previousWindow === undefined) delete globals.window;
    else globals.window = previousWindow;
  }
});

test("the deadline also covers a response body that never finishes downloading", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, options?: RequestInit) => {
    const body = new ReadableStream({
      start(controller) {
        options?.signal?.addEventListener("abort", () =>
          controller.error(new DOMException("Aborted", "AbortError")), { once: true });
      },
    });
    return new Response(body, { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  try {
    await assert.rejects(customFetch("/api/topics", { timeoutMs: 15 }), /request timed out/i);
  } finally {
    globalThis.fetch = original;
  }
});
