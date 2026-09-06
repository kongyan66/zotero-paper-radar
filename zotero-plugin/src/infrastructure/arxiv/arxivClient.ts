import type { ArxivCandidate } from "../../domain/model";
import {
  formatArxivDate,
  resolveArxivDateWindow,
  type ArxivDateWindow,
} from "../../domain/candidates/dateWindow.ts";
import type { Clock } from "../../shared/clock.ts";
import { SystemClock } from "../../shared/clock.ts";
import {
  HttpTransport,
  validateServiceBaseURL,
} from "../network/httpTransport.ts";
import { parseArxivAtom } from "./atomParser.ts";

export const DEFAULT_ARXIV_CATEGORIES = ["cs.CV", "cs.CL"] as const;
export const DEFAULT_ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";

export interface ArxivQueryOptions {
  readonly categories?: readonly string[];
  readonly lastSuccessfulAt?: Date | string;
  readonly manualDays?: number;
  readonly maxResults?: number;
  readonly start?: number;
  readonly signal?: AbortSignal;
}

export interface ArxivFetchResult {
  readonly candidates: readonly ArxivCandidate[];
  readonly totalResults: number;
  readonly window: ArxivDateWindow;
  readonly requestURL: string;
  readonly latencyMs: number;
}

export class ArxivClient {
  readonly #transport: HttpTransport;
  readonly #endpoint: string;
  readonly #clock: Clock;

  constructor(
    options: {
      readonly transport?: HttpTransport;
      readonly endpoint?: string;
      readonly clock?: Clock;
    } = {},
  ) {
    const endpoint = options.endpoint ?? DEFAULT_ARXIV_ENDPOINT;
    this.#endpoint = validateServiceBaseURL(endpoint, true)
      .toString()
      .replace(/\/$/, "");
    this.#transport = options.transport ?? new HttpTransport();
    this.#clock = options.clock ?? new SystemClock();
  }

  async fetchCandidates(
    options: ArxivQueryOptions = {},
  ): Promise<ArxivFetchResult> {
    const categories = normalizeCategories(
      options.categories ?? DEFAULT_ARXIV_CATEGORIES,
    );
    if (!categories.length) throw new Error("至少需要一个 arXiv 分类");
    const window = resolveArxivDateWindow({
      lastSuccessfulAt: options.lastSuccessfulAt,
      manualDays: options.manualDays,
      clock: this.#clock,
    });
    const maxResults = clampInteger(options.maxResults ?? 100, 1, 2000);
    const start = clampInteger(options.start ?? 0, 0, 100_000);
    const query = categories.map((category) => `cat:${category}`).join(" OR ");
    const url = new URL(this.#endpoint);
    url.searchParams.set(
      "search_query",
      `(${query}) AND submittedDate:[${formatArxivDate(window.from)} TO ${formatArxivDate(window.to)}]`,
    );
    url.searchParams.set("start", String(start));
    url.searchParams.set("max_results", String(maxResults));
    url.searchParams.set("sortBy", "submittedDate");
    url.searchParams.set("sortOrder", "descending");
    const response = await this.#transport.requestText({
      url: url.toString(),
      serviceName: "arXiv 服务",
      headers: { Accept: "application/atom+xml" },
      maxResponseBytes: 8 * 1024 * 1024,
      signal: options.signal,
    });
    const feed = parseArxivAtom(response.data);
    return {
      candidates: feed.candidates,
      totalResults: feed.totalResults,
      window,
      requestURL: redactQueryURL(url),
      latencyMs: response.latencyMs,
    };
  }
}

function normalizeCategories(categories: readonly string[]): string[] {
  return [
    ...new Set(
      categories
        .map((value) => value.trim())
        .filter((value) => /^[a-z]+\.[A-Z]{2}$/.test(value)),
    ),
  ].sort();
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value))
    throw new RangeError("arXiv query values must be integers");
  return Math.min(maximum, Math.max(minimum, value));
}

function redactQueryURL(url: URL): string {
  return url.toString();
}
