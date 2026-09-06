import { createAbortController } from "./abortController.ts";

export type NetworkErrorCode =
  | "invalid-url"
  | "insecure-url"
  | "localhost-confirmation-required"
  | "request-cancelled"
  | "request-timeout"
  | "network-failure"
  | "http-error"
  | "response-too-large"
  | "invalid-json"
  | "invalid-model-response"
  | "empty-model-response"
  | "llm-disabled";

export interface NetworkDiagnostic {
  readonly code: NetworkErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly status?: number;
  readonly url?: string;
}

export class NetworkRequestError extends Error {
  public readonly code: NetworkErrorCode;
  public readonly retryable: boolean;
  public readonly status?: number;
  public readonly safeURL?: string;

  constructor(
    code: NetworkErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      status?: number;
      url?: string;
      cause?: unknown;
    } = {},
  ) {
    super(redactSensitiveText(message), { cause: options.cause });
    this.name = "NetworkRequestError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.status = options.status;
    this.safeURL = options.url ? redactURL(options.url) : undefined;
  }

  toDiagnostic(): NetworkDiagnostic {
    return {
      code: this.code,
      message: redactSensitiveText(this.message),
      retryable: this.retryable,
      status: this.status,
      url: this.safeURL,
    };
  }
}

export interface JSONRequest {
  readonly url: string;
  readonly serviceName?: string;
  readonly method?: "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs?: number;
  readonly maxResponseBytes?: number;
  readonly signal?: AbortSignal;
  readonly onProgress?: (receivedBytes: number, totalBytes?: number) => void;
}

export interface JSONResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly latencyMs: number;
}

export interface BinaryResponse {
  readonly data: Uint8Array;
  readonly status: number;
  readonly contentType: string;
  readonly finalURL: string;
  readonly latencyMs: number;
}

export type TextResponse = JSONResponse<string>;

interface HttpTransportOptions {
  readonly fetch?: typeof globalThis.fetch;
  readonly sleep?: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  readonly now?: () => number;
  readonly maxAttempts?: number;
  readonly baseDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly defaultTimeoutMs?: number;
  readonly defaultMaxResponseBytes?: number;
}

const SECRET_QUERY_PARAMETER = /(?:api[-_]?key|token|secret|authorization)/i;
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export function validateServiceBaseURL(
  value: string,
  allowInsecureLocalhost: boolean,
): URL {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new NetworkRequestError("invalid-url", "服务地址格式无效");
  }
  if (
    !url.hostname ||
    (url.protocol !== "https:" && url.protocol !== "http:")
  ) {
    throw new NetworkRequestError(
      "invalid-url",
      "服务地址必须使用 HTTP 或 HTTPS",
      { url: value },
    );
  }

  if (url.protocol === "http:") {
    if (!isLoopbackHost(url.hostname)) {
      throw new NetworkRequestError(
        "insecure-url",
        "远程模型服务必须使用 HTTPS",
        { url: value },
      );
    }
    if (!allowInsecureLocalhost) {
      throw new NetworkRequestError(
        "localhost-confirmation-required",
        "使用本机 HTTP 模型服务前需要明确确认",
        { url: value },
      );
    }
  }

  url.hash = "";
  url.search = "";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

export function redactSensitiveText(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"']+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[REDACTED]")
    .replace(
      /([?&](?:api[-_]?key|token|secret|authorization)=)[^&#\s]+/gi,
      "$1[REDACTED]",
    );
}

export function redactURL(value: string): string {
  try {
    const url = new URL(value);
    for (const name of [...url.searchParams.keys()]) {
      if (SECRET_QUERY_PARAMETER.test(name)) {
        url.searchParams.set(name, "[REDACTED]");
      }
    }
    return url.href;
  } catch {
    return redactSensitiveText(value);
  }
}

export class HttpTransport {
  private readonly fetchImplementation: typeof globalThis.fetch;
  private readonly sleepImplementation: (
    milliseconds: number,
    signal?: AbortSignal,
  ) => Promise<void>;
  private readonly now: () => number;
  private readonly maxAttempts: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxResponseBytes: number;

