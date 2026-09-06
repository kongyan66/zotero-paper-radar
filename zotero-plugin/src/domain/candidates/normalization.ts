export function normalizeDoi(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/doi\.org\//, "")
    .replace(/^doi:/, "")
    .replace(/[.,;]+$/, "");
}

export function normalizeCandidateURL(value: string): string {
  try {
    const url = new URL(value.trim());
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.hash = "";
    url.search = "";
    url.pathname = url.pathname.replace(/\/v\d+(?=\.pdf$|$)/i, "");
    return url.toString().replace(/\/$/, "");
  } catch {
    return value.trim().toLowerCase();
  }
}

export function normalizeCandidateTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/\bv\d+\s*$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function candidateTitleYearKey(title: string, date: string): string {
  const year = new Date(date).getUTCFullYear();
  return `${normalizeCandidateTitle(title)}:${Number.isFinite(year) ? year : "unknown"}`;
}
