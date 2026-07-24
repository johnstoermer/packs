import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker/index.js";

test("Sites worker falls back to the static app document", async () => {
  const requests = [];
  const env = {
    ASSETS: {
      async fetch(request) {
        const url = new URL(request.url);
        requests.push(url.pathname);
        return url.pathname === "/index.html"
          ? new Response("<!doctype html><title>PACKWORKS</title>", { status: 200 })
          : new Response("missing", { status: 404 });
      },
    },
  };
  const response = await worker.fetch(new Request("https://packworks.test/"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(requests, ["/", "/index.html"]);
});

test("Sites worker rejects non-idempotent methods", async () => {
  const response = await worker.fetch(new Request("https://packworks.test/", { method: "POST" }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get("allow"), "GET, HEAD");
});
