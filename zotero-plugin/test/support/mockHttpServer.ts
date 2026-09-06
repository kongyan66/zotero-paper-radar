import { createServer, type Server } from "node:http";

export interface MockHTTPServer {
  readonly url: string;
  readonly requests: readonly string[];
  close(): Promise<void>;
}

export async function startMockHTTPServer(
  responseBody: string,
  options: { readonly status?: number; readonly contentType?: string } = {},
): Promise<MockHTTPServer> {
  const requests: string[] = [];
  const server: Server = createServer((request, response) => {
    requests.push(request.url ?? "/");
    response.statusCode = options.status ?? 200;
    response.setHeader(
      "content-type",
      options.contentType ?? "application/atom+xml",
    );
    response.end(responseBody);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Mock server did not bind");
  return {
    url: `http://127.0.0.1:${address.port}/api/query`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
