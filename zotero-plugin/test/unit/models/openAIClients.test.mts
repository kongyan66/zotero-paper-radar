import assert from "node:assert/strict";
import test from "node:test";
import {
  HttpTransport,
  NetworkRequestError,
  validateServiceBaseURL,
} from "../../../src/infrastructure/network/httpTransport.ts";
import { OpenAIEmbeddingClient } from "../../../src/infrastructure/models/openAIEmbeddingClient.ts";
import { OpenAIChatClient } from "../../../src/infrastructure/models/openAIChatClient.ts";

test("service URL requires HTTPS unless loopback HTTP is explicitly allowed", () => {
  assert.equal(
    validateServiceBaseURL("https://models.example.com/v1", false).href,
    "https://models.example.com/v1/",
  );
  assert.throws(
    () => validateServiceBaseURL("http://models.example.com/v1", true),
    (error: unknown) =>
      error instanceof NetworkRequestError && error.code === "insecure-url",
  );
  assert.throws(
    () => validateServiceBaseURL("http://localhost:11434/v1", false),
    (error: unknown) =>
      error instanceof NetworkRequestError &&
      error.code === "localhost-confirmation-required",
  );
  assert.equal(
    validateServiceBaseURL("http://127.0.0.1:11434/v1", true).href,
    "http://127.0.0.1:11434/v1/",
  );
});

