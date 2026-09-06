import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { ArxivClient } from "../../src/infrastructure/arxiv/arxivClient.ts";
import {
  EmbeddingBatcher,
  type EmbeddingStore,
} from "../../src/domain/embeddings/embeddingBatcher.ts";
import { createEmbeddingContentHash } from "../../src/domain/embeddings/modelFingerprint.ts";
import { OpenAIChatClient } from "../../src/infrastructure/models/openAIChatClient.ts";
import { OpenAIEmbeddingClient } from "../../src/infrastructure/models/openAIEmbeddingClient.ts";
import {
  HttpTransport,
  NetworkRequestError,
} from "../../src/infrastructure/network/httpTransport.ts";
import {
  MigrationError,
  MigrationRunner,
  type Migration,
  type MigrationDatabase,
} from "../../src/infrastructure/storage/migrationRunner.ts";
import { validatePdfResponse } from "../../src/domain/importing/pdfPolicy.ts";
import { startMockHTTPServer } from "../support/mockHttpServer.ts";

interface DurableState {
  profiles: string[];
  savedItems: string[];
  feedback: string[];
  checkpoint: { stage: string; completed: number };
}

const failureFixturePath = new URL(
  "../fixtures/failures/failure-matrix.json",
  import.meta.url,
);

test("failure matrix declares the five external and persistence fault classes", async () => {
  const fixture = JSON.parse(await readFile(failureFixturePath, "utf8")) as {
    failureTypes: string[];
    invariants: string[];
  };
  assert.deepEqual(fixture.failureTypes, [
    "arxiv",
    "embedding",
    "llm",
    "pdf",
    "database",
  ]);
  assert.deepEqual(fixture.invariants, [
    "profiles",
    "saved-items",
    "feedback",
    "checkpoints",
  ]);
});

test("arXiv 503 leaves the last published workspace unchanged", async () => {
  const server = await startMockHTTPServer("temporary", { status: 503 });
  const before = createState();
  try {
    const client = new ArxivClient({
      endpoint: server.url,
      transport: new HttpTransport({ maxAttempts: 1 }),
    });
    await assert.rejects(client.fetchCandidates(), /arXiv 服务返回 HTTP 503/);
    assert.deepEqual(before, createState());
  } finally {
    await server.close();
  }
});

test("invalid Embedding response does not publish a partial generation", async () => {
  const state = createState();
  const before = structuredClone(state);
  const store: EmbeddingStore = {
    async ensureGeneration() {},
    async getCached() {
      return undefined;
    },
    async saveBatch() {
      state.checkpoint = { stage: "candidate-embedding", completed: 1 };
    },
    async publishGeneration() {
      state.checkpoint = { stage: "published", completed: 2 };
    },
  };
  const embeddingClient = new OpenAIEmbeddingClient({
    baseURL: "https://models.example.com/v1",
    apiKey: "secret",
    model: "broken",
    transport: new HttpTransport({
      fetch: async () =>
        new Response(
          JSON.stringify({ data: [{ index: 0, embedding: [NaN] }] }),
          {
            status: 200,
          },
        ),
    }),
  });

  await assert.rejects(
    new EmbeddingBatcher({ batchSize: 1 }).run({
      items: [
        {
          objectType: "paper",
          objectID: "new-paper",
          itemVersion: 1,
          title: "New paper",
          abstract: "Abstract",
        },
      ],
      generation: {
        generationID: "generation-1",
        model: "broken",
        dimensions: 2,
        normalized: true,
      },
      client: embeddingClient,
      store,
    }),
    (error: unknown) =>
      error instanceof NetworkRequestError &&
      error.code === "invalid-model-response",
  );
  assert.deepEqual(state, before);
});

test("disabled LLM is a local no-op failure and cannot change workspace state", async () => {
  const state = createState();
  const before = structuredClone(state);
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
    client.generateChineseSummary({ title: "Paper", abstract: "Abstract" }),
    (error: unknown) =>
      error instanceof NetworkRequestError && error.code === "llm-disabled",
  );
  assert.equal(calls, 0);
  assert.deepEqual(state, before);
});

