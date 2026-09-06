import assert from "node:assert/strict";
import test from "node:test";
import { ArxivClient } from "../../src/infrastructure/arxiv/arxivClient.ts";
import { HttpTransport } from "../../src/infrastructure/network/httpTransport.ts";
import { FixedClock } from "../../src/shared/clock.ts";
import { startMockHTTPServer } from "../support/mockHttpServer.ts";

test("fetches and normalizes arXiv Atom candidates with a bounded date query", async () => {
  const server = await startMockHTTPServer(
    `<feed><opensearch:totalResults xmlns:opensearch="x">1</opensearch:totalResults><entry><id>https://arxiv.org/abs/2608.24845v1</id><published>2026-08-26T08:00:00Z</published><title>CV paper</title><summary>Abstract</summary><author><name>Author</name></author><category term="cs.CV"/></entry></feed>`,
  );
  try {
    const client = new ArxivClient({
      endpoint: server.url,
      clock: new FixedClock("2026-08-27T08:00:00Z"),
      transport: new HttpTransport({ defaultTimeoutMs: 2_000 }),
    });
    const result = await client.fetchCandidates({
      categories: ["cs.CV", "cs.CL"],
      maxResults: 50,
    });
    assert.equal(result.candidates[0].arxivId, "2608.24845");
    assert.match(server.requests[0], /cat%3Acs\.CL/);
    assert.match(
      server.requests[0],
      /submittedDate%3A%5B202608240800\+TO\+202608270800%5D/,
    );
    assert.match(server.requests[0], /max_results=50/);
    assert.equal(result.window.days, 3);
  } finally {
    await server.close();
  }
});

test("does not hide a failed response behind a successful timestamp", async () => {
  const server = await startMockHTTPServer("temporary", { status: 503 });
  try {
    const client = new ArxivClient({
      endpoint: server.url,
      clock: new FixedClock("2026-08-27T08:00:00Z"),
      transport: new HttpTransport({ maxAttempts: 1, defaultTimeoutMs: 2_000 }),
    });
    await assert.rejects(client.fetchCandidates(), /arXiv 服务返回 HTTP 503/);
  } finally {
    await server.close();
  }
});