test("embedding client authenticates and validates finite equal-sized vectors", async () => {
  let captured: RequestInit | undefined;
  const transport = new HttpTransport({
    fetch: async (_url, init) => {
      captured = init;
      return new Response(
        JSON.stringify({
          model: "text-embedding-test",
          data: [
            { index: 0, embedding: [0.1, 0.2, 0.3] },
            { index: 1, embedding: [0.4, 0.5, 0.6] },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    },
  });
  const client = new OpenAIEmbeddingClient({
    baseURL: "https://models.example.com/v1",
    apiKey: "never-log-this-key",
    model: "text-embedding-test",
    transport,
  });

  const result = await client.embedDocuments([
    { title: "Paper A", abstract: "Abstract A" },
    { title: "Paper B", abstract: "Abstract B" },
  ]);

  assert.equal(result.model, "text-embedding-test");
  assert.equal(result.dimensions, 3);
  assert.deepEqual(result.vectors, [
    [0.1, 0.2, 0.3],
    [0.4, 0.5, 0.6],
  ]);
  assert.equal(
    (captured?.headers as Record<string, string>).Authorization,
    "Bearer never-log-this-key",
  );
  assert.deepEqual(JSON.parse(String(captured?.body)), {
    model: "text-embedding-test",
    input: [
      "Title: Paper A\nAbstract: Abstract A",
      "Title: Paper B\nAbstract: Abstract B",
    ],
  });
});

test("embedding client rejects invalid response vectors", async () => {
  const transport = new HttpTransport({
    fetch: async () =>
      new Response(
        JSON.stringify({
          data: [
            { index: 0, embedding: [0.1, Number.NaN] },
            { index: 1, embedding: [0.2] },
          ],
        }),
        { status: 200 },
      ),
  });
  const client = new OpenAIEmbeddingClient({
    baseURL: "https://models.example.com/v1",
    apiKey: "secret",
    model: "broken-model",
    transport,
  });

  await assert.rejects(
    () =>
      client.embedDocuments([
        { title: "A", abstract: "A" },
        { title: "B", abstract: "B" },
      ]),
    (error: unknown) =>
      error instanceof NetworkRequestError &&
      error.code === "invalid-model-response",
  );
});

test("model clients identify the configured provider in transport errors", async () => {
  const transport = new HttpTransport({
    maxAttempts: 1,
    fetch: async () =>
      new Response(JSON.stringify({ message: "temporary failure" }), {
        status: 500,
      }),
  });
  const client = new OpenAIEmbeddingClient({
    provider: "siliconflow",
    baseURL: "https://api.siliconflow.cn/v1",
    apiKey: "test-key",
    model: "BAAI/bge-m3",
    transport,
  });

  await assert.rejects(
    () => client.embedDocuments([{ title: "A", abstract: "B" }]),
    (error: unknown) =>
      error instanceof NetworkRequestError &&
      error.message.includes("硅基流动返回 HTTP 500"),
  );
});

test("disabled chat client cannot call the network", async () => {
  let calls = 0;
  const client = new OpenAIChatClient({
    enabled: false,
    baseURL: "https://models.example.com/v1",
    apiKey: "secret",
    model: "chat-test",
    transport: new HttpTransport({
      fetch: async () => {
        calls += 1;
        return new Response("{}");
      },
    }),
  });

  await assert.rejects(
    () => client.generateChineseSummary({ title: "A", abstract: "B" }),
    (error: unknown) =>
      error instanceof NetworkRequestError && error.code === "llm-disabled",
  );
  assert.equal(calls, 0);
});

test("chat client returns processed Chinese text without retaining input", async () => {
  const client = new OpenAIChatClient({
    enabled: true,
    baseURL: "https://models.example.com/v1",
    apiKey: "secret",
    model: "chat-test",
    transport: new HttpTransport({
      fetch: async () =>
        new Response(
          JSON.stringify({
            model: "chat-test",
            choices: [{ message: { content: "这是一段中文摘要。" } }],
          }),
          { status: 200 },
        ),
    }),
  });

  const result = await client.generateChineseSummary({
    title: "Private title",
    abstract: "Private abstract",
  });
  assert.equal(result.text, "这是一段中文摘要。");
  assert.equal(result.model, "chat-test");
  assert.equal(JSON.stringify(result).includes("Private abstract"), false);
});

test("Ark providers use their distinct OpenAI-compatible endpoints", async () => {
  const urls: string[] = [];
  const transport = new HttpTransport({
    fetch: async (url) => {
      urls.push(String(url));
      if (String(url).endsWith("/embeddings")) {
        return new Response(
          JSON.stringify({
            model: "doubao-embedding-text-240515",
            data: [{ index: 0, embedding: [1, 0] }],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          model: "doubao-seed-2-0-pro-260215",
          choices: [{ message: { content: "研究问题：测试。" } }],
        }),
        { status: 200 },
      );
    },
  });
  const embeddingClient = new OpenAIEmbeddingClient({
    provider: "volcengine-ark",
    baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    apiKey: "ark-key",
    model: "doubao-embedding-text-240515",
    transport,
  });
  const chatClient = new OpenAIChatClient({
    provider: "volcengine-ark-coding",
    enabled: true,
    baseURL: "https://ark.cn-beijing.volces.com/api/coding/v3",
    apiKey: "coding-key",
    model: "doubao-seed-2-0-pro-260215",
    transport,
  });

  await embeddingClient.embedDocuments([{ title: "A", abstract: "B" }]);
  await chatClient.generateChineseSummary({ title: "A", abstract: "B" });

  assert.deepEqual(urls, [
    "https://ark.cn-beijing.volces.com/api/v3/embeddings",
    "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions",
  ]);
});

test("SiliconFlow uses the OpenAI-compatible embedding and chat endpoints", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const transport = new HttpTransport({
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      if (String(url).endsWith("/embeddings")) {
        return new Response(
          JSON.stringify({
            model: "BAAI/bge-m3",
            data: [{ index: 0, embedding: [0.1, 0.2] }],
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          model: "Qwen/Qwen3-8B",
          choices: [{ message: { content: "中文测试摘要" } }],
        }),
        { status: 200 },
      );
    },
  });
  const embeddingClient = new OpenAIEmbeddingClient({
    provider: "siliconflow",
    baseURL: "https://api.siliconflow.cn/v1",
    apiKey: "siliconflow-key",
    model: "BAAI/bge-m3",
    transport,
  });
  const chatClient = new OpenAIChatClient({
    provider: "siliconflow",
    enabled: true,
    baseURL: "https://api.siliconflow.cn/v1",
    apiKey: "siliconflow-key",
    model: "Qwen/Qwen3-8B",
    transport,
  });

  await embeddingClient.embedDocuments([{ title: "A", abstract: "B" }]);
  await chatClient.generateChineseSummary({ title: "A", abstract: "B" });

  assert.deepEqual(
    requests.map((request) => request.url),
    [
      "https://api.siliconflow.cn/v1/embeddings",
      "https://api.siliconflow.cn/v1/chat/completions",
    ],
  );
  assert.equal(
    (requests[0]?.init?.headers as Record<string, string>).Authorization,
    "Bearer siliconflow-key",
  );
  assert.equal(
    (requests[1]?.init?.headers as Record<string, string>).Authorization,
    "Bearer siliconflow-key",
  );
  assert.equal(
    JSON.parse(String(requests[0]?.init?.body)).model,
    "BAAI/bge-m3",
  );
  assert.equal(
    JSON.parse(String(requests[1]?.init?.body)).model,
    "Qwen/Qwen3-8B",
  );
});

test("Ark client rejects the wrong regional or plan endpoint", () => {
  assert.throws(
    () =>
      new OpenAIEmbeddingClient({
        provider: "volcengine-ark-coding",
        baseURL: "https://ark.cn-beijing.volces.com/api/v3",
        apiKey: "secret",
        model: "embedding-test",
      }),
    (error: unknown) =>
      error instanceof NetworkRequestError && error.code === "invalid-url",
  );
});