test("invalid PDF content preserves core import state", () => {
  const state = createState();
  const before = structuredClone(state);
  assert.throws(
    () =>
      validatePdfResponse({
        requestedURL: "https://arxiv.org/pdf/2601.00001.pdf",
        status: 200,
        contentType: "text/html",
        bytes: new TextEncoder().encode("not a pdf"),
      }),
    /Content-Type/,
  );
  assert.deepEqual(state, before);
});

test("database migration failure restores profiles, items, feedback, and checkpoint", async () => {
  const database = new DurableStateDatabase(createState());
  const before = structuredClone(database.state);
  const migrations: Migration[] = [
    { version: 1, name: "initial", async up() {} },
    {
      version: 2,
      name: "injected-failure",
      async up(context) {
        await context.execute("mutate-state");
        throw new Error("injected database failure");
      },
    },
  ];
  await assert.rejects(
    new MigrationRunner(migrations).migrate(database),
    (error: unknown) => error instanceof MigrationError,
  );
  assert.deepEqual(database.state, before);
  assert.equal(database.version, 1);
});

test("no-change full-corpus run makes zero embedding requests", async () => {
  const items = [
    {
      objectType: "paper",
      objectID: "paper-1",
      itemVersion: 1,
      title: "Cached",
      abstract: "Cached abstract",
    },
  ];
  const generation = {
    generationID: "generation-1",
    model: "embedding",
    dimensions: 2,
    normalized: true,
  } as const;
  let requests = 0;
  const contentHash = createEmbeddingContentHash(items[0]);
  const store: EmbeddingStore = {
    async ensureGeneration() {},
    async getCached(_generationID, _objectType, _objectID, hash) {
      assert.equal(hash, contentHash);
      return [1, 0];
    },
    async saveBatch() {
      throw new Error("cached corpus must not save");
    },
    async publishGeneration() {},
  };
  const result = await new EmbeddingBatcher({ batchSize: 50 }).run({
    items,
    generation,
    client: {
      async embedDocuments() {
        requests += 1;
        throw new Error("must not request");
      },
    },
    store,
  });
  assert.equal(result.cacheHits, 1);
  assert.equal(result.requested, 0);
  assert.equal(requests, 0);
});

function createState(): DurableState {
  return {
    profiles: ["profile-v3"],
    savedItems: ["zotero-item-1"],
    feedback: ["feedback-1"],
    checkpoint: { stage: "scoring", completed: 5 },
  };
}

class DurableStateDatabase implements MigrationDatabase {
  version = 1;
  readonly state: DurableState;
  #backup?: { version: number; state: DurableState };

  constructor(state: DurableState) {
    this.state = state;
  }

  async getSchemaVersion(): Promise<number> {
    return this.version;
  }

  async setSchemaVersion(version: number): Promise<void> {
    this.version = version;
  }

  async createBackup(): Promise<string> {
    this.#backup = {
      version: this.version,
      state: structuredClone(this.state),
    };
    return "backup";
  }

  async restoreBackup(): Promise<void> {
    if (!this.#backup) throw new Error("missing backup");
    this.version = this.#backup.version;
    Object.assign(this.state, structuredClone(this.#backup.state));
  }

  async executeTransaction<T>(operation: () => Promise<T>): Promise<T> {
    const version = this.version;
    const state = structuredClone(this.state);
    try {
      return await operation();
    } catch (error) {
      this.version = version;
      Object.assign(this.state, state);
      throw error;
    }
  }

  async execute(sql: string): Promise<void> {
    if (sql === "mutate-state") {
      this.state.profiles = ["corrupt-profile"];
      this.state.savedItems = [];
      this.state.feedback = [];
      this.state.checkpoint = { stage: "corrupt", completed: 0 };
    }
  }
}
