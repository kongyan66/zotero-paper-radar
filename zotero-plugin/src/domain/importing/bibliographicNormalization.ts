export interface BibliographicIdentity {
  readonly arxivID?: string;
  readonly doi?: string;
  readonly url?: string;
  readonly title: string;
  readonly date?: string;
}

export function normalizeArxivIdentity(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  const urlMatch = normalized.match(
    /https?:\/\/(?:export\.)?arxiv\.org\/(?:abs|pdf)\/([^?#\s]+)/i,
  );
  const raw = (urlMatch?.[1] ?? normalized.replace(/^arxiv:\s*/i, ""))
    .replace(/\.pdf$/i, "")
    .replace(/v\d+$/i, "")
    .toLowerCase();
  return /^\d{4}\.\d{4,5}$/.test(raw) ||
    /^[a-z][a-z-]*(?:\.[a-z]{2})?\/\d{7}$/i.test(raw)
    ? raw
    : undefined;
}

export function normalizeDoiIdentity(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\/doi\.org\//, "")
      .replace(/^doi:/, "")
      .replace(/[.,;]+$/, "") || undefined
  );
}

export function normalizeBibliographicURL(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value.trim());
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    url.search = "";
    const arxivID = normalizeArxivIdentity(url.toString());
    if (url.hostname === "arxiv.org" && arxivID)
      return `https://arxiv.org/abs/${arxivID}`;
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().toLowerCase() || undefined;
  }
}

export function normalizeBibliographicTitle(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/\bv\d+\s*$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function titleYearIdentity(
  title: string,
  date: string | undefined,
): string | undefined {
  const year = date ? new Date(date).getUTCFullYear() : Number.NaN;
  return `${normalizeBibliographicTitle(title)}:${Number.isFinite(year) ? year : "unknown"}`;
}