  constructor(options: HttpTransportOptions = {}) {
    this.fetchImplementation =
      options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleepImplementation = options.sleep ?? cancellableSleep;
    this.now = options.now ?? (() => Date.now());
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.baseDelayMs = Math.max(0, options.baseDelayMs ?? 400);
    this.maxDelayMs = Math.max(this.baseDelayMs, options.maxDelayMs ?? 4_000);
    this.defaultTimeoutMs = Math.max(
      1,
      options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    this.defaultMaxResponseBytes = Math.max(
      1,
      options.defaultMaxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES,
    );
  }

  async requestJSON<T>(request: JSONRequest): Promise<JSONResponse<T>> {
    return this.requestWithParser(request, (text) => {
      try {
        return JSON.parse(text) as T;
      } catch (error) {
        throw new NetworkRequestError(
          "invalid-json",
          `${request.serviceName ?? "远程服务"}返回的不是有效 JSON`,
          {
            url: request.url,
            cause: error,
          },
        );
      }
    });
  }

  async requestText(request: JSONRequest): Promise<TextResponse> {
    return this.requestWithParser(request, (text) => text);
  }

  async requestBytes(request: JSONRequest): Promise<BinaryResponse> {
    const startedAt = this.now();
    let lastError: NetworkRequestError | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchOnceBytes(request);
        return {
          data: response.bytes,
          status: response.status,
          contentType: response.contentType,
          finalURL: response.finalURL,
          latencyMs: Math.max(0, this.now() - startedAt),
        };
      } catch (error) {
        lastError = normalizeNetworkError(error, request.url);
        if (!lastError.retryable || attempt === this.maxAttempts)
          throw lastError;
        const delay = Math.min(
          this.maxDelayMs,
          this.baseDelayMs * 2 ** (attempt - 1),
        );
        await this.sleepImplementation(delay, request.signal);
      }
    }
    throw (
      lastError ?? new NetworkRequestError("network-failure", "网络请求失败")
    );
  }

  private async requestWithParser<T>(
    request: JSONRequest,
    parse: (text: string) => T,
  ): Promise<JSONResponse<T>> {
    const startedAt = this.now();
    let lastError: NetworkRequestError | undefined;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchOnce(request);
        return {
          data: parse(response.text),
          status: response.status,
          latencyMs: Math.max(0, this.now() - startedAt),
        };
      } catch (error) {
        lastError = normalizeNetworkError(error, request.url);
        if (!lastError.retryable || attempt === this.maxAttempts)
          throw lastError;
        const delay = Math.min(
          this.maxDelayMs,
          this.baseDelayMs * 2 ** (attempt - 1),
        );
        await this.sleepImplementation(delay, request.signal);
      }
    }
    throw (
      lastError ?? new NetworkRequestError("network-failure", "网络请求失败")
    );
  }

  private async fetchOnce(
    request: JSONRequest,
  ): Promise<{ readonly text: string; readonly status: number }> {
    const timeoutMs = Math.max(1, request.timeoutMs ?? this.defaultTimeoutMs);
    const controller = createAbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onExternalAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await this.fetchImplementation(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new NetworkRequestError(
          "http-error",
          `${request.serviceName ?? "远程服务"}返回 HTTP ${response.status}`,
          {
            retryable,
            status: response.status,
            url: request.url,
          },
        );
      }

      const maxBytes = Math.max(
        1,
        request.maxResponseBytes ?? this.defaultMaxResponseBytes,
      );
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new NetworkRequestError(
          "response-too-large",
          `模型响应超过 ${maxBytes} 字节限制`,
          { url: request.url },
        );
      }
      const text = await response.text();
      if (new TextEncoder().encode(text).byteLength > maxBytes) {
        throw new NetworkRequestError(
          "response-too-large",
          `模型响应超过 ${maxBytes} 字节限制`,
          { url: request.url },
        );
      }
      return { text, status: response.status };
    } catch (error) {
      if (controller.signal.aborted) {
        if (request.signal?.aborted && !timedOut) {
          throw new NetworkRequestError("request-cancelled", "请求已取消", {
            url: request.url,
            cause: error,
          });
        }
        throw new NetworkRequestError("request-timeout", "模型服务连接超时", {
          retryable: true,
          url: request.url,
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", onExternalAbort);
    }
  }

  private async fetchOnceBytes(request: JSONRequest): Promise<{
    readonly bytes: Uint8Array;
    readonly status: number;
    readonly contentType: string;
    readonly finalURL: string;
  }> {
    const timeoutMs = Math.max(1, request.timeoutMs ?? this.defaultTimeoutMs);
    const maxBytes = Math.max(
      1,
      request.maxResponseBytes ?? this.defaultMaxResponseBytes,
    );
    const controller = createAbortController();
    let timedOut = false;
    const onExternalAbort = () => controller.abort();
    request.signal?.addEventListener("abort", onExternalAbort, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await this.fetchImplementation(request.url, {
        method: request.method ?? "GET",
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new NetworkRequestError(
          "http-error",
          `${request.serviceName ?? "远程服务"}返回 HTTP ${response.status}`,
          { retryable, status: response.status, url: request.url },
        );
      }
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new NetworkRequestError(
          "response-too-large",
          `模型响应超过 ${maxBytes} 字节限制`,
          { url: request.url },
        );
      }
      const bytes = await readResponseBytes(
        response,
        maxBytes,
        declaredLength,
        request.onProgress,
      );
      return {
        bytes,
        status: response.status,
        contentType: response.headers.get("content-type") ?? "",
        finalURL: response.url || request.url,
      };
    } catch (error) {
      if (controller.signal.aborted) {
        if (request.signal?.aborted && !timedOut) {
          throw new NetworkRequestError("request-cancelled", "请求已取消", {
            url: request.url,
            cause: error,
          });
        }
        throw new NetworkRequestError("request-timeout", "模型服务连接超时", {
          retryable: true,
          url: request.url,
          cause: error,
        });
      }
      throw error;
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", onExternalAbort);
    }
  }
}

async function readResponseBytes(
  response: Response,
  maxBytes: number,
  declaredLength: number,
  onProgress?: (receivedBytes: number, totalBytes?: number) => void,
): Promise<Uint8Array> {
  const totalBytes = finiteLength(declaredLength);
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new NetworkRequestError(
        "response-too-large",
        `模型响应超过 ${maxBytes} 字节限制`,
      );
    }
    onProgress?.(bytes.byteLength, totalBytes);
    return bytes;
  }

  const body = response.body as unknown as {
    getReader(): ByteReader;
  };
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let receivedBytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      receivedBytes += chunk.value.byteLength;
      if (receivedBytes > maxBytes) {
        await reader.cancel();
        throw new NetworkRequestError(
          "response-too-large",
          `模型响应超过 ${maxBytes} 字节限制`,
        );
      }
      chunks.push(chunk.value);
      onProgress?.(receivedBytes, totalBytes);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(receivedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function finiteLength(value: number): number | undefined {
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

interface ByteReader {
  read(): Promise<{ readonly done: boolean; readonly value: Uint8Array }>;
  cancel(): Promise<void>;
  releaseLock(): void;
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1"
  );
}

function normalizeNetworkError(
  error: unknown,
  url: string,
): NetworkRequestError {
  if (error instanceof NetworkRequestError) return error;
  const message = error instanceof Error ? error.message : "网络请求失败";
  return new NetworkRequestError("network-failure", message, {
    retryable: true,
    url,
    cause: error,
  });
}

function cancellableSleep(
  milliseconds: number,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(
      new NetworkRequestError("request-cancelled", "请求已取消"),
    );
  }
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    };
    const timeout = setTimeout(finish, milliseconds);
    const onAbort = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      reject(new NetworkRequestError("request-cancelled", "请求已取消"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
