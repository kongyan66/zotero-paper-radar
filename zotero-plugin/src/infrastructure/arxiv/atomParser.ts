import type { ArxivCandidate } from "../../domain/model";

export interface ParsedAtomFeed {
  readonly totalResults: number;
  readonly startIndex: number;
  readonly itemsPerPage: number;
  readonly candidates: readonly ArxivCandidate[];
}

export function parseArxivAtom(xml: string): ParsedAtomFeed {
  if (!xml.trim()) {
    return { totalResults: 0, startIndex: 0, itemsPerPage: 0, candidates: [] };
  }
  const entries = [...xml.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gi)].map(
    (match) => match[1],
  );
  const candidates: ArxivCandidate[] = [];
  for (const entry of entries) {
    const id = normalizeArxivId(textOf(entry, "id"));
    const title = normalizeWhitespace(textOf(entry, "title"));
    const abstract = normalizeWhitespace(textOf(entry, "summary"));
    const submittedAt = parseDate(textOf(entry, "published"));
    if (!id || !title || !abstract || !submittedAt) continue;
    const version = parseVersion(id.rawId) ?? 1;
    const authors = [...entry.matchAll(/<author\b[^>]*>([\s\S]*?)<\/author>/gi)]
      .map((match) => normalizeWhitespace(textOf(match[1], "name")))
      .filter(Boolean);
    const categories = [...entry.matchAll(/<category\b([^>]*)\/?\s*>/gi)]
      .map((match) => attribute(match[1], "term"))
      .filter((value): value is string => Boolean(value));
    const doi = textOf(entry, "doi", true);
    const updatedAt = parseDate(textOf(entry, "updated", false));
    const links = [...entry.matchAll(/<link\b([^>]*)\/?\s*>/gi)].map(
      (match) => ({
        rel: attribute(match[1], "rel"),
        href: attribute(match[1], "href"),
        type: attribute(match[1], "type"),
        title: attribute(match[1], "title"),
      }),
    );
    const abstractUrl =
      links.find((link) => link.rel === "alternate")?.href ??
      `https://arxiv.org/abs/${id.baseId}`;
    const pdfUrl =
      links.find(
        (link) => link.type === "application/pdf" || link.title === "pdf",
      )?.href ?? `https://arxiv.org/pdf/${id.baseId}v${version}.pdf`;
    candidates.push({
      arxivId: id.baseId,
      version,
      title,
      abstract,
      authors,
      categories,
      submittedAt,
      ...(updatedAt ? { updatedAt } : {}),
      ...(doi ? { doi: normalizeDoi(doi) } : {}),
      abstractUrl,
      pdfUrl,
    });
  }
  return {
    totalResults:
      parseInteger(textOf(xml, "opensearch:totalResults")) ?? candidates.length,
    startIndex: parseInteger(textOf(xml, "opensearch:startIndex")) ?? 0,
    itemsPerPage:
      parseInteger(textOf(xml, "opensearch:itemsPerPage")) ?? candidates.length,
    candidates,
  };
}

export function normalizeArxivId(value: string):
  | {
      readonly baseId: string;
      readonly rawId: string;
    }
  | undefined {
  const decoded = decodeXml(value).trim();
  const urlMatch = decoded.match(
    /https?:\/\/(?:export\.)?arxiv\.org\/(?:abs|pdf)\/([^?#\s]+)/i,
  );
  const rawId = (urlMatch?.[1] ?? decoded.replace(/^arXiv:\s*/i, ""))
    .replace(/\.pdf$/i, "")
    .trim();
  if (!rawId) return undefined;
  const baseId = rawId.replace(/v\d+$/i, "");
  if (
    !/^\d{4}\.\d{4,5}$/.test(baseId) &&
    !/^[a-z][a-z-]*(?:\.[A-Z]{2})?\/\d{7}$/i.test(baseId)
  ) {
    return undefined;
  }
  return { baseId, rawId };
}

function textOf(xml: string, localName: string, optional = false): string {
  const escaped = localName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = xml.match(
    new RegExp(
      `<(?:(?:[\\w-]+):)?${escaped}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w-]+):)?${escaped}>`,
      "i",
    ),
  );
  if (!match) return optional ? "" : "";
  return decodeXml(match[1]);
}

function attribute(attributes: string, name: string): string | undefined {
  const match = attributes.match(
    new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"),
  );
  return match ? decodeXml(match[1]) : undefined;
}

function parseVersion(value: string): number | undefined {
  const match = value.match(/v(\d+)$/i);
  return match ? Number(match[1]) : undefined;
}

function parseDate(value: string): string | undefined {
  const date = new Date(value.trim());
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function parseInteger(value: string): number | undefined {
  const number = Number(value.trim());
  return Number.isInteger(number) && number >= 0 ? number : undefined;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeDoi(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\/doi\.org\//i, "")
    .replace(/^doi:/i, "");
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(/&#x([\da-f]+);/gi, (_, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    );
}
