import assert from "node:assert/strict";
import test from "node:test";
import { HttpTransport } from "../../src/infrastructure/network/httpTransport.ts";

test("binary transport reads PDF chunks and reports progress", async () => {
  const chunks = [
    Uint8Array.from([0x25, 0x50]),
    Uint8Array.from([0x44, 0x46, 0x2d, 0x31]),
  ];
  const progress: number[] = [];
  const transport = new HttpTransport({
    maxAttempts: 1,
    fetch: async () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of chunks) controller.enqueue(chunk);
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    },
  });
  const response = await transport.requestBytes({
    url: "https://arxiv.org/pdf/2608.24845.pdf",
    maxResponseBytes: 1024,
    onProgress: (received) => progress.push(received),
  });
  assert.deepEqual([...response.data], [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
  assert.deepEqual(progress, [2, 6]);
  assert.equal(response.contentType, "application/pdf");
});

test("binary transport stops reading once the configured limit is exceeded", async () => {
  const transport = new HttpTransport({
    maxAttempts: 1,
    fetch: async () =>
      new Response(Uint8Array.from([1, 2, 3, 4, 5, 6]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      }),
  });
  await assert.rejects(
    transport.requestBytes({
      url: "https://arxiv.org/pdf/2608.24845.pdf",
      maxResponseBytes: 5,
    }),
    /超过 5 字节限制/,
  );
});
