import assert from "node:assert/strict";
import test from "node:test";
import { ModelConnectionTester } from "../../../src/application/modelConnectionTester.ts";
import {
  HttpTransport,
  NetworkRequestError,
  redactSensitiveText,
} from "../../../src/infrastructure/network/httpTransport.ts";
import { OpenAIEmbeddingClient } from "../../../src/infrastructure/models/openAIEmbeddingClient.ts";
import { OpenAIChatClient } from "../../../src/infrastructure/models/openAIChatClient.ts";

test("transport retries 429 and 5xx with cancellable exponential backoff", async () => {
  const statuses = [429, 503, 200];
  const delays: number[] = [];
  const transport = new HttpTransport({
    fetch: async () =>
      new Response(JSON.stringify({ ok: true }), {
        status: statuses.shift() ?? 500,
      }),
    sleep: async (milliseconds) => {
      delays.push(milliseconds);
    },
    maxAttempts: 3,
    baseDelayMs: 25,
  });

  const result = await transport.requestJSON<{ ok: boolean }>({
    url: "https://models.example.com/v1/test",
    method: "POST",
  });

  assert.deepEqual(delays, [25, 50]);
  assert.equal(result.data.ok, true);
});

test("transport reports timeout with stable redacted diagnostics", async () => {
  const secret = "sk-private-token";
  const transport = new HttpTransport({
    fetch: async (_url, init) =>
      await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
    maxAttempts: 1,
  });

  await assert.rejects(
    () =>
      transport.requestJSON({
        url: `https://models.example.com/v1/test?api_key=${secret}`,
        headers: { Authorization: `Bearer ${secret}` },
        timeoutMs: 5,
      }),
    (error: unknown) => {
      assert.ok(error instanceof NetworkRequestError);
      assert.equal(error.code, "request-timeout");
      assert.equal(
        JSON.stringify(error.toDiagnostic()).includes(secret),
        false,
      );
      return true;
    },
  );
  assert.equal(redactSensitiveText(`Bearer ${secret}`).includes(secret), false);
});

test("connection tester reports embedding dimensions and skips disabled LLM", async () => {
  const embeddingClient = new OpenAIEmbeddingClient({
    baseURL: "https://models.example.com/v1",
    apiKey: "secret",
    model: "embedding-test",
    transport: new HttpTransport({
      fetch: async () =>
        new Response(
          JSON.stringify({ data: [{ index: 0, embedding: [1, 0, 0, 0] }] }),
          { status: 200 },
        ),
    }),
  });
  const llmClient = new OpenAIChatClient({
    enabled: false,
    baseURL: "https://models.example.com/v1",
    apiKey: "secret",
    model: "chat-test",
    transport: new HttpTransport({
      fetch: async () => {
        throw new Error("must not call");
      },
    }),
  });
  const tester = new ModelConnectionTester({ now: () => 1_000 });

  const result = await tester.test({ embeddingClient, llmClient });

  assert.equal(result.embedding.ok, true);
  assert.equal(result.embedding.model, "embedding-test");
  assert.equal(result.embedding.dimensions, 4);
  assert.equal(result.llm.status, "skipped");
  assert.equal(JSON.stringify(result).includes("测试摘要"), false);
});

test("enabled LLM connection requires non-empty output", async () => {
  const embeddingClient = new OpenAIEmbeddingClient({
    baseURL: "https://models.example.com/v1",
    apiKey: "secret",
    model: "embedding-test",
    transport: new HttpTransport({
      fetch: async () =>
        new Response(
          JSON.stringify({ data: [{ index: 0, embedding: [1, 0] }] }),
          { status: 200 },
        ),
    }),
  });
  const llmClient = new OpenAIChatClient({
    enabled: true,
    baseURL: "https://models.example.com/v1",
    apiKey: "secret",
    model: "chat-test",
    transport: new HttpTransport({
      fetch: async () =>
        new Response(
          JSON.stringify({ choices: [{ message: { content: "   " } }] }),
          { status: 200 },
        ),
    }),
  });

  const result = await new ModelConnectionTester().test({
    embeddingClient,
    llmClient,
  });

  assert.equal(result.embedding.ok, true);
  assert.equal(result.llm.status, "failed");
  assert.equal(result.llm.error?.code, "empty-model-response");
});
